import type { DayPoint } from "../types";

/** Deterministic seeded PRNG so the mock data is stable across reloads. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface SeriesOpts {
  seed: number;
  days: number;
  /** Average revenue on a normal weekday */
  baseRevenue: number;
  /** Revenue per transaction */
  avgTicket: number;
  /** Total fractional growth across the window, e.g. 0.16 = +16% start→end */
  trend: number;
  /** Fractional noise amplitude, e.g. 0.10 */
  noise: number;
  /** Length-7 day-of-week multipliers, index 0 = Sunday */
  dow: number[];
  endDate: Date;
}

/** Generate a realistic daily revenue series with weekly seasonality + payday bumps. */
export function genSeries(opts: SeriesOpts): DayPoint[] {
  const rnd = mulberry32(opts.seed);
  const out: DayPoint[] = [];
  for (let i = opts.days - 1; i >= 0; i--) {
    const d = new Date(opts.endDate);
    d.setDate(d.getDate() - i);
    const dowMult = opts.dow[d.getDay()];
    const progress = (opts.days - 1 - i) / (opts.days - 1);
    const trendMult = 1 + opts.trend * progress;
    const dom = d.getDate();
    const payday = dom <= 2 || dom === 15 || dom === 16 ? 1.07 : 1;
    const noiseMult = 1 + (rnd() - 0.5) * 2 * opts.noise;
    const revenue = opts.baseRevenue * dowMult * trendMult * payday * noiseMult;
    const ticket = opts.avgTicket * (1 + (rnd() - 0.5) * 0.12);
    out.push({
      date: isoDate(d),
      revenue: Math.round(revenue),
      transactions: Math.max(1, Math.round(revenue / ticket)),
    });
  }
  return out;
}

/** Generate a portfolio equity curve (revenue field carries account value). */
export function genEquityCurve(
  seed: number,
  days: number,
  endValue: number,
  dailyVol: number,
  totalDrift: number,
  endDate: Date,
): DayPoint[] {
  const rnd = mulberry32(seed);
  const raw: number[] = [];
  let v = 1;
  for (let i = 0; i < days; i++) {
    const drift = totalDrift / days;
    const shock = (rnd() - 0.5) * 2 * dailyVol;
    v = v * (1 + drift + shock);
    raw.push(v);
  }
  const scale = endValue / raw[raw.length - 1];
  const out: DayPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - (days - 1 - i));
    out.push({ date: isoDate(d), revenue: Math.round(raw[i] * scale), transactions: 0 });
  }
  return out;
}
