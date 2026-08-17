export const runtime = "nodejs";

import { promises as fs } from "fs";
import path from "path";

import { NextResponse } from "next/server";

import { rankLakes, type LakeProperties, type RiskAssessment } from "@/lib/glofRisk";

// Himalaya-wide 2022 inventory, with NRSC attributes merged in where lakes match
// and measured 2016-2017 to 2022 area change where both epochs matched.
const INVENTORY_PATH = path.join(process.cwd(), "public", "himalaya_lakes.geojson");

interface InventoryFeature {
  properties: LakeProperties & { DOP?: string };
}

/** Parsed inventory, cached for the lifetime of the server process. */
let inventoryCache: { lakes: Array<LakeProperties & { DOP?: string }>; surveyed: string } | null = null;

/**
 * Convert the inventory's DOP field ("11122016" = 11 Dec 2016) to ISO format.
 * Returns null rather than guessing when the value is not the expected shape,
 * so a bad date surfaces instead of silently becoming today.
 */
function parseDop(dop: string | undefined): string | null {
  if (!dop || !/^\d{8}$/.test(dop)) return null;
  const day = dop.slice(0, 2);
  const month = dop.slice(2, 4);
  const year = dop.slice(4, 8);
  const iso = `${year}-${month}-${day}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

async function loadInventory() {
  if (inventoryCache) return inventoryCache;

  const raw = await fs.readFile(INVENTORY_PATH, "utf8");
  const parsed = JSON.parse(raw) as { features?: InventoryFeature[] };
  if (!Array.isArray(parsed.features)) {
    throw new Error("Inventory is not a GeoJSON FeatureCollection");
  }

  const lakes = parsed.features.map((f) => f.properties).filter(Boolean);
  // NRSC files carry a DOP survey date; the HMA inventory instead labels each
  // feature with the epoch it was derived from.
  const first = lakes[0] as (LakeProperties & { DOP?: string; Epoch?: string }) | undefined;
  const surveyed = parseDop(first?.DOP) ?? first?.Epoch ?? "unknown";

  inventoryCache = { lakes, surveyed };
  return inventoryCache;
}

/**
 * GET /api/risk-alerts?limit=20&level=High
 *
 * Ranks the NRSC glacial lake inventory by GLOF susceptibility. This is a
 * screening index for prioritising monitoring, not a validated hazard
 * assessment — see lib/glofRisk.ts for what it does and does not account for.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const limitParam = Number.parseInt(searchParams.get("limit") ?? "20", 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 20;
    const levelFilter = searchParams.get("level");

    const { lakes, surveyed } = await loadInventory();

    let ranked: RiskAssessment[] = rankLakes(lakes);
    if (levelFilter) {
      ranked = ranked.filter((r) => r.level.toLowerCase() === levelFilter.toLowerCase());
    }

    const counts = { High: 0, Moderate: 0, Low: 0 } as Record<string, number>;
    for (const r of rankLakes(lakes)) counts[r.level]++;

    const alerts = ranked.slice(0, limit).map((r) => ({
      id: r.id,
      name: r.name,
      riskLevel: r.level,
      score: r.score,
      areaHa: r.areaHa,
      elevationM: r.elevationM,
      lakeType: r.lakeType,
      factors: r.factors,
      usedTrend: r.usedTrend,
      lastUpdated: surveyed,
    }));

    return NextResponse.json(alerts, {
      headers: {
        // Ranking is deterministic for a fixed inventory, so let it be cached.
        "Cache-Control": "public, max-age=3600",
        "X-Total-Lakes": String(lakes.length),
        "X-Risk-Counts": JSON.stringify(counts),
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to compute risk alerts:", detail);
    return NextResponse.json(
      {
        error: "Could not compute risk alerts.",
        details: detail,
        hint: "Ensure public/himalaya_lakes.geojson is present.",
      },
      { status: 500 },
    );
  }
}
