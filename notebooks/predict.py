"""Tiled inference over a large 8-band GeoTIFF using the hybrid segmentation model.

Example:
    python notebooks/predict.py \
        --model notebooks/hybrid_model_best.pth \
        --input data/LISS3/processed/LISS3_9_input_stack.tif \
        --output notebooks/Output/LISS3_9_predicted_mask.tif \
        --chunk-dir notebooks/Output/chunks

Run with --help for all options.
"""

from __future__ import annotations

import argparse
import os
import sys
from itertools import product

import matplotlib

matplotlib.use("Agg")  # no display needed when only writing PNGs

import matplotlib.pyplot as plt
import numpy as np
import rasterio
import torch
from tqdm import tqdm

# Make src/ importable when running this file directly from anywhere.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

from model import (  # noqa: E402
    N_CHANNELS,
    load_hybrid_model,
    mc_dropout_predict,
    normalize_stack,
)


# =================================================================== #
#                          VISUALISATION HELPERS
# =================================================================== #


def stretch_for_display(band_array):
    """Percentile contrast stretch on an (H, W, 3) array for visualisation."""
    stretched = np.zeros_like(band_array, dtype=np.float32)
    for i in range(3):
        p2, p98 = np.percentile(band_array[:, :, i], (2, 98))
        if p98 - p2 > 1e-6:
            stretched[:, :, i] = (band_array[:, :, i] - p2) / (p98 - p2)
    return np.clip(stretched, 0, 1)


def save_tile_with_mask(tile, pred_mask, output_path, alpha=0.4):
    """Write a false-colour PNG of ``tile`` with ``pred_mask`` overlaid in red.

    Args:
        tile: raw (unnormalised) tile, shape (C, H, W), cropped to the mask size.
        pred_mask: binary mask, shape (H, W).
        output_path: destination PNG path.
        alpha: overlay transparency.
    """
    # NIR/Red/Green false colour from bands 2, 1, 0.
    rgb_tile = tile[[2, 1, 0], :, :].transpose(1, 2, 0)
    rgb_tile = stretch_for_display(rgb_tile)

    fig, ax = plt.subplots(figsize=(5, 5))
    ax.imshow(rgb_tile)

    mask_rgba = np.zeros((pred_mask.shape[0], pred_mask.shape[1], 4))
    mask_rgba[pred_mask == 1] = [1, 0, 0, alpha]
    ax.imshow(mask_rgba)

    ax.axis("off")
    plt.savefig(output_path, bbox_inches="tight", pad_inches=0, dpi=100)
    plt.close(fig)


# =================================================================== #
#                              INFERENCE
# =================================================================== #


