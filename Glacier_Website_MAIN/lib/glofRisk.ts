/**
 * GLOF susceptibility screening index for glacial lakes.
 *
 * IMPORTANT — what this is and is not.
 *
 * This is a *screening* index for prioritising which lakes deserve closer study.
 * It is NOT a validated hazard or risk assessment and must not be used on its
 * own to issue warnings or drive evacuation decisions.
 *
 * A defensible GLOF hazard assessment additionally requires field or high
 * resolution data this inventory does not contain: moraine dam geometry and
 * freeboard, presence of buried ice in the dam, distance to and calving state of
 * the parent glacier, slope and channel form of the downstream reach, and the
 * population and infrastructure exposed. Several of those dominate real breach
 * probability.
 *
 * What the index does use, and why:
 *
 *   Dam type    Moraine dams are loose, poorly sorted debris and are the dam
 *               type that actually fails. Bedrock-confined erosion lakes very
 *               rarely produce outbursts. This is the strongest signal that the
 *               NRSC inventory carries, so it carries the largest weight.
 *   Area        A proxy for stored water volume, hence potential flood
 *               magnitude. Log-scaled because the distribution is heavily
 *               skewed (median under 1 ha, maximum 174 ha).
 *   Growth      A lake expanding year on year is filling faster than it drains
 *               and is trending toward its dam's capacity. Supplied by the
 *               Mann-Kendall test, and only counted when statistically
 *               significant.
 *   Elevation   Higher lakes sit closer to actively retreating ice, so are more
 *               exposed to ice or rock avalanche impact, a common trigger.
 *
 * Reference for the general approach: Bolch et al. (2011), Natural Hazards
 * 59(3):1691-1714; Worni et al. (2013), Science of the Total Environment
 * 468-469:S71-S84.
 */

import type { MannKendallResult } from "./mannKendall";

export type RiskLevel = "Low" | "Moderate" | "High";

export interface LakeProperties {
  ID_No: string;
  Name: string | null;
  /** NRSC dam classification. Absent in the HMA inventory for most lakes. */
  GL_Type?: string | null;
  Area_ha: number;
  Elev_m: number;
  Basin?: string;
  District?: string;
  Latitude?: number;
  Longitude?: number;
  /** Measured area change between inventory epochs, where both were matched. */
  Area_2016_ha?: number | null;
  AreaChangePct?: number | null;
  ChangeRateHaPerYr?: number | null;
}

export interface RiskFactor {
  /** Human-readable factor name. */
  name: string;
  /** Points contributed. */
  score: number;
  /** Maximum this factor can contribute. */
  max: number;
  /** Why this score was assigned. */
  detail: string;
}

export interface RiskAssessment {
  id: string;
  name: string;
  /** 0-100, normalised over the factors that could actually be evaluated. */
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
  /** True when a significant Mann-Kendall trend contributed to the score. */
  usedTrend: boolean;
  areaHa: number;
  elevationM: number;
  lakeType: string;
}

const WEIGHT_DAM_TYPE = 35;
const WEIGHT_AREA = 30;
const WEIGHT_GROWTH = 25;
const WEIGHT_ELEVATION = 10;

/** Inventory area range, used to bound the log scaling. */
const AREA_MIN_HA = 0.25;
const AREA_MAX_HA = 175;

/** Inventory elevation range in metres. */
const ELEV_MIN_M = 3500;
const ELEV_MAX_M = 5800;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Score the dam type from the NRSC GL_Type code.
 *
 * Codes are of the form "M(e): End-moraine Dammed Lake". Only the leading code
 * is matched, so label wording changes do not silently break the mapping.
 */
export function scoreDamType(glType: string): { score: number; detail: string } {
  const code = (glType ?? "").trim().split(":")[0].trim().toUpperCase();

  switch (code) {
    case "M(E)":
      return {
        score: WEIGHT_DAM_TYPE,
        detail: "End-moraine dammed — the dam type most associated with outburst floods",
      };
    case "M(L)":
      return { score: 30, detail: "Lateral-moraine dammed — unconsolidated dam, breach-prone" };
    case "M(O)":
      return { score: 25, detail: "Moraine dammed — unconsolidated dam material" };
    case "I(S)":
      return {
        score: 18,
        detail: "Supra-glacial — sits on glacier ice, can coalesce and drain suddenly",
      };
    case "O":
      return { score: 10, detail: "Unclassified glacial lake — dam type unknown" };
    case "E(C)":
      return { score: 3, detail: "Cirque erosion lake — bedrock confined, rarely bursts" };
    case "E(O)":
      return { score: 3, detail: "Glacial erosion lake — bedrock confined, rarely bursts" };
    default:
      // Unknown code: assign the midpoint rather than 0, so an unrecognised
      // classification is flagged for review instead of silently scored safe.
      return { score: 15, detail: `Unrecognised lake type "${glType}" — treated as indeterminate` };
  }
}

/** Score lake area on a log scale, as a proxy for stored volume. */
export function scoreArea(areaHa: number): { score: number; detail: string } {
  if (!Number.isFinite(areaHa) || areaHa <= 0) {
    return { score: 0, detail: "Area unavailable" };
  }
  const lo = Math.log10(AREA_MIN_HA);
  const hi = Math.log10(AREA_MAX_HA);
  const norm = clamp01((Math.log10(areaHa) - lo) / (hi - lo));
  return {
    score: norm * WEIGHT_AREA,
    detail: `${areaHa.toFixed(2)} ha of stored water`,
  };
}

