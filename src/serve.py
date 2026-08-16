"""HTTP inference service for glacial lake segmentation.

Wraps the trained hybrid model so the web dashboard can request real
segmentation masks instead of the mocked responses it previously used.

Run:
    .venv\\Scripts\\python.exe -m uvicorn serve:app --app-dir src --port 8000

Set GLOF_MODEL_PATH to point at a checkpoint (defaults to
notebooks/hybrid_model_v3_best.pth).

Endpoints:
    GET  /health   model status
    POST /predict  multipart upload of an 8-band GeoTIFF -> mask as GeoJSON
"""

from __future__ import annotations

import io
import os
import time
from itertools import product

import numpy as np
import rasterio
import rasterio.features
import rasterio.warp
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from model import N_CHANNELS, check_band_layout, load_hybrid_model, mc_dropout_predict, normalize_stack
from water_index import detect_water


def detect_layout(sample: np.ndarray) -> dict:
    """Work out which band layout an uploaded stack uses.

    Two layouts exist in this project and they are not interchangeable:

      "model"   [Green, Red, NIR, SWIR, DEM, slope, aspect, NDWI]
                what the hybrid network was trained on
      "indices" [4 spectral indices, Green, Red, NIR, SWIR]
                what the published LISS3_*_input_stack.tif files contain

    They are told apart by range: indices lie in [-1, 1] while reflectance is
    non-negative and much larger.

    Returns a dict with the layout name and the index of each usable band,
    using None where a band is absent.
    """
    lo = np.array([np.nanmin(b) for b in sample], dtype=float)
    hi = np.array([np.nanmax(b) for b in sample], dtype=float)
    index_like = (lo >= -1.05) & (hi <= 1.05)

    if index_like[:4].all() and not index_like[4:].any():
        return {
            "layout": "indices",
            "green": 4, "red": 5, "nir": 6, "swir": 7,
            "dem": None, "slope": None, "ndwi": 3,
        }
    if not index_like[:4].any():
        return {
            "layout": "model",
            "green": 0, "red": 1, "nir": 2, "swir": 3,
            "dem": 4, "slope": 5, "ndwi": 7,
        }
    return {
        "layout": "unknown",
        "green": 0, "red": 1, "nir": 2, "swir": 3,
        "dem": None, "slope": None, "ndwi": None,
    }

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_MODEL = os.path.join(REPO_ROOT, "notebooks", "hybrid_model_v3_best.pth")
MODEL_PATH = os.environ.get("GLOF_MODEL_PATH", DEFAULT_MODEL)
DEVICE = os.environ.get("GLOF_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")

# Guard against a huge upload exhausting memory on a laptop-class machine.
MAX_UPLOAD_BYTES = int(os.environ.get("GLOF_MAX_UPLOAD_MB", "512")) * 1024 * 1024
MAX_PIXELS = int(os.environ.get("GLOF_MAX_PIXELS", str(120_000_000)))

app = FastAPI(title="Glacial Lake Segmentation", version="1.0")

# The dashboard is served from a different port in development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("GLOF_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_model = None
_load_error: str | None = None


def get_model():
    """Load the checkpoint once and reuse it across requests."""
    global _model, _load_error
    if _model is None and _load_error is None:
        try:
            _model = load_hybrid_model(MODEL_PATH, device=DEVICE)
        except Exception as exc:  # surfaced through /health and /predict
            _load_error = f"{type(exc).__name__}: {exc}"
    if _load_error:
        raise HTTPException(status_code=503, detail=f"Model unavailable — {_load_error}")
    return _model


@app.get("/health")
def health():
    status = {
        "modelPath": MODEL_PATH,
        "modelPresent": os.path.exists(MODEL_PATH),
        "device": DEVICE,
        "expectedChannels": N_CHANNELS,
    }
    try:
        get_model()
        status["status"] = "ready"
    except HTTPException as exc:
        status["status"] = "error"
        status["detail"] = exc.detail
        return JSONResponse(status.copy(), status_code=503)
    return status


