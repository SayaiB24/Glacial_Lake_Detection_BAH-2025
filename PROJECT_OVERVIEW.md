# Glacial Lake Detection — Project Overview

**What it does today:** an AI/ML pipeline that detects and segments glacial lakes from satellite imagery, tracks how their area changes over time, scores each lake's GLOF (Glacial Lake Outburst Flood) risk, and presents all of it through an interactive Next.js dashboard.

This doc describes the *current* state — what runs, what's wired up, and what's still mocked or missing. For setup steps, see [README.md](README.md).

---

## System components

```
Glacier_Website_MAIN/   Next.js 15 dashboard (App Router) — the web app
notebooks/, src/        Python ML pipeline — training + a standalone inference service
```

Two processes, run independently:
- **Dashboard** (`npm run dev` in `Glacier_Website_MAIN`) — works fully on its own for the map, lake inventory, trends and risk ranking.
- **Model service** (`uvicorn serve:app` in `src/`) — only needed for the `/analyze-image` page's "Hybrid model" option. Everything else doesn't touch it.

---

## Page-by-page flow

| Page | Purpose | Talks to |
|---|---|---|
| `/` (`app/page.tsx`) | Landing page — hero, stats, links into the river basins | Static |
| `/about` | Team/project info | Static |
| `/gis-map` (`GISMapClient.tsx`) | **Main map.** Draw an area on the map → detect lakes in it; view GLOF risk alerts; pull a multi-year area trend for a lake | `GET /api/risk-alerts`, `POST /api/process-area`, `POST /api/gee/compare-lake-area` |
| `/map` | A second, separate map with layer toggles (lakes/rivers/glaciers/watersheds/elevation/temperature) | Local/bundled GeoJSON only — **not wired to real data** (see Known gaps) |
| `/analyze-image` | Upload an 8-band GeoTIFF, choose a detection method, view detected lake polygons | `GET/POST /api/segment` (proxies to the Python model service) |
| `/time-series` | Compare two images / view change charts | `POST /api/compare-images` — **currently mocked**, returns random numbers |
| `/reports` | Download a report PDF | `GET /api/downloads/reports/[id]` — **generates a dummy PDF**, not a real report |

## The real detection flow (the part that works end-to-end)

1. User draws a polygon on `/gis-map` (capped at 2500 km²).
2. `POST /api/process-area` runs on the server: pulls Landsat imagery for that area/year from **Google Earth Engine**, computes water indices (NDWI, MNDWI, NDVI, AWEInsh), filters out rivers/shadow using slope + elevation (Copernicus DEM), and vectorizes what's left into lake polygons.
3. The API returns a GeoJSON FeatureCollection (with per-lake `area_ha`) plus stats — lake count, total area, processing time.
4. The frontend (`MaskMap.tsx`) draws the polygons on the Leaflet map.

Separately, `/analyze-image` runs the same kind of detection but on a **user-uploaded GeoTIFF** rather than a drawn map area, either via spectral indices (works today) or the trained hybrid GLNet + Attention U-Net model (not yet reliable — see README's "Known issues").

## Risk ranking

`GET /api/risk-alerts` loads the bundled 22,508-lake Himalaya inventory (`public/himalaya_lakes.geojson`), scores each lake with `lib/glofRisk.ts` (dam type, area, growth trend, elevation), and returns a ranked list. This runs entirely on static/committed data — no Earth Engine call involved.

---

## Role of the Earth Engine (GEE) key

The GEE key (`GEE_CREDENTIALS_JSON` in `Glacier_Website_MAIN/.env.local`) is what lets the server pull **satellite imagery on demand from Google Earth Engine**, rather than relying only on the pre-baked lake inventory. It is used in exactly two places:

| Feature | Route | What it needs GEE for |
|---|---|---|
| **Draw-an-area detection** | `POST /api/process-area` | Fetches Landsat imagery for the drawn polygon/year and runs the water-index detection live |
| **Multi-year area trend** | `POST /api/gee/compare-lake-area` | Computes a lake's water area per year (up to 20 years) from Landsat 8/9 — the only source of a real multi-year time series, which the Mann–Kendall trend test needs (it requires ≥3 observations; the static inventory only has 2 epochs) |

**Auth mechanics** (`lib/gee.ts`): `authenticateEarthEngine()` reads the key from the env var and calls `ee.data.authenticateViaPrivateKey(...)`. The resulting handshake is cached in memory for the life of the server process — every subsequent GEE call in either route reuses it instead of re-authenticating. If auth fails, that failure is *not* cached, so the server retries and can recover automatically once the key is fixed, without a restart.

**If the key is missing or invalid:** both routes catch this specifically (`isGeeSetupProblem()`) and return **HTTP 503** with a setup hint, instead of a hard error. The dashboard is designed to degrade gracefully:
- `/gis-map`'s drawn-area detection simply won't return results.
- The area-trend chart falls back to the two static inventory epochs (2016-17 → 2022) instead of a full yearly series.
- Everything else (risk ranking, the lake inventory layer, `/analyze-image`) is unaffected — none of it touches GEE.

You can check whether it's currently configured with:
```bash
curl http://localhost:3000/api/gee/compare-lake-area
# {"configured":false,...}  or  {"configured":true,"status":"ready"}
```

---

## Known gaps (as of this writing)

- **`/map`** renders only local/bundled GeoJSON — the `lakes.geojson`, `rivers.geojson`, `glaciers.geojson`, `watersheds.geojson` files it expects aren't in the repo, and its component (`MapDisplay.tsx`) is effectively dead code.
- **`/time-series`**'s `POST /api/compare-images` is fully mocked (`Math.random()` output) and not reachable from the real detection flow — `/api/process-area` supersedes it.
- **`/reports`** downloads are placeholder PDFs generated on the fly, not real generated reports.
- **The hybrid ML model** (as opposed to the spectral-index method) has not been validated on real imagery in the expected input layout — see README's "Known issues" for details.
