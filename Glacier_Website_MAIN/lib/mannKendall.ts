/**
 * Mann-Kendall trend test and Sen's slope estimator.
 *
 * Used to decide whether a glacial lake's area series shows a statistically
 * significant trend over time. The Mann-Kendall test is non-parametric: it
 * assumes no particular distribution and is robust to outliers, which suits
 * short, noisy satellite-derived area series.
 *
 * References:
 *   Mann (1945), Econometrica 13(3):245-259
 *   Kendall (1975), Rank Correlation Methods
 *   Sen (1968), J. Am. Stat. Assoc. 63(324):1379-1389
 */

export type TrendDirection = "increasing" | "decreasing" | "no trend";

export interface MannKendallResult {
  /** Number of observations used. */
  n: number;
  /** Mann-Kendall S statistic: sum of signs of all pairwise differences. */
  S: number;
  /** Variance of S, corrected for ties. */
  varS: number;
  /** Normal approximation test statistic (continuity-corrected). */
  z: number;
  /** Two-tailed p-value. */
  pValue: number;
  /** Kendall's tau-b, in [-1, 1]. */
  tau: number;
  /** Direction, at the requested significance level. */
  trend: TrendDirection;
  /** True when pValue < alpha. */
  significant: boolean;
  /** Significance level used. */
  alpha: number;
  /** Sen's slope: median pairwise rate of change, in units per unit time. */
  sensSlope: number;
  /** Total change implied by Sen's slope across the observed span. */
  totalChange: number;
}

/**
 * Standard normal cumulative distribution function.
 *
 * Uses the Abramowitz & Stegun 7.1.26 rational approximation to erf, whose
 * absolute error is below 1.5e-7 — far tighter than needed for reporting
 * p-values to three decimal places.
 */
function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;

  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-z * z);

  return 0.5 * (1 + sign * y);
}

/** Median of a numeric array. Does not modify the input. */
function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Run the Mann-Kendall trend test on a series.
 *
 * @param values  Observations in chronological order (e.g. lake area per year).
 * @param times   Optional matching time coordinates (e.g. years). Defaults to
 *                0..n-1. Used only for Sen's slope, so that unevenly spaced
 *                observations produce a correct per-unit-time rate.
 * @param alpha   Significance level for classifying the trend. Default 0.05.
 *
 * @throws Error if fewer than 3 finite observations are supplied, or if
 *         `times` is given with a different length to `values`.
 */
export function mannKendall(
  values: number[],
  times?: number[],
  alpha = 0.05,
): MannKendallResult {
  if (times && times.length !== values.length) {
    throw new Error(
      `times has length ${times.length} but values has length ${values.length}`,
    );
  }

  // Drop non-finite entries (a year with no cloud-free imagery yields no area).
  const paired: Array<[number, number]> = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const t = times ? times[i] : i;
    if (Number.isFinite(v) && Number.isFinite(t)) paired.push([t, v]);
  }
  paired.sort((a, b) => a[0] - b[0]);

  const n = paired.length;
  if (n < 3) {
    throw new Error(`Mann-Kendall needs at least 3 finite observations, got ${n}`);
  }

  const t = paired.map((p) => p[0]);
  const x = paired.map((p) => p[1]);

  // --- S statistic -------------------------------------------------------
  let S = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      S += Math.sign(x[j] - x[i]);
    }
  }

  // --- Variance of S, corrected for ties ---------------------------------
  const counts = new Map<number, number>();
  for (const v of x) counts.set(v, (counts.get(v) ?? 0) + 1);
  let tieTerm = 0;
  let tiePairs = 0;
  for (const c of counts.values()) {
    if (c > 1) {
      tieTerm += c * (c - 1) * (2 * c + 5);
      tiePairs += (c * (c - 1)) / 2;
    }
  }
  const varS = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;

  // --- Normal approximation with continuity correction -------------------
  let z = 0;
  if (varS > 0) {
    if (S > 0) z = (S - 1) / Math.sqrt(varS);
    else if (S < 0) z = (S + 1) / Math.sqrt(varS);
  }

  const pValue = 2 * (1 - normalCdf(Math.abs(z)));

  // --- Kendall's tau-b ---------------------------------------------------
  // Time values are distinct after sorting, so only the data series contributes ties.
  const n0 = (n * (n - 1)) / 2;
  const denominator = Math.sqrt((n0 - tiePairs) * n0);
  const tau = denominator > 0 ? S / denominator : 0;

  // --- Sen's slope -------------------------------------------------------
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const dt = t[j] - t[i];
      if (dt !== 0) slopes.push((x[j] - x[i]) / dt);
    }
  }
  const sensSlope = median(slopes);

  const significant = pValue < alpha;
  const trend: TrendDirection = !significant
    ? "no trend"
    : S > 0
      ? "increasing"
      : "decreasing";

  return {
    n,
    S,
    varS,
    z,
    pValue,
    tau,
    trend,
    significant,
    alpha,
    sensSlope,
    totalChange: sensSlope * (t[n - 1] - t[0]),
  };
}

/** Format a result as a short human-readable sentence for the dashboard. */
export function describeTrend(result: MannKendallResult, unit = "ha"): string {
  const rate = `${result.sensSlope >= 0 ? "+" : ""}${result.sensSlope.toFixed(3)} ${unit}/yr`;
  if (!result.significant) {
    return `No statistically significant trend (p = ${result.pValue.toFixed(3)}, ${rate}).`;
  }
  const direction = result.trend === "increasing" ? "Increasing" : "Decreasing";
  return `${direction} trend, significant at α = ${result.alpha} (p = ${result.pValue.toFixed(3)}, Sen's slope ${rate}).`;
}
