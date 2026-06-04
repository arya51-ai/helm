import type { Business, DayPoint } from "../types";
import { buildFit } from "./forecast";
import { daysAgo } from "./format";

/**
 * Anomaly detection. Scores each recent day against the SAME trend+weekday-seasonality
 * fit the forecast uses (forecast.ts `buildFit`), in units of residual σ — so "off" means
 * statistically off for THIS business on THIS weekday, not just below a flat threshold.
 * Catches single-day outliers (|z| ≥ threshold) and sustained streaks (≥3 days the same
 * direction past ~1σ). Plain math, deterministic, works identically on real scraped data.
 *
 * The differentiator: run it across every business and rank one feed — the cross-empire
 * "what actually changed" no single-POS agent can assemble.
 */

const dowOf = (d: string) => new Date(`${d}T00:00:00`).getDay();

export type AnomalyKind = "spike" | "dip" | "streak-up" | "streak-down";

export interface Anomaly {
  businessId: string;
  businessName: string;
  /** Run start (== endDate for a single day). */
  date: string;
  /** Most recent day of the run. */
  endDate: string;
  kind: AnomalyKind;
  /** Signed σ (averaged over the run for streaks). */
  z: number;
  actual: number;
  expected: number;
  /** actual − expected, USD (summed over a streak). */
  delta: number;
  vsExpected: number;
  runLength: number;
  /** Days between endDate and the latest calendar day. */
  recencyDays: number;
  /** Ranking score: magnitude × surprise × recency. */
  severity: number;
}

export interface AnomalyOpts {
  /** How many recent days to scan (capped by the fit window, ~28). */
  lookback?: number;
  /** σ threshold for a single-day anomaly. */
  z?: number;
}

interface Scored {
  i: number;
  p: DayPoint;
  expected: number;
  z: number;
}

function severity(z: number, delta: number, recencyDays: number): number {
  const recency = 1 / (1 + Math.max(0, recencyDays) / 3);
  return Math.abs(z) * Math.sqrt(Math.abs(delta)) * recency;
}

function pointAnomaly(b: Business, r: Scored): Anomaly {
  const delta = r.p.revenue - r.expected;
  const recencyDays = daysAgo(r.p.date);
  return {
    businessId: b.id,
    businessName: b.name,
    date: r.p.date,
    endDate: r.p.date,
    kind: r.z >= 0 ? "spike" : "dip",
    z: r.z,
    actual: Math.round(r.p.revenue),
    expected: Math.round(r.expected),
    delta: Math.round(delta),
    vsExpected: r.expected ? r.p.revenue / r.expected - 1 : 0,
    runLength: 1,
    recencyDays,
    severity: severity(r.z, delta, recencyDays),
  };
}

function streakAnomaly(b: Business, run: Scored[]): Anomaly {
  const actual = run.reduce((a, r) => a + r.p.revenue, 0);
  const expected = run.reduce((a, r) => a + r.expected, 0);
  const delta = actual - expected;
  const z = run.reduce((a, r) => a + r.z, 0) / run.length;
  const endDate = run[run.length - 1].p.date;
  const recencyDays = daysAgo(endDate);
  return {
    businessId: b.id,
    businessName: b.name,
    date: run[0].p.date,
    endDate,
    kind: z >= 0 ? "streak-up" : "streak-down",
    z,
    actual: Math.round(actual),
    expected: Math.round(expected),
    delta: Math.round(delta),
    vsExpected: expected ? actual / expected - 1 : 0,
    runLength: run.length,
    recencyDays,
    severity: severity(z, delta, recencyDays) * 1.15, // sustained beats a one-off
  };
}

/** All anomalies for one business, most severe first. */
export function detectAnomalies(b: Business, opts: AnomalyOpts = {}): Anomaly[] {
  const zT = opts.z ?? 2;
  const n = b.series.length;
  const fit = buildFit(b.series);
  if (!fit || n < 10) return [];
  const span = Math.min(opts.lookback ?? 21, fit.w);

  const scored: Scored[] = [];
  for (let i = n - span; i < n; i++) {
    const k = i - (n - fit.w);
    if (k < 0) continue;
    const p = b.series[i];
    const f = fit.factor[dowOf(p.date)] || 1;
    const expected = Math.max(0, fit.trendAt(k) * f);
    const sigma = Math.max(1, fit.sigmaDe * f);
    scored.push({ i, p, expected, z: (p.revenue - expected) / sigma });
  }

  const out: Anomaly[] = [];
  // 1) Single-day outliers.
  for (const r of scored) if (Math.abs(r.z) >= zT) out.push(pointAnomaly(b, r));

  // 2) Sustained streaks (≥3 same-direction days past ~0.8σ) — a pattern a single point misses.
  let run: Scored[] = [];
  let sign = 0;
  const flush = () => {
    if (run.length >= 3) out.push(streakAnomaly(b, run));
    run = [];
  };
  for (const r of scored) {
    const s = r.z >= 0.8 ? 1 : r.z <= -0.8 ? -1 : 0;
    if (s !== 0 && s === sign) {
      run.push(r);
    } else {
      flush();
      sign = s;
      run = s !== 0 ? [r] : [];
    }
  }
  flush();

  return out.sort((a, b) => b.severity - a.severity);
}

/** One ranked feed across every operating business — the cross-empire "what changed". */
export function empireAnomalies(businesses: Business[], opts: AnomalyOpts = {}): Anomaly[] {
  return businesses
    .filter((b) => b.type !== "portfolio")
    .flatMap((b) => detectAnomalies(b, opts))
    .sort((a, b) => b.severity - a.severity);
}

/**
 * ISO date → kind, for marking single-day outliers on the calendar. Uses the same
 * criteria as the "what changed" feed (≥1.5σ and a material % move) so a flagged day in
 * one always matches the other.
 */
export function anomalyMarks(b: Business): Record<string, "spike" | "dip"> {
  const marks: Record<string, "spike" | "dip"> = {};
  for (const a of detectAnomalies(b, { lookback: 90, z: 1.5 })) {
    if (a.runLength === 1 && Math.abs(a.vsExpected) >= 0.08) marks[a.date] = a.kind === "spike" ? "spike" : "dip";
  }
  return marks;
}
