"""Spectral-index glacial lake detection.

A physically-grounded alternative to the learned model, using the water indices
the project already relies on elsewhere. It needs only optical bands plus, where
available, terrain, so it runs on imagery the hybrid model cannot currently be
trusted on.

Water is dark in NIR and SWIR and relatively bright in green, which is what NDWI
and MNDWI capture. Snow and ice also suppress NIR, so NDSI and a slope
constraint are used to separate lakes from snowfields, and lakes are flat while
snow lies on slopes.

References:
    McFeeters (1996), Int. J. Remote Sensing 17(7):1425-1432   (NDWI)
    Xu (2006), Int. J. Remote Sensing 27(14):3025-3033          (MNDWI)
    Feyisa et al. (2014), Remote Sensing of Environment 140:23-35 (AWEI)
"""

from __future__ import annotations

import numpy as np

try:  # optional; only needed for morphological cleanup
    from scipy import ndimage
except ImportError:  # pragma: no cover
    ndimage = None


def _nd(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Normalised difference (a - b) / (a + b), zero where the sum vanishes."""
    denom = a + b
    out = np.zeros_like(a, dtype=np.float32)
    ok = np.abs(denom) > 1e-9
    out[ok] = (a[ok] - b[ok]) / denom[ok]
    return out


def detect_water(
    green: np.ndarray,
    red: np.ndarray,
    nir: np.ndarray,
    swir: np.ndarray,
    dem: np.ndarray | None = None,
    slope: np.ndarray | None = None,
    ndwi_threshold: float = 0.15,
    mndwi_threshold: float = 0.10,
    max_slope_deg: float = 15.0,
    min_elevation_m: float | None = None,
    min_pixels: int = 8,
    fill_holes: bool = True,
):
    """Detect water bodies from optical bands, optionally constrained by terrain.

    Args:
        green, red, nir, swir: reflectance or digital number arrays, same shape.
        dem: elevation in metres, used only if ``min_elevation_m`` is set.
        slope: slope in degrees, used to reject water-like pixels on steep
            ground, which are usually shadow or snow.
        ndwi_threshold: minimum NDWI for a pixel to be considered water.
        mndwi_threshold: minimum MNDWI, which suppresses snow and ice better
            than NDWI alone.
        max_slope_deg: reject candidates steeper than this. Lakes are flat.
        min_elevation_m: when set, reject water below this altitude, to exclude
            valley rivers and reservoirs from a glacial lake inventory.
        min_pixels: drop connected components smaller than this.
        fill_holes: fill interior holes, which are usually ice floes or glint.

    Returns:
        ``(mask, diagnostics)`` where mask is uint8 and diagnostics is a dict of
        the intermediate index arrays and the pixel count surviving each stage.
    """
    green = green.astype(np.float32)
    red = red.astype(np.float32)
    nir = nir.astype(np.float32)
    swir = swir.astype(np.float32)

    ndwi = _nd(green, nir)
    mndwi = _nd(green, swir)
    ndvi = _nd(nir, red)
    # AWEInsh: designed to suppress dark non-water surfaces such as shadow.
    aweinsh = 4.0 * (green - swir) - (0.25 * nir + 2.75 * swir)

    valid = (green + red + nir + swir) > 0
    stages: dict[str, int] = {"valid": int(valid.sum())}

    mask = valid & (ndwi > ndwi_threshold) & (mndwi > mndwi_threshold)
    stages["ndwi+mndwi"] = int(mask.sum())

    # Vegetation can produce moderate NDWI; water never has high NDVI.
    mask &= ndvi < 0.2
    stages["not_vegetation"] = int(mask.sum())

    mask &= aweinsh > 0
    stages["aweinsh"] = int(mask.sum())

    if slope is not None:
        mask &= slope <= max_slope_deg
        stages["flat"] = int(mask.sum())

    if dem is not None and min_elevation_m is not None:
        mask &= dem >= min_elevation_m
        stages["high_altitude"] = int(mask.sum())

    if ndimage is not None:
        if fill_holes:
            mask = ndimage.binary_fill_holes(mask)
        # One open-close pass removes speckle without eroding real lake edges.
        mask = ndimage.binary_opening(mask, structure=np.ones((3, 3)))
        mask = ndimage.binary_closing(mask, structure=np.ones((3, 3)))
        stages["morphology"] = int(mask.sum())

        if min_pixels > 1:
            labels, count = ndimage.label(mask)
            if count:
                sizes = ndimage.sum(mask, labels, range(1, count + 1))
                too_small = np.flatnonzero(sizes < min_pixels) + 1
                mask[np.isin(labels, too_small)] = False
            stages["min_size"] = int(mask.sum())

    return mask.astype(np.uint8), {
        "ndwi": ndwi,
        "mndwi": mndwi,
        "ndvi": ndvi,
        "aweinsh": aweinsh,
        "stages": stages,
    }
