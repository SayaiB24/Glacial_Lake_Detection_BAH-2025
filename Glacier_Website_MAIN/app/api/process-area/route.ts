// File: app/api/process-area/route.ts
export const runtime = "nodejs";
// Building a composite and vectorising it can take a while for a large area.
export const maxDuration = 300;

import { NextResponse } from "next/server";
import ee from "@google/earthengine";

import { authenticateEarthEngine, evaluateEe, isGeeSetupProblem } from "@/lib/gee";

/** Largest area we will process, to keep a single request bounded. */
const MAX_AREA_KM2 = 2500;

/**
 * Detect water bodies inside an arbitrary polygon using Earth Engine.
 *
 * Mirrors the spectral approach used elsewhere in the project: NDWI and MNDWI
 * identify water, NDVI rejects vegetation, and AWEInsh suppresses terrain
 * shadow, which is the main false positive in steep mountain scenes. Slope from
 * a DEM removes the remainder, since lakes are flat, and an elevation floor
 * keeps the result to glacial lakes rather than valley rivers and reservoirs.
 */
function detectLakes(
  aoi: any,
  year: number,
  opts: { ndwiThreshold: number; maxSlopeDeg: number; minElevationM: number; minAreaHa: number },
) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const prep = (image: any) => {
    const optical = image
      .select(["SR_B2", "SR_B3", "SR_B4", "SR_B5", "SR_B6", "SR_B7"])
      .multiply(0.0000275)
      .add(-0.2);
    const qa = image.select("QA_PIXEL");
    // Bits 3 and 4 are cloud and cloud shadow in the Landsat C2 QA band.
    const clear = qa.bitwiseAnd(1 << 3).eq(0).and(qa.bitwiseAnd(1 << 4).eq(0));
    return optical
      .updateMask(clear)
      .select(
        ["SR_B2", "SR_B3", "SR_B4", "SR_B5", "SR_B6", "SR_B7"],
        ["BLUE", "GREEN", "RED", "NIR", "SWIR1", "SWIR2"],
      );
  };

  const collection = ee
    .ImageCollection("LANDSAT/LC08/C02/T1_L2")
    .merge(ee.ImageCollection("LANDSAT/LC09/C02/T1_L2"))
    .filterBounds(aoi)
    .filterDate(start, end)
    .filter(ee.Filter.lt("CLOUD_COVER", 60))
    .map(prep);

  const imageCount = collection.size();
  const composite = collection.median().clip(aoi);

  const ndwi = composite.normalizedDifference(["GREEN", "NIR"]);
  const mndwi = composite.normalizedDifference(["GREEN", "SWIR1"]);
  const ndvi = composite.normalizedDifference(["NIR", "RED"]);
  const aweinsh = composite.expression(
    "4 * (GREEN - SWIR1) - (0.25 * NIR + 2.75 * SWIR2)",
    {
      GREEN: composite.select("GREEN"),
      NIR: composite.select("NIR"),
      SWIR1: composite.select("SWIR1"),
      SWIR2: composite.select("SWIR2"),
    },
  );

  // Copernicus DEM gives elevation and, through ee.Terrain, slope.
  const dem = ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").mosaic();
  const slope = ee.Terrain.slope(dem.setDefaultProjection("EPSG:4326", null, 30));

  let water = ndwi
    .gt(opts.ndwiThreshold)
    .and(mndwi.gt(0.0))
    .and(ndvi.lt(0.2))
    .and(aweinsh.gt(0))
    .and(slope.lte(opts.maxSlopeDeg));

  if (opts.minElevationM > 0) {
    water = water.and(dem.gte(opts.minElevationM));
  }

  // A single open-close pass drops isolated pixels without eroding real edges.
  const kernel = ee.Kernel.circle({ radius: 1, units: "pixels" });
  const cleaned = water.focal_min({ kernel, iterations: 1 }).focal_max({ kernel, iterations: 1 });

  const vectors = cleaned
    .selfMask()
    .reduceToVectors({
      geometry: aoi,
      scale: 30,
      maxPixels: 1e9,
      bestEffort: true,
      tileScale: 4,
      geometryType: "polygon",
      eightConnected: false,
    })
    .map((f: any) => f.set("area_ha", f.geometry().area(5).divide(10000)))
    .filter(ee.Filter.gte("area_ha", opts.minAreaHa));

  return { vectors, imageCount, dem };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const areaGeometry = body.area ?? body.geometry;

    if (!areaGeometry || !["Polygon", "MultiPolygon"].includes(areaGeometry.type)) {
      return NextResponse.json(
        { error: "Provide 'area' as a GeoJSON Polygon or MultiPolygon." },
        { status: 400 },
      );
    }

    const year = Number.parseInt(String(body.year ?? new Date().getFullYear() - 1), 10);
    const opts = {
      ndwiThreshold: Number(body.ndwiThreshold ?? 0.15),
      maxSlopeDeg: Number(body.maxSlopeDeg ?? 15),
      minElevationM: Number(body.minElevationM ?? 3500),
      minAreaHa: Number(body.minAreaHa ?? 0.5),
    };

    await authenticateEarthEngine();

    const aoi = ee.Geometry(areaGeometry);
    const areaKm2 = await evaluateEe<number>(aoi.area(10).divide(1e6));
    if (areaKm2 > MAX_AREA_KM2) {
      return NextResponse.json(
        {
          error: `Selected area is ${Math.round(areaKm2).toLocaleString()} km², above the ${MAX_AREA_KM2.toLocaleString()} km² limit.`,
          hint: "Draw a smaller rectangle.",
        },
        { status: 400 },
      );
    }

    const started = Date.now();
    const { vectors, imageCount } = detectLakes(aoi, year, opts);

    const [features, images] = await Promise.all([
      evaluateEe<any>(vectors),
      evaluateEe<number>(imageCount),
    ]);

    const polygons = (features?.features ?? [])
      .map((f: any, i: number) => ({
        type: "Feature",
        properties: {
          lake_id: `AI-${String(i + 1).padStart(4, "0")}`,
          area_ha: Math.round((f.properties?.area_ha ?? 0) * 1000) / 1000,
        },
        geometry: f.geometry,
      }))
      .sort((a: any, b: any) => b.properties.area_ha - a.properties.area_ha)
      .map((f: any, i: number) => ({
        ...f,
        properties: { ...f.properties, lake_id: `AI-${String(i + 1).padStart(4, "0")}` },
      }));

    const totalArea = polygons.reduce((s: number, f: any) => s + f.properties.area_ha, 0);

    return NextResponse.json({
      polygons: { type: "FeatureCollection", features: polygons },
      stats: {
        lake_count: polygons.length,
        total_area_ha: Math.round(totalArea * 1000) / 1000,
        total_area_sqkm: Math.round((totalArea / 100) * 10000) / 10000,
        processing_time_sec: Math.round((Date.now() - started) / 100) / 10,
        area_searched_km2: Math.round(areaKm2 * 10) / 10,
        year,
        landsat_images: images,
        method: "spectral-indices-gee",
        filters: opts,
      },
    });
  } catch (error: any) {
    const message: string = error?.message ?? "Unknown error";
    console.error("process-area failed:", message);

    if (isGeeSetupProblem(message)) {
      return NextResponse.json(
        {
          error: "Earth Engine is not configured.",
          details: message,
          hint: "See the Earth Engine section of the README.",
          configured: false,
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Failed to detect lakes in the selected area.", details: message },
      { status: 500 },
    );
  }
}
