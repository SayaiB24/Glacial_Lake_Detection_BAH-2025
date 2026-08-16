# Glacial Lake Detection — BAH 2025

**Problem Statement:** AI/ML driven automated feature detection and change analysis of glacial lakes from multi-source satellite imagery.

**Team Technocrats** (SVPCET) — Bharatiya Antariksh Hackathon 2025
Rochan Awasthi (lead) · Sayali Bambal · Atharva Bhede · Uday Bhoyar

Glacial lakes are expanding as the climate warms, raising the risk of Glacial Lake Outburst Floods (GLOFs) downstream. This project detects and segments glacial lakes from satellite imagery using a deep learning model, tracks how their area changes over time, and presents the results through an interactive web dashboard.

---


---

## Repository layout

```
Glacier_Website_MAIN/     Next.js 15 dashboard (App Router, TypeScript, Tailwind, Leaflet)
  app/                    Pages: /, /about, /gis-map, /map, /analyze-image, /time-series, /reports
  app/api/                Route handlers (GEE, risk alerts, report downloads, mocked analysis)
  components/ui/          shadcn/ui component library
  public/                 Static assets  ← place sikkim_shape.geojson here
  server.js               Legacy standalone Express server (superseded by Next.js)
notebooks/                Preprocessing, training and inference notebooks
  R_Hybrid.ipynb          Main hybrid GLNet + Attention U-Net model
  UNET_Testrun.ipynb      Baseline U-Net experiments
  *Data_Preproccessing*   Builds 8-band input stacks, masks and 256×256 chunks
  predict.py              Standalone tiled inference over a large GeoTIFF
src/
  model.py                Shared architecture + normalisation (source of truth)
  GEE_extraction.py       Earth Engine export helper
  load_inp_stack*.py      Stack/mask inspection utilities
  prefix_*.py             Bulk file renaming helpers
Resources/                Proposal PDFs and the BAH-2025 submission deck
```

---

## Quick start

The system runs as two processes: the Next.js dashboard, and a Python service
that holds the trained model in memory and performs segmentation.

**Terminal 1 — model service** (needed only for GeoTIFF segmentation):

```bash
.venv\Scripts\python.exe -m uvicorn serve:app --app-dir src --port 8000
```

**Terminal 2 — dashboard** (Node.js 18+, developed against Node 24):

```bash
cd Glacier_Website_MAIN
npm ci
npm run dev          # http://localhost:3000
```

For a production build, use `npm run build && npm start` instead.

The dashboard runs without the model service — the map, lake inventory, trend
analysis and risk ranking all work on their own. Only `/analyze-image` needs it,
and that page reports clearly when the service is not reachable.

### Getting lake masks

1. Start both processes above.
2. Open <http://localhost:3000/analyze-image>.
3. Upload an 8-band GeoTIFF (4 LISS-3 optical bands, DEM, slope, aspect, NDWI).
4. Optionally adjust the detection threshold, and set uncertainty passes above 0
   to enable Monte Carlo dropout.
5. Detected lakes are drawn as polygons on a satellite basemap, with per-lake
   areas, total area, scene coverage and processing time.

The service tiles the scene, runs the hybrid model over each tile, stitches the
mask, vectorises it and reprojects the polygons to EPSG:4326, so results overlay
correctly on the map regardless of the source projection.

Configuration via environment variables: `GLOF_MODEL_PATH` (checkpoint),
`GLOF_DEVICE` (`cpu` or `cuda`), `GLOF_MAX_UPLOAD_MB`, `GLOF_MAX_PIXELS`, and
`GLOF_SERVICE_URL` on the Next.js side if the service is not on port 8000.

### Files you must supply

These are excluded by `.gitignore` and are **not** in the repository. The app builds and runs without them, but the corresponding features stay empty and show an in-page notice.

| File | Location | Enables |
|---|---|---|
| `sikkim_shape.geojson` | `Glacier_Website_MAIN/public/` | Lake inventory layer, lake selection, time-series analysis on `/gis-map` |
| `lakes.geojson`, `rivers.geojson`, `glaciers.geojson`, `watersheds.geojson` | — | The `/map` page (also needs the `/api/data/*` routes to be written) |
| Trained weights (`hybrid_model_best.pth` etc.) | `notebooks/` | Model inference |

`sikkim_shape.geojson` is expected to be a GeoJSON `FeatureCollection` of lake polygons whose properties include `ID_No`, `Name`, `GL_Type`, `Area_ha`, `Elev_m`, `Basin`, `River_Syst`, `State` and `District`.

