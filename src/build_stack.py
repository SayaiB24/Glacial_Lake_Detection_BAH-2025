"""Assemble a model-compatible 8-band stack from real LISS-3 optical + a real DEM.

LISS3_1_input_stack.tif carries the optical bands and spectral indices but no
terrain data, which the trained model requires in channels 4-6. This fetches
public elevation tiles for the same footprint, derives slope and aspect, and
writes a stack in the layout the model expects:

    0-3  Green, Red, NIR, SWIR   (10-bit DN, straight from LISS-3)
    4    DEM      metres
    5    slope    degrees
    6    aspect   degrees
    7    NDWI     (Green - NIR) / (Green + NIR)

Elevation source: AWS "terrarium" tiles, elevation = R*256 + G + B/256 - 32768.
"""
import argparse, io, math, os, sys, time
import numpy as np
import rasterio
import rasterio.warp
from rasterio.transform import from_bounds
from PIL import Image
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ap = argparse.ArgumentParser()
ap.add_argument("stack")
ap.add_argument("out")
ap.add_argument("--col", type=int, default=3072)
ap.add_argument("--row", type=int, default=4096)
ap.add_argument("--size", type=int, default=1024)
ap.add_argument("--zoom", type=int, default=13)
args = ap.parse_args()

GREEN, RED, NIR, SWIR, NDWI_B = 4, 5, 6, 7, 3


def deg2tile(lat, lon, z):
    n = 2**z
    x = (lon + 180.0) / 360.0 * n
    lat_r = math.radians(lat)
    y = (1.0 - math.asinh(math.tan(lat_r)) / math.pi) / 2.0 * n
    return x, y


def tile2deg(x, y, z):
    n = 2**z
    lon = x / n * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lat, lon


with rasterio.open(args.stack) as src:
    win = rasterio.windows.Window(args.col, args.row, args.size, args.size)
    optical = src.read([GREEN + 1, RED + 1, NIR + 1, SWIR + 1], window=win).astype(np.float32)
    ndwi = src.read(NDWI_B + 1, window=win).astype(np.float32)
    win_transform = src.window_transform(win)
    crs = src.crs
    left, bottom, right, top = rasterio.windows.bounds(win, src.transform)

print(f"window {args.size}x{args.size} at ({args.col},{args.row})")
print(f"  optical range: {optical.min():.0f}..{optical.max():.0f}")
print(f"  NDWI range   : {ndwi.min():.3f}..{ndwi.max():.3f}  ({100*(ndwi>0.2).mean():.3f}% water)")

wgs_bounds = rasterio.warp.transform_bounds(crs, "EPSG:4326", left, bottom, right, top)
w, s, e, n = wgs_bounds
print(f"  bounds       : lon {w:.4f}..{e:.4f}  lat {s:.4f}..{n:.4f}")

# --- Fetch elevation tiles --------------------------------------------------
z = args.zoom
x0f, y0f = deg2tile(n, w, z)   # top-left
x1f, y1f = deg2tile(s, e, z)   # bottom-right
x0, y0 = int(math.floor(x0f)), int(math.floor(y0f))
x1, y1 = int(math.floor(x1f)), int(math.floor(y1f))
nx, ny = x1 - x0 + 1, y1 - y0 + 1
print(f"\nfetching {nx}x{ny} = {nx*ny} elevation tiles at zoom {z} ...")

mosaic = np.full((ny * 256, nx * 256), np.nan, dtype=np.float32)
ok = 0
for ty in range(y0, y1 + 1):
    for tx in range(x0, x1 + 1):
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{tx}/{ty}.png"
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=60) as r:
                    img = np.asarray(Image.open(io.BytesIO(r.read())).convert("RGB")).astype(np.float32)
                elev = img[:, :, 0] * 256.0 + img[:, :, 1] + img[:, :, 2] / 256.0 - 32768.0
                mosaic[(ty - y0) * 256 : (ty - y0 + 1) * 256, (tx - x0) * 256 : (tx - x0 + 1) * 256] = elev
                ok += 1
                break
            except Exception as exc:
                if attempt == 2:
                    print(f"  WARN tile {z}/{tx}/{ty} failed: {exc}")
                time.sleep(1)
print(f"  {ok}/{nx*ny} tiles fetched; elevation {np.nanmin(mosaic):.0f}..{np.nanmax(mosaic):.0f} m")

lat_top, lon_left = tile2deg(x0, y0, z)
lat_bot, lon_right = tile2deg(x1 + 1, y1 + 1, z)
mosaic_transform = from_bounds(lon_left, lat_bot, lon_right, lat_top, mosaic.shape[1], mosaic.shape[0])

# --- Reproject the DEM onto the LISS-3 grid --------------------------------
dem = np.zeros((args.size, args.size), dtype=np.float32)
rasterio.warp.reproject(
    source=mosaic, destination=dem,
    src_transform=mosaic_transform, src_crs="EPSG:4326",
    dst_transform=win_transform, dst_crs=crs,
    resampling=rasterio.enums.Resampling.bilinear,
    src_nodata=np.nan, dst_nodata=np.nan,
)
dem = np.nan_to_num(dem, nan=float(np.nanmedian(dem)))
print(f"\nDEM on LISS-3 grid: {dem.min():.0f}..{dem.max():.0f} m, mean {dem.mean():.0f} m")

# --- Slope and aspect from the DEM -----------------------------------------
px = abs(win_transform.a)  # metres per pixel (projected CRS)
dzdx = np.gradient(dem, px, axis=1)
dzdy = np.gradient(dem, px, axis=0)
slope = np.degrees(np.arctan(np.hypot(dzdx, dzdy))).astype(np.float32)
aspect = (np.degrees(np.arctan2(-dzdx, dzdy)) + 360.0) % 360.0
aspect = aspect.astype(np.float32)
print(f"slope : {slope.min():.1f}..{slope.max():.1f} deg, mean {slope.mean():.1f}")
print(f"aspect: {aspect.min():.1f}..{aspect.max():.1f} deg")

# --- Write the stack in the model's expected layout ------------------------
stack = np.stack([optical[0], optical[1], optical[2], optical[3], dem, slope, aspect, ndwi])
profile = dict(driver="GTiff", height=args.size, width=args.size, count=8,
               dtype="float32", crs=crs, transform=win_transform, compress="lzw")
with rasterio.open(args.out, "w", **profile) as dst:
    dst.write(stack)
    dst.descriptions = ("Green", "Red", "NIR", "SWIR", "DEM", "SLOPE", "ASPECT", "NDWI")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from model import check_band_layout  # noqa: E402
print(f"\nwrote {args.out}")
print("layout check:", check_band_layout(stack) or "PASSES — matches the model's expected layout")