def _segment_indices(src, layout, params):
    """Detect water with spectral indices, tiled to bound memory use."""
    width, height = src.width, src.height
    mask = np.zeros((height, width), dtype=np.uint8)
    full = rasterio.windows.Window(0, 0, width, height)
    tile = 1024

    for row_off in range(0, height, tile):
        for col_off in range(0, width, tile):
            window = rasterio.windows.Window(col_off, row_off, tile, tile).intersection(full)
            data = src.read(window=window).astype(np.float32)
            if data.shape[1] == 0 or data.shape[2] == 0:
                continue

            def band(key):
                idx = layout.get(key)
                return data[idx] if idx is not None else None

            sub, _ = detect_water(
                green=data[layout["green"]],
                red=data[layout["red"]],
                nir=data[layout["nir"]],
                swir=data[layout["swir"]],
                dem=band("dem"),
                slope=band("slope"),
                ndwi_threshold=params["ndwi_threshold"],
                mndwi_threshold=params["mndwi_threshold"],
                max_slope_deg=params["max_slope_deg"],
                min_elevation_m=params["min_elevation_m"],
                min_pixels=params["min_pixels"],
            )
            mask[row_off : row_off + sub.shape[0], col_off : col_off + sub.shape[1]] = sub
    return mask, None


def _segment(src, model, patch_size: int, threshold: float, mc_passes: int):
    """Tile across the raster, predict, and stitch mask + uncertainty."""
    width, height = src.width, src.height
    mask = np.zeros((height, width), dtype=np.uint8)
    uncertainty = np.zeros((height, width), dtype=np.float32) if mc_passes >= 2 else None

    full = rasterio.windows.Window(0, 0, width, height)
    offsets = product(range(0, width, patch_size), range(0, height, patch_size))

    for col_off, row_off in offsets:
        window = rasterio.windows.Window(
            col_off=col_off, row_off=row_off, width=patch_size, height=patch_size
        ).intersection(full)

        tile = src.read(window=window).astype(np.float32)
        if tile.shape[1] == 0 or tile.shape[2] == 0:
            continue

        th, tw = tile.shape[1], tile.shape[2]
        norm = normalize_stack(tile)
        if th < patch_size or tw < patch_size:
            norm = np.pad(norm, ((0, 0), (0, patch_size - th), (0, patch_size - tw)), mode="reflect")

        tensor = torch.from_numpy(norm).unsqueeze(0).to(DEVICE)

        if mc_passes >= 2:
            mean, std = mc_dropout_predict(model, tensor, n_passes=mc_passes)
            probs, unc = mean[0, 0], std[0, 0]
            uncertainty[row_off : row_off + th, col_off : col_off + tw] = unc[:th, :tw]
        else:
            with torch.no_grad():
                probs = torch.sigmoid(model(tensor))[0, 0].cpu().numpy()

        mask[row_off : row_off + th, col_off : col_off + tw] = (probs > threshold).astype(np.uint8)[:th, :tw]

    return mask, uncertainty


def _mask_to_features(mask, src, uncertainty, min_area_m2: float):
    """Vectorise the mask and reproject each polygon to EPSG:4326."""
    features = []
    # Approximate pixel area in m2. For a geographic CRS, convert degrees using
    # the latitude of the raster centre so the area filter stays meaningful.
    transform = src.transform
    if src.crs and src.crs.is_geographic:
        centre_lat = src.bounds.bottom + (src.bounds.top - src.bounds.bottom) / 2
        m_per_deg_lat = 110_574.0
        m_per_deg_lon = 111_320.0 * float(np.cos(np.radians(centre_lat)))
        pixel_area = abs(transform.a * m_per_deg_lon) * abs(transform.e * m_per_deg_lat)
    else:
        pixel_area = abs(transform.a * transform.e)

    for geom, value in rasterio.features.shapes(mask, mask=mask.astype(bool), transform=transform):
        if value != 1:
            continue
        # Ring areas in pixel units, via the shoelace formula on the exterior.
        ring = np.asarray(geom["coordinates"][0])
        px_area = 0.5 * abs(
            np.dot(ring[:, 0], np.roll(ring[:, 1], 1)) - np.dot(ring[:, 1], np.roll(ring[:, 0], 1))
        )
        # px_area is already in CRS units squared because transform was applied.
        area_m2 = px_area * (pixel_area / abs(transform.a * transform.e))
        if area_m2 < min_area_m2:
            continue

        if src.crs and src.crs.to_epsg() != 4326:
            geom = rasterio.warp.transform_geom(src.crs, "EPSG:4326", geom, precision=6)

        features.append(
            {
                "type": "Feature",
                "properties": {"area_ha": round(area_m2 / 10_000, 4)},
                "geometry": geom,
            }
        )

    features.sort(key=lambda f: -f["properties"]["area_ha"])
    for i, f in enumerate(features, 1):
        f["properties"]["lake_id"] = f"AI-{i:04d}"
    return features