/** Score elevation as a proxy for proximity to actively retreating ice. */
export function scoreElevation(elevM: number): { score: number; detail: string } {
  if (!Number.isFinite(elevM)) return { score: 0, detail: "Elevation unavailable" };
  const norm = clamp01((elevM - ELEV_MIN_M) / (ELEV_MAX_M - ELEV_MIN_M));
  return { score: norm * WEIGHT_ELEVATION, detail: `${Math.round(elevM)} m elevation` };
}

/**
 * Score observed growth from a Mann-Kendall result.
 *
 * Only a statistically significant increasing trend contributes. A significant
 * *decreasing* trend scores zero: a shrinking lake is not accumulating toward
 * its dam's capacity.
 */
export function scoreGrowth(
  trend: MannKendallResult | null | undefined,
  areaHa: number,
): { score: number; detail: string } | null {
  if (!trend) return null;
  if (!trend.significant || trend.trend !== "increasing") {
    return {
      score: 0,
      detail: `No significant growth (p = ${trend.pValue.toFixed(3)})`,
    };
  }
  // Percent of current area gained per year; 5%/yr or more takes full weight.
  const pctPerYear = areaHa > 0 ? (trend.sensSlope / areaHa) * 100 : 0;
  const norm = clamp01(pctPerYear / 5);
  return {
    score: norm * WEIGHT_GROWTH,
    detail: `Expanding ${pctPerYear.toFixed(2)}%/yr (${trend.sensSlope >= 0 ? "+" : ""}${trend.sensSlope.toFixed(3)} ha/yr, p = ${trend.pValue.toFixed(3)})`,
  };
}

/**
 * Score growth from the measured change between inventory epochs.
 *
 * Used when no fitted time series is available. Two observations cannot support
 * a significance test, so the magnitude of the change is used directly and the
 * detail string makes clear it is a two-epoch comparison rather than a trend.
 */
export function scoreMeasuredChange(
  lake: LakeProperties,
): { score: number; detail: string } | null {
  const rate = lake.ChangeRateHaPerYr;
  const pct = lake.AreaChangePct;
  if (rate == null || pct == null || !Number.isFinite(rate)) return null;

  if (rate <= 0) {
    return { score: 0, detail: `Not expanding (${pct.toFixed(1)}% since 2016-17)` };
  }
  const pctPerYear = pct / 5.5;
  const norm = clamp01(pctPerYear / 5);
  return {
    score: norm * WEIGHT_GROWTH,
    detail: `Expanded ${pct.toFixed(1)}% since 2016-17 (${rate >= 0 ? "+" : ""}${rate.toFixed(3)} ha/yr)`,
  };
}

/**
 * Compute the screening index for one lake.
 *
 * @param lake  Inventory properties.
 * @param trend Optional Mann-Kendall result over the lake's area time series.
 *              When omitted, the score is normalised over the remaining
 *              factors rather than penalising the lake for missing data.
 */
export function assessLake(
  lake: LakeProperties,
  trend?: MannKendallResult | null,
): RiskAssessment {
  const area = scoreArea(lake.Area_ha);
  const elev = scoreElevation(lake.Elev_m);

  const factors: RiskFactor[] = [
    { name: "Lake area", score: area.score, max: WEIGHT_AREA, detail: area.detail },
    { name: "Elevation", score: elev.score, max: WEIGHT_ELEVATION, detail: elev.detail },
  ];

  // Dam type is the strongest signal but only the NRSC-derived lakes carry it.
  // Omit the factor entirely when unknown rather than scoring it as safe, so the
  // remaining factors are renormalised instead of every lake looking benign.
  if (lake.GL_Type) {
    const dam = scoreDamType(lake.GL_Type);
    factors.unshift({ name: "Dam type", score: dam.score, max: WEIGHT_DAM_TYPE, detail: dam.detail });
  }

  // Prefer a Mann-Kendall trend when a time series exists; otherwise fall back
  // to the measured change between inventory epochs.
  const growth = trend
    ? scoreGrowth(trend, lake.Area_ha)
    : scoreMeasuredChange(lake);
  if (growth) {
    factors.push({ name: "Growth trend", score: growth.score, max: WEIGHT_GROWTH, detail: growth.detail });
  }

  const total = factors.reduce((s, f) => s + f.score, 0);
  const available = factors.reduce((s, f) => s + f.max, 0);
  const score = available > 0 ? (total / available) * 100 : 0;

  const level: RiskLevel = score >= 60 ? "High" : score >= 35 ? "Moderate" : "Low";

  return {
    id: lake.ID_No,
    name: lake.Name?.trim() || `Unnamed lake ${lake.ID_No}`,
    score: Math.round(score * 10) / 10,
    level,
    factors,
    usedTrend: Boolean(growth),
    areaHa: lake.Area_ha,
    elevationM: lake.Elev_m,
    lakeType: lake.GL_Type ?? "Unclassified",
  };
}

/** Assess many lakes and return them ranked most susceptible first. */
export function rankLakes(
  lakes: LakeProperties[],
  trends?: Map<string, MannKendallResult>,
): RiskAssessment[] {
  return lakes
    .map((l) => assessLake(l, trends?.get(l.ID_No)))
    .sort((a, b) => b.score - a.score);
}