def predict_large_image(
    model,
    device,
    input_image_path,
    output_mask_path,
    chunk_output_dir=None,
    patch_size=256,
    threshold=0.5,
    mc_passes=0,
    uncertainty_path=None,
):
    """Run tiled inference across a large GeoTIFF and write a stitched mask.

    When ``mc_passes`` is 2 or more, each tile is predicted with Monte Carlo
    dropout and a pixel-wise uncertainty raster is written to
    ``uncertainty_path`` alongside the binary mask.
    """
    if chunk_output_dir:
        os.makedirs(chunk_output_dir, exist_ok=True)

    output_parent = os.path.dirname(os.path.abspath(output_mask_path))
    if output_parent:
        os.makedirs(output_parent, exist_ok=True)

    with rasterio.open(input_image_path) as src:
        width, height = src.width, src.height
        profile = src.profile

        if src.count != N_CHANNELS:
            raise ValueError(
                f"{input_image_path} has {src.count} bands, expected {N_CHANNELS}."
            )

        mask_profile = dict(profile)
        mask_profile.update(count=1, dtype="uint8", compress="lzw", nodata=None)
        stitched_prediction = np.zeros((height, width), dtype=np.uint8)

        use_mc = mc_passes >= 2
        stitched_uncertainty = np.zeros((height, width), dtype=np.float32) if use_mc else None
        if use_mc:
            unc_profile = dict(profile)
            unc_profile.update(count=1, dtype="float32", compress="lzw", nodata=None)
            print(f"Monte Carlo dropout enabled: {mc_passes} passes per tile.")

        print(f"Processing image of size ({width}, {height}) in {patch_size}x{patch_size} tiles...")

        offsets = product(range(0, width, patch_size), range(0, height, patch_size))
        total_chunks = ((width + patch_size - 1) // patch_size) * (
            (height + patch_size - 1) // patch_size
        )

        detections = 0
        full_window = rasterio.windows.Window(0, 0, width, height)

        for col_off, row_off in tqdm(offsets, total=total_chunks, desc="Predicting on tiles"):
            window = rasterio.windows.Window(
                col_off=col_off, row_off=row_off, width=patch_size, height=patch_size
            ).intersection(full_window)

            tile = src.read(window=window).astype(np.float32)
            if tile.shape[1] == 0 or tile.shape[2] == 0:
                continue

            tile_height, tile_width = tile.shape[1], tile.shape[2]

            # Normalise BEFORE padding so reflected edges do not skew the scaling.
            # normalize_stack returns a new array, leaving `tile` raw for the PNG.
            normalized_tile = normalize_stack(tile)

            if tile_height < patch_size or tile_width < patch_size:
                normalized_tile = np.pad(
                    normalized_tile,
                    ((0, 0), (0, patch_size - tile_height), (0, patch_size - tile_width)),
                    mode="reflect",
                )

            tile_tensor = torch.from_numpy(normalized_tile).unsqueeze(0).to(device)

            if use_mc:
                mean_probs, std_probs = mc_dropout_predict(model, tile_tensor, n_passes=mc_passes)
                prob_map = mean_probs[0, 0]
                uncertainty = std_probs[0, 0]
            else:
                with torch.no_grad():
                    prob_map = torch.sigmoid(model(tile_tensor))[0, 0].cpu().numpy()
                uncertainty = None

            pred_mask = (prob_map > threshold).astype(np.uint8)

            # Discard the padded region so the mask matches the source window.
            pred_mask = pred_mask[:tile_height, :tile_width]
            if uncertainty is not None:
                stitched_uncertainty[
                    row_off : row_off + tile_height, col_off : col_off + tile_width
                ] = uncertainty[:tile_height, :tile_width]

            if np.any(pred_mask):
                detections += 1
                if chunk_output_dir:
                    chunk_path = os.path.join(
                        chunk_output_dir, f"tile_{row_off}_{col_off}_mask.png"
                    )
                    # Pass the raw, unpadded tile so the overlay lines up.
                    save_tile_with_mask(tile, pred_mask, chunk_path)

            stitched_prediction[
                row_off : row_off + tile_height, col_off : col_off + tile_width
            ] = pred_mask

    print(f"Saving stitched mask to {output_mask_path} ...")
    with rasterio.open(output_mask_path, "w", **mask_profile) as dst:
        dst.write(stitched_prediction, 1)

    if use_mc:
        if not uncertainty_path:
            base, ext = os.path.splitext(output_mask_path)
            uncertainty_path = f"{base}_uncertainty{ext}"
        print(f"Saving uncertainty map to {uncertainty_path} ...")
        with rasterio.open(uncertainty_path, "w", **unc_profile) as dst:
            dst.write(stitched_uncertainty, 1)

    lake_pixels = int(stitched_prediction.sum())
    print(
        f"Done. {detections} tile(s) contained detections; "
        f"{lake_pixels:,} lake pixels total."
    )
    if use_mc:
        print(
            f"Uncertainty: mean {stitched_uncertainty.mean():.4f}, "
            f"max {stitched_uncertainty.max():.4f} (std-dev across {mc_passes} passes)."
        )
    return stitched_prediction, stitched_uncertainty


# =================================================================== #
#                                  CLI
# =================================================================== #


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Tiled glacial lake segmentation over a large GeoTIFF.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--model", required=True, help="Path to the trained .pth checkpoint")
    parser.add_argument("--input", required=True, help="Input 8-band GeoTIFF stack")
    parser.add_argument("--output", required=True, help="Destination for the predicted mask")
    parser.add_argument(
        "--chunk-dir",
        default=None,
        help="Optional directory for per-tile PNG previews of detections",
    )
    parser.add_argument("--patch-size", type=int, default=256, help="Tile size (multiple of 32)")
    parser.add_argument(
        "--threshold", type=float, default=0.5, help="Probability threshold for a lake pixel"
    )
    parser.add_argument(
        "--device",
        default="cuda" if torch.cuda.is_available() else "cpu",
        help="Torch device to run on",
    )
    parser.add_argument(
        "--mc-passes",
        type=int,
        default=0,
        help="Monte Carlo dropout passes per tile; 0 disables, 2+ writes an uncertainty map",
    )
    parser.add_argument(
        "--uncertainty-output",
        default=None,
        help="Where to write the uncertainty map (defaults to <output>_uncertainty.tif)",
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)

    if args.patch_size % 32:
        raise SystemExit(f"--patch-size must be a multiple of 32, got {args.patch_size}")
    if args.mc_passes == 1:
        raise SystemExit("--mc-passes must be 0 (disabled) or >= 2; a single pass has no spread")
    for path, label in ((args.model, "Model"), (args.input, "Input image")):
        if not os.path.exists(path):
            raise SystemExit(f"{label} not found: {path}")

    print(f"Loading model on {args.device} ...")
    model = load_hybrid_model(args.model, device=args.device)
    print("Model loaded.")

    predict_large_image(
        model=model,
        device=args.device,
        input_image_path=args.input,
        output_mask_path=args.output,
        chunk_output_dir=args.chunk_dir,
        patch_size=args.patch_size,
        threshold=args.threshold,
        mc_passes=args.mc_passes,
        uncertainty_path=args.uncertainty_output,
    )


if __name__ == "__main__":
    main()