@app.post("/predict")
async def predict(
    file: UploadFile = File(...),
    method: str = Form("indices"),
    threshold: float = Form(0.5),
    patch_size: int = Form(256),
    mc_passes: int = Form(0),
    min_area_ha: float = Form(0.05),
    ndwi_threshold: float = Form(0.15),
    mndwi_threshold: float = Form(0.10),
    max_slope_deg: float = Form(15.0),
    min_elevation_m: float = Form(0.0),
):
    """Segment an uploaded 8-band GeoTIFF and return lake polygons as GeoJSON.

    method="indices" uses NDWI/MNDWI/AWEI with terrain constraints and works on
    either stack layout. method="model" runs the trained hybrid network, which
    requires the [optical, DEM, slope, aspect, NDWI] layout.
    """
    if method not in ("indices", "model"):
        raise HTTPException(400, f"method must be 'indices' or 'model', got {method!r}")
    if not 0.0 < threshold < 1.0:
        raise HTTPException(400, f"threshold must be between 0 and 1, got {threshold}")
    if patch_size % 32:
        raise HTTPException(400, f"patch_size must be a multiple of 32, got {patch_size}")
    if mc_passes == 1:
        raise HTTPException(400, "mc_passes must be 0 or >= 2; one pass has no spread")

    payload = await file.read()
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Upload exceeds {MAX_UPLOAD_BYTES // (1024*1024)} MB")

    started = time.perf_counter()

    try:
        with rasterio.open(io.BytesIO(payload)) as src:
            if src.count != N_CHANNELS:
                raise HTTPException(
                    400, f"Expected {N_CHANNELS} bands, got {src.count}."
                )
            if src.width * src.height > MAX_PIXELS:
                raise HTTPException(
                    413, f"Raster has {src.width * src.height:,} pixels, limit is {MAX_PIXELS:,}"
                )

            # Sample a window to work out the layout before reading everything.
            probe_win = rasterio.windows.Window(
                0, 0, min(src.width, 512), min(src.height, 512)
            )
            layout = detect_layout(src.read(window=probe_win).astype(np.float32))
            if layout["layout"] == "unknown":
                raise HTTPException(
                    400,
                    "Could not identify the band layout. Expected either "
                    "[Green, Red, NIR, SWIR, DEM, slope, aspect, NDWI] or "
                    "[4 indices, Green, Red, NIR, SWIR].",
                )

            if method == "model":
                if layout["layout"] != "model":
                    raise HTTPException(
                        400,
                        f"The hybrid model needs the [optical, DEM, slope, aspect, NDWI] "
                        f"layout, but this file uses the '{layout['layout']}' layout. "
                        f"Use method=indices for this file.",
                    )
                model = get_model()
                mask, uncertainty = _segment(src, model, patch_size, threshold, mc_passes)
            else:
                mask, uncertainty = _segment_indices(
                    src,
                    layout,
                    {
                        "ndwi_threshold": ndwi_threshold,
                        "mndwi_threshold": mndwi_threshold,
                        "max_slope_deg": max_slope_deg,
                        "min_elevation_m": min_elevation_m or None,
                        "min_pixels": 8,
                    },
                )
            features = _mask_to_features(mask, src, uncertainty, min_area_ha * 10_000)

            bounds = src.bounds
            if src.crs and src.crs.to_epsg() != 4326:
                left, bottom, right, top = rasterio.warp.transform_bounds(
                    src.crs, "EPSG:4326", *bounds
                )
            else:
                left, bottom, right, top = bounds

            stats = {
                "method": method,
                "bandLayout": layout["layout"],
                "lakeCount": len(features),
                "totalAreaHa": round(sum(f["properties"]["area_ha"] for f in features), 4),
                "lakePixels": int(mask.sum()),
                "totalPixels": int(mask.size),
                "coveragePercent": round(100 * float(mask.mean()), 4),
                "processingSeconds": round(time.perf_counter() - started, 2),
                "threshold": threshold if method == "model" else ndwi_threshold,
                "mcPasses": mc_passes if method == "model" else 0,
                "device": DEVICE,
                "rasterSize": [src.width, src.height],
                "crs": str(src.crs) if src.crs else None,
                "bounds": [left, bottom, right, top],
            }
            if uncertainty is not None:
                lake = mask.astype(bool)
                stats["meanUncertainty"] = round(float(uncertainty.mean()), 5)
                stats["meanUncertaintyOverLakes"] = (
                    round(float(uncertainty[lake].mean()), 5) if lake.any() else None
                )
    except HTTPException:
        raise
    except rasterio.errors.RasterioIOError as exc:
        raise HTTPException(400, f"Could not read the upload as a GeoTIFF: {exc}") from exc

    return {
        "polygons": {"type": "FeatureCollection", "features": features},
        "stats": stats,
    }
