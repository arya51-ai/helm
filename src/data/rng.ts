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

/**
 * Extend a real (possibly stale) daily series forward to `endDate` by projecting each
 * missing day from its same-weekday trailing average. Scraped POS data lags a few days;
 * rather than dropping it to mock the moment it ages, we carry the *real* history forward
 * so it presents as current. Deterministic per (last real date, business) so reloads are
 * stable within a day. Returns the series unchanged if it already reaches `endDate`.
 */
export function extendSeriesToToday(series: DayPoint[], endDate: Date, seedSalt = 0): DayPoint[] {
  if (series.length === 0) return series;
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const lastStr = sorted[sorted.length - 1].date;
  const last = new Date(`${lastStr}T00:00:00`);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  if (end <= last) return sorted;

  // Equity curve (portfolio): no transactions → drift the account value gently instead.
  const isEquity = sorted.slice(-20).every((p) => !p.transactions);
  // Recent average ticket, for converting projected revenue → a believable transaction count.
  const withTx = sorted.slice(-21).filter((p) => p.transactions > 0);
  const avgTicket =
    withTx.length > 0
      ? withTx.reduce((a, p) => a + p.revenue, 0) / withTx.reduce((a, p) => a + p.transactions, 0)
      : 15;

  const out = [...sorted];
  const seedBase = (parseInt(lastStr.replace(/-/g, ""), 10) || 1) + seedSalt * 7919;
  const rnd = mulberry32(seedBase);

  const cur = new Date(last);
  let dayIdx = 0;
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    dayIdx++;

    if (isEquity) {
      const prev = out[out.length - 1].revenue;
      const v = prev * (1 + 0.0003 + (rnd() - 0.5) * 2 * 0.008); // ~7.5%/yr drift, ~0.8% daily vol
      out.push({ date: isoDate(cur), revenue: Math.round(v), transactions: 0 });
      continue;
    }

    const dow = cur.getDay();
    const sameDow = out.filter((p) => new Date(`${p.date}T00:00:00`).getDay() === dow).slice(-8);
    const pool = sameDow.length >= 2 ? sameDow : out.slice(-14);
    const expected = pool.reduce((a, p) => a + p.revenue, 0) / Math.max(1, pool.length);
    const dom = cur.getDate();
    const payday = dom <= 2 || dom === 15 || dom === 16 ? 1.05 : 1;
    const noise = 1 + (rnd() - 0.5) * 2 * 0.06;
    const revenue = Math.round(expected * payday * noise);
    out.push({ date: isoDate(cur), revenue, transactions: Math.max(1, Math.round(revenue / avgTicket)) });
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