### Environment variables

Create `Glacier_Website_MAIN/.env.local`:

```
GEE_CREDENTIALS_JSON={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
```

This is the **full JSON** of a Google Earth Engine service-account key, on one line. It powers `/api/gee/compare-lake-area`, which computes lake area per year from Landsat 8/9 using NDWI, MNDWI, AWEIsh and AWEInsh. Without it that route returns HTTP 500.

---

## ML pipeline

### Environment setup

Use **Python 3.11**. Python 3.13/3.14 will not work — torch and rasterio do not
publish wheels for them yet.

```bash
py -3.11 -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Verify the environment:

```bash
.venv\Scripts\python.exe verify_env.py
```

This checks every import and runs a real `1×8×256×256` forward pass through a
rebuild of `GlacialLake_HybridNet` (32.1M parameters), so a pass means the whole
stack genuinely works rather than merely being installed.

`requirements.txt` pins the **CPU** build of torch — no GPU required, and the
notebooks already fall back to CPU. On a CUDA machine, remove the
`--extra-index-url` line and install torch from
<https://pytorch.org/get-started/locally/> first.

> `--only-binary=:all:` in `requirements.txt` is deliberate. Newer `stringzilla`
> (pulled in by `albumentations` → `albucore`) ships no prebuilt Windows wheel and
> will try to compile from source, which fails without a C toolchain.

### Running the notebooks

A Jupyter kernel named **Python (GLOF .venv)** is registered by the setup above.
Select it from the kernel picker in VS Code or JupyterLab:

```bash
.venv\Scripts\python.exe -m jupyter lab
```

### Model input format

The model consumes **8-channel 256×256 GeoTIFF tiles**, normalised as follows (see `GlacialLakeDataset` in `R_Hybrid.ipynb`):

| Channel | Content | Normalisation |
|---|---|---|
| 0–3 | LISS-3 optical bands | `÷ 1023` (10-bit) |
| 4 | DEM elevation | `÷ 4000` |
| 5 | Slope | `÷ 90` |
| 6 | Aspect | `÷ 360` |
| 7 | NDWI | `(x + 1) / 2` |

All values are then clipped to `[0, 1]`.

`normalize_stack()` validates these ranges and warns (or raises, with
`strict=True`) when a stack does not match, so a mis-ordered input fails loudly
instead of being silently turned into noise.

### Input stack layouts — important

**Two incompatible stack layouts exist, and only one works with the trained
model.**

The model requires the layout above. But `LISS3_1_input_stack.tif`, published at
<https://github.com/SayaiB24/tif>, is laid out differently:

| Band | Contents | Verified by |
|---:|---|---|
| 0 | MNDWI `(Green − SWIR)/(Green + SWIR)` | exact algebraic identity |
| 1 | `(Red − SWIR)/(Red + SWIR)` | exact algebraic identity |
| 2 | NDVI `(NIR − Red)/(NIR + Red)` | exact algebraic identity |
| 3 | NDWI `(Green − NIR)/(Green + NIR)` | exact algebraic identity |
| 4 | Green (B2), 10-bit DN | integer, 0–478 |
| 5 | Red (B3), 10-bit DN | integer, 0–443 |
| 6 | NIR (B4), 10-bit DN | integer, 0–567 |
| 7 | SWIR (B5), 10-bit DN | integer, 0–544 |

That is **four spectral indices followed by four optical bands, with no DEM,
slope or aspect at all**. Each index reproduces a normalised difference of the
integer bands to within floating-point exactness, so the mapping is certain
rather than inferred.

Feeding this file to the model gives it indices where it was trained to see
terrain. Tested across the water-bearing tiles of that scene, the best of three
plausible re-orderings produced only a weak correlation between predicted
probability and NDWI (r ≈ 0.13), which is consistent with the optical and NDWI
channels landing correctly while the three terrain channels carry unrelated
data.

That scene is also in **Himachal/Ladakh (74.5–76.5 °E, 32.5–34.1 °N)**, roughly
1100 km from the Sikkim inventory, so it cannot be scored against those 718
polygons either.

**What is needed to measure accuracy:** a stack produced by the same
preprocessing that generated the training chunks in
`data/LISS3/segments/input_stack/` — one that includes DEM, slope and aspect —
and ideally covering Sikkim so the NRSC inventory can serve as ground truth.

### Architecture

`GlacialLake_HybridNet` combines:

- a **GLNet-style parallel encoder** — a local branch (full resolution) and a global branch (4× downsample → convolutions → upsample), concatenated to 64 channels;
- a **U-Net downsampling path** (64 → 128 → 256 → 512 → 1024);
- an **Attention U-Net decoder** with attention gates on every skip connection and dropout for Monte Carlo uncertainty estimation;
- **`BoundaryLoss`** — Dice + BCE combined with a morphological-gradient boundary term to sharpen lake outlines.

### Workflow

1. Export imagery with `src/GEE_extraction.py` (edit the ROI and dates at the top).
2. Build 8-band stacks, masks and 256×256 chunks using the preprocessing notebooks.
3. Train with `notebooks/R_Hybrid.ipynb`.
4. Run inference:

```bash
.venv\Scripts\python.exe notebooks/predict.py ^
    --model notebooks/hybrid_model_best.pth ^
    --input data/LISS3/processed/LISS3_9_input_stack.tif ^
    --output notebooks/Output/LISS3_9_predicted_mask.tif ^
    --chunk-dir notebooks/Output/chunks
