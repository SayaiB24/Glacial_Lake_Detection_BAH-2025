import os
import torch
import rasterio
import numpy as np
from tqdm import tqdm
import segmentation_models_pytorch as smp
from itertools import product
import matplotlib.pyplot as plt
from matplotlib import cm

# =================================================================== #
#                       UTILITY FUNCTIONS
# =================================================================== #

def normalize_tile(tile):
    """Applies the exact same normalization as the GlacialLakeDataset."""
    # LISS-3 Bands and Indices
    tile[:4, :, :] /= 1023.0
    # Indices (e.g., NDWI) assumed to be in [-1, 1], scaled to [0, 1]
    tile[4:, :, :] = (tile[4:, :, :] + 1.0) / 2.0
    # Clip all values to ensure they are in the [0, 1] range
    tile = np.clip(tile, 0.0, 1.0)
    return tile

def stretch_for_display(band_array):
    """Performs percentile contrast stretching on a 3-band numpy array for visualization."""
    stretched_array = np.zeros_like(band_array, dtype=np.float32)
    for i in range(3):
        p2, p98 = np.percentile(band_array[:, :, i], (2, 98))
        if p98 - p2 > 1e-6:  # Avoid division by zero
            stretched_array[:, :, i] = (band_array[:, :, i] - p2) / (p98 - p2)
    return np.clip(stretched_array, 0, 1)

def save_tile_with_mask(tile, pred_mask, output_path, alpha=0.4):
    """
    Saves a PNG of the input tile with the predicted mask overlaid.
    
    Args:
        tile: Input tile (numpy array, shape: [channels, height, width]).
        pred_mask: Predicted binary mask (numpy array, shape: [height, width]).
        output_path: Path to save the PNG.
        alpha: Transparency of the mask overlay.
    """
    # Create false-color RGB image (using bands 2, 1, 0 for NIR, Red, Green)
    rgb_tile = tile[[2, 1, 0], :, :].transpose(1, 2, 0)  # Shape: [height, width, 3]
    rgb_tile = stretch_for_display(rgb_tile)  # Stretch for better visualization
    
    # Create figure
    fig, ax = plt.subplots(figsize=(5, 5))
    ax.imshow(rgb_tile)
    
    # Overlay mask (red where pred_mask == 1)
    mask_rgba = np.zeros((pred_mask.shape[0], pred_mask.shape[1], 4))
    mask_rgba[pred_mask == 1] = [1, 0, 0, alpha]  # Red with transparency
    ax.imshow(mask_rgba)
    
    ax.axis('off')
    plt.savefig(output_path, bbox_inches='tight', pad_inches=0, dpi=100)
    plt.close(fig)

def predict_large_image(model, device, input_image_path, output_mask_path, chunk_output_dir, patch_size=256, threshold=0.5):
    """
    Reads a large GeoTIFF, runs inference tile by tile, saves the stitched mask,
    and saves PNGs for tiles where lakes are detected.
    
    Args:
        model: Trained segmentation model.
        device: Device to run inference on ('cuda' or 'cpu').
        input_image_path: Path to the input GeoTIFF.
        output_mask_path: Path to save the stitched predicted mask.
        chunk_output_dir: Directory to save PNGs of tiles with lake detections.
        patch_size: Size of each tile (must be divisible by 32).
        threshold: Probability threshold for binarizing predictions.
    """
    # Create output directory for chunk PNGs
    os.makedirs(chunk_output_dir, exist_ok=True)
    
    # --- 1. Open the large image and prepare the output array ---
    with rasterio.open(input_image_path) as src:
        width, height = src.width, src.height
        profile = src.profile
        
        # Update profile for a single-band (mask) output
        profile.update(count=1, dtype='uint8', compress='lzw')
        
        # Create an empty array to store the stitched prediction
        stitched_prediction = np.zeros((height, width), dtype=np.uint8)
        
        print(f"Processing image of size ({width}, {height}) with {patch_size}x{patch_size} tiles...")

        # --- 2. Create the grid of tiles to process ---
        offsets = product(range(0, width, patch_size), range(0, height, patch_size))
        total_chunks = ((width + patch_size - 1) // patch_size) * ((height + patch_size - 1) // patch_size)

        # --- 3. Iterate through tiles, preprocess, predict, and stitch ---
        for col_off, row_off in tqdm(offsets, total=total_chunks, desc="Predicting on tiles"):
            window = rasterio.windows.Window(
                col_off=col_off, row_off=row_off, width=patch_size, height=patch_size
            ).intersection(rasterio.windows.Window(0, 0, width, height))
            
            tile = src.read(window=window).astype(np.float32)
            
            # Skip empty or invalid tiles
            if tile.shape[1] == 0 or tile.shape[2] == 0:
                continue

            # Check number of channels
            if tile.shape[0] != 8:
                print(f"Warning: Tile at ({row_off}, {col_off}) has {tile.shape[0]} channels, expected 8. Skipping.")
                continue

            # Get original tile dimensions
            tile_height, tile_width = tile.shape[1], tile.shape[2]
            
            # Pad tile if necessary to make it patch_size x patch_size
            if tile_height < patch_size or tile_width < patch_size:
                pad_h = patch_size - tile_height
                pad_w = patch_size - tile_width
                tile = np.pad(
                    tile,
                    ((0, 0), (0, pad_h), (0, pad_w)),
                    mode='reflect'
                )
            
            # Preprocess the tile
            normalized_tile = normalize_tile(tile)
            
            # Convert to tensor and add batch dimension
            tile_tensor = torch.from_numpy(normalized_tile).unsqueeze(0).to(device)
            
            # Verify tile dimensions
            if tile_tensor.shape[2:] != (patch_size, patch_size):
                raise RuntimeError(
                    f"Tile shape {tile_tensor.shape[2:]} not divisible by 32. "
                    f"Expected ({patch_size}, {patch_size})."
                )
            
            # Run prediction
            with torch.no_grad():
                logits = model(tile_tensor)
                probs = torch.sigmoid(logits)
                pred_mask = (probs > threshold).cpu().squeeze().numpy().astype(np.uint8)
            
            # Crop the predicted mask back to the original tile size
            pred_mask = pred_mask[:tile_height, :tile_width]
            
            # Save PNG if lake is detected (non-zero mask)
            if np.any(pred_mask):
                chunk_output_path = os.path.join(chunk_output_dir, f"tile_{row_off}_{col_off}_mask.png")
                save_tile_with_mask(tile, pred_mask, chunk_output_path)
                print(f"Saved lake detection PNG at: {chunk_output_path}")
            
            # Place the predicted mask into the correct location in the stitched array
            stitched_prediction[window.row_off:window.row_off + window.height, 
                               window.col_off:window.col_off + window.width] = pred_mask

    # --- 4. Save the final stitched mask ---
    print(f"Saving final stitched mask to {output_mask_path}...")
    with rasterio.open(output_mask_path, 'w', **profile) as dst:
        dst.write(stitched_prediction, 1)
        
    print("✅ Prediction complete!")

# =================================================================== #
#                         HOW TO RUN
# =================================================================== #
if __name__ == '__main__':
    # --- Configuration ---
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    MODEL_PATH = r"C:\Users\Rochan\Desktop\Coding\Glacial_Lale_Detection_BAH-2025\notebooks\unetplusplus_efficientnet-b4_v5.pth"
    PATCH_SIZE = 256
    PREDICTION_THRESHOLD = 0.5  # Use the optimal threshold if known
    CHUNK_OUTPUT_DIR = r"C:\Users\Rochan\Desktop\Coding\Glacial_Lale_Detection_BAH-2025\notebooks\Output\chunks"

    # --- Define input and output paths ---
    INPUT_IMAGE_PATH = r"C:\Users\Rochan\Desktop\Coding\Glacial_Lale_Detection_BAH-2025\data\LISS3\processed\LISS3_9_input_stack.tif"
    OUTPUT_MASK_PATH = r"C:\Users\Rochan\Desktop\Coding\Glacial_Lale_Detection_BAH-2025\notebooks\Output\LISS3_9_predicted_mask.tif"

    # --- Load the Model ---
    print("Loading model...")
    model = smp.UnetPlusPlus(
        encoder_name="efficientnet-b4",
        encoder_weights=None,
        in_channels=8,
        classes=1,
    )
    model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE, weights_only=True))
    model.to(DEVICE)
    model.eval()
    print("✅ Model loaded.")

    # --- Run Prediction ---
    predict_large_image(
        model=model,
        device=DEVICE,
        input_image_path=INPUT_IMAGE_PATH,
        output_mask_path=OUTPUT_MASK_PATH,
        chunk_output_dir=CHUNK_OUTPUT_DIR,
        patch_size=PATCH_SIZE,
        threshold=PREDICTION_THRESHOLD
    )