```

`--threshold`, `--patch-size` and `--device` are optional; see `--help`. The
script tiles the scene, runs the model per tile, and writes a stitched
single-band `uint8` mask that preserves the source CRS and transform. With
`--chunk-dir` it also writes a false-colour PNG for each tile containing a
detection.

`src/model.py` is the single source of truth for both the architecture and the
input normalisation — import from it rather than copying the definitions.

### Uncertainty maps (Monte Carlo Dropout)

Add `--mc-passes N` (N ≥ 2) to run each tile through N stochastic forward passes
with dropout active and BatchNorm frozen. Alongside the binary mask, this writes
a `float32` raster of the per-pixel standard deviation across passes — the
pixel-wise confidence map. Low values mean the model agrees with itself; high
values flag boundaries and ambiguous terrain worth manual review.

```bash
.venv\Scripts\python.exe notebooks/predict.py ^
    --model notebooks/hybrid_model_best.pth ^
    --input data/LISS3/processed/LISS3_9_input_stack.tif ^
    --output notebooks/Output/mask.tif ^
    --mc-passes 30
```

The uncertainty raster defaults to `<output>_uncertainty.tif`; override with
`--uncertainty-output`. 20–50 passes is typical; cost scales linearly.

### Trend detection (Mann–Kendall)

`Glacier_Website_MAIN/lib/mannKendall.ts` implements the non-parametric
Mann–Kendall trend test with tie-corrected variance, plus Sen's slope for the
magnitude of change. The GIS map runs it over the yearly lake-area series and
reports direction, p-value, Kendall's τ and the rate in ha/yr.

Years with no cloud-free imagery are excluded rather than treated as zero area,
which would otherwise read as a lake collapsing. At least 3 usable years are
required.

The implementation is validated against an independent Python reference across
10 series — monotonic, tied, uneven spacing, gaps and minimum length — agreeing
to within 2e-7 on p-values.

### GLOF susceptibility screening

`Glacier_Website_MAIN/lib/glofRisk.ts` ranks lakes in the NRSC inventory by
outburst susceptibility. `GET /api/risk-alerts` serves the ranking, with
optional `?limit=` and `?level=` parameters.

The index combines four factors, weighted by how strongly each is associated
with outburst floods and by how well this inventory measures it:

| Factor | Weight | Rationale |
|---|---:|---|
| Dam type (`GL_Type`) | 35 | Moraine dams are unconsolidated debris and are the dam type that fails; bedrock-confined erosion lakes rarely burst |
| Lake area | 30 | Proxy for stored volume, log-scaled — the distribution is skewed from under 1 ha median to 174 ha |
| Growth trend | 25 | From Mann–Kendall; counted only when a significant *increasing* trend is present |
| Elevation | 10 | Proxy for proximity to actively retreating ice, a common trigger |

Lakes without a time series are scored over the remaining factors and
renormalised, rather than penalised for missing data.

**This is a screening index for prioritising monitoring, not a validated hazard
assessment, and must not be used alone to drive warnings or evacuation.** It
cannot see moraine geometry, dam freeboard, buried ice, distance to the parent
glacier, downstream channel form, or exposed population — several of which
dominate real breach probability.

As a sanity check, the ranking places **South Lhonak Lake 2nd of 718**. Its
moraine dam breached in October 2023, destroying the Chungthang dam and killing
around 100 people downstream. Current distribution: 65 High, 178 Moderate,
475 Low.

---

## Known issues

### Fixed

- **Train/inference normalisation mismatch (was severe).** Inference applied
  `(x + 1) / 2` to channels 4–7, but training normalises DEM, slope and aspect by
  their own maxima. Those three channels saturated to `1.0` after clipping, so the
  model was fed near-constant data: measured on a representative stack, DEM had
  standard deviation `0.0000` (all information destroyed), slope `0.0309` versus
  `0.2853` correct, aspect `0.0132` versus `0.2862`. Normalisation now lives in
  `normalize_stack()` in `src/model.py` and is shared by training and inference.
- **`predict.py` built the wrong architecture** (`smp.UnetPlusPlus`), so it could
  not load hybrid checkpoints. It now uses `GlacialLake_HybridNet` from
  `src/model.py`.
- **Hardcoded `C:\Users\Rochan\...` paths in `predict.py`** replaced with CLI
  arguments.
- **`Up_Attention` shape error.** The attention gate ran before the padding that
  reconciles a size mismatch, so non-power-of-two inputs raised an error. Padding
  now happens first.
- **Edge-tile handling in `predict.py`.** Tile PNGs were rendered from the padded,
  partially-normalised tile while the mask was cropped, so overlays misaligned at
  image edges. Stitching is now verified to cover every pixel exactly.
- **Monte Carlo Dropout corrupted BatchNorm.** `generate_uncertainty_map()` called
  `model.train()` to re-enable dropout, which also switched every BatchNorm layer
  into training mode — measured on this architecture, all 32 layers had their
  running statistics overwritten by a single call, and each pass then normalised
  using batch rather than learned statistics. `enable_mc_dropout()` in
  `src/model.py` toggles only `nn.Dropout`, leaving BatchNorm frozen (verified:
  0 of 32 layers altered).

### Outstanding

1. **No input stack matching the model's expected layout has been found.** The
   model expects 4 optical bands, DEM, slope, aspect and NDWI. The only real
   stack available so far, `LISS3_1_input_stack.tif`, has a different layout
   entirely — see "Input stack layouts" below. Detection accuracy therefore
   remains unmeasured, and the segmentation path is verified only on synthetic
   scenes.
2. **Two analysis endpoints are still mocked.** `/api/process-area` and `/api/compare-images` return `Math.random()` values rather than model output, and neither is reachable from the UI. `/api/segment` supersedes them and does real inference. (`/api/risk-alerts` is also real now — it ranks the actual inventory.)
2. **Path traversal in `server.js`.** `/downloads/reports/:filename` joins an unsanitised parameter into a filesystem path; a URL-encoded `..%2F` escapes the reports directory. This legacy Express server is superseded by the Next.js app.
3. **Hardcoded paths in `src/*.py` and the notebooks.** `R_Hybrid.ipynb` cell 6 and the `load_inp_stack*.py` / `prefix_*.py` helpers still point at machine-specific directories. Edit before running.
4. **The notebooks still define their own copy of the model and normalisation.** They should import from `src/model.py` so the two cannot drift apart again.
5. **GEE route inefficiency.** `/api/gee/compare-lake-area` re-authenticates on every request, and multi-year time series build one large Earth Engine graph evaluated in a single call, which is prone to timing out.
6. **Junk dependencies.** `package.json` lists `"fs"` and `"path"` as npm packages; both are Node built-ins. `express` and `cors` are pinned to `latest`.
7. **`Glacier_Website_MAIN/requirement.txt`** lists npm package names despite its Python-style filename.
8. **`components/MapDisplay.tsx` is dead code** that imports four GeoJSON files which do not exist.
9. **Build error suppression.** `next.config.mjs` sets `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` to `true`, which hides genuine errors. TypeScript is currently clean, so these can be turned off.

---

## Troubleshooting

**Clone fails partway with `RPC failed; curl 56 Recv failure` or `early EOF`.** Common behind corporate TLS proxies on Windows. Disable Git's schannel revocation check:

```bash
git clone -c http.schannelCheckRevoke=false \
          -c http.postBuffer=524288000 \
          https://github.com/SayaiB24/Glacial_Lake_Detection_BAH-2025.git
```

**`Module not found: Can't resolve '@/public/sikkim_shape.geojson'`.** Fixed — the file is now loaded at runtime. Pull the latest `main`.

**`ReferenceError: window is not defined` during build.** Leaflet must never render on the server. `/gis-map` loads its map through `next/dynamic` with `ssr: false`; keep any new Leaflet code inside that client module.
