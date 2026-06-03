import type { Business, DayPoint } from "../types";
import { isoDate } from "../data/rng";

/**
 * Foresight engine. Real trend + weekday-seasonality forecasting over the existing
 * daily series — deterministic, and works on REAL scraped data exactly as on the seeded
 * demo (it only consumes {date, revenue}). Everything here is plain math; no model.
 *
 *   level/trend : least-squares slope on the deseasonalized recent window
 *   seasonality : each weekday's historical ratio to the overall mean
 *   band        : residual σ around the recent trend, widening with horizon
 */

export interface ForecastPoint {
  date: string;
  mean: number;
  lo: number;
  hi: number;
}

const dow = (dateStr: string) => new Date(`${dateStr}T00:00:00`).getDay();

/** Per-weekday multiplicative factors vs the overall mean (1 = average day). */
function weekdayFactors(series: DayPoint[], mean: number): number[] {
  const sums = Array.from({ length: 7 }, () => ({ s: 0, c: 0 }));
  for (const p of series) {
    const d = dow(p.date);
    sums[d].s += p.revenue;
    sums[d].c += 1;
  }
  return sums.map((x) => (x.c && mean ? x.s / x.c / mean : 1));
}

/** Forecast the next `horizon` days. Empty if the history is too short to be meaningful. */
export function forecastDaily(series: DayPoint[], horizon: number): ForecastPoint[] {
  const n = series.length;
  if (n < 8 || horizon < 1) return [];
  const mean = series.reduce((a, p) => a + p.revenue, 0) / n;
  const factor = weekdayFactors(series, mean);
  const deseason = series.map((p) => p.revenue / (factor[dow(p.date)] || 1));

  // Least-squares trend over the recent window (index 0 = start of window, w-1 = last actual).
  const w = Math.min(28, n);
  const recent = deseason.slice(-w);
  const xm = (w - 1) / 2;
  const ym = recent.reduce((a, b) => a + b, 0) / w;
  let num = 0;
  let den = 0;
  for (let i = 0; i < w; i++) {
    num += (i - xm) * (recent[i] - ym);
    den += (i - xm) ** 2;
  }
  const slope = den ? num / den : 0;
  const trendAt = (k: number) => ym + slope * (k - xm);

  // Residual σ around that trend line (deseasonalized units).
  let ss = 0;
  for (let i = 0; i < w; i++) ss += (recent[i] - trendAt(i)) ** 2;
  const sigmaDe = Math.sqrt(ss / Math.max(1, w - 2));

  const last = series[n - 1].date;
  const out: ForecastPoint[] = [];
  for (let h = 1; h <= horizon; h++) {
    const d = new Date(`${last}T00:00:00`);
    d.setDate(d.getDate() + h);
    const ds = isoDate(d);
    const f = factor[dow(ds)] || 1;
    const meanH = Math.max(0, trendAt(w - 1 + h) * f);
    const sig = sigmaDe * f * Math.sqrt(1 + h / 14); // band widens into the future
    out.push({
      date: ds,
      mean: Math.round(meanH),
      lo: Math.max(0, Math.round(meanH - 1.28 * sig)),
      hi: Math.round(meanH + 1.28 * sig),
    });
  }
  return out;
}

export interface ForecastSummary {
  days: number;
  total: number;
  lo: number;
  hi: number;
  dailyAvg: number;
}

/** Aggregate the next `days` of forecast into a single projected total + band. */
export function summarizeForecast(series: DayPoint[], days: number): ForecastSummary | null {
  const fc = forecastDaily(series, days);
  if (!fc.length) return null;
  const total = fc.reduce((a, p) => a + p.mean, 0);
  return {
    days,
    total: Math.round(total),
    lo: Math.round(fc.reduce((a, p) => a + p.lo, 0)),
    hi: Math.round(fc.reduce((a, p) => a + p.hi, 0)),
    dailyAvg: Math.round(total / days),
  };
}

export interface Pace {
  goal: number;
  mtdActual: number;
  expectedByNow: number;
  projectedMonthEnd: number;
  onTrack: boolean;
  daysElapsed: number;
  daysInMonth: number;
  /** Fraction of the goal already booked this month. */
  fractionToGoal: number;
}

/** Month-to-date vs a monthly target, projected to month end via the forecast. USD in, USD out. */
export function paceToGoal(series: DayPoint[], monthlyGoal: number): Pace | null {
  if (!(monthlyGoal > 0) || !series.length) return null;
  const last = series[series.length - 1].date;
  const ym = last.slice(0, 7); // "YYYY-MM"
  const inMonth = series.filter((p) => p.date.slice(0, 7) === ym);
  const mtdActual = inMonth.reduce((a, p) => a + p.revenue, 0);
  const lastDate = new Date(`${last}T00:00:00`);
  const daysElapsed = lastDate.getDate();
  const daysInMonth = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, 0).getDate();
  const remaining = daysInMonth - daysElapsed;
  const fc = remaining > 0 ? summarizeForecast(series, remaining) : null;
  const projectedMonthEnd = Math.round(mtdActual + (fc?.total ?? 0));
  const expectedByNow = Math.round(monthlyGoal * (daysElapsed / daysInMonth));
  return {
    goal: Math.round(monthlyGoal),
    mtdActual: Math.round(mtdActual),
    expectedByNow,
    projectedMonthEnd,
    onTrack: mtdActual >= expectedByNow * 0.98,
    daysElapsed,
    daysInMonth,
    fractionToGoal: monthlyGoal ? mtdActual / monthlyGoal : 0,
  };
}

export interface CashProjection {
  /** {date, revenue} points for the AreaTrend (revenue = projected bankable cash). */
  points: { date: string; revenue: number }[];
  totalIn: number;
  monthlyNet: number;
}

const firstOfMonth = (anchor: string): Date => {
  const d = new Date(`${anchor}T00:00:00`);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Forward cash path: forecast each operating business's revenue, apply its margin, and
 * accumulate the net profit onto idle cash month by month. Growth-aware — unlike a flat
 * run-rate, it bends as each business's trend does. USD throughout (series are USD on load).
 */
export function empireCashProjection(
  businesses: Business[],
  idleCash: number,
  months = 6,
): CashProjection {
  const ops = businesses.filter((b) => b.type !== "portfolio");
  const days = months * 30;
  const dailyNet = new Array(days).fill(0);
  let anchor = "";
  for (const b of ops) {
    if (b.series.length) anchor = b.series.at(-1)!.date > anchor ? b.series.at(-1)!.date : anchor;
    const margin = b.netMargin ?? 0;
    const fc = forecastDaily(b.series, days);
    for (let i = 0; i < fc.length && i < days; i++) dailyNet[i] += fc[i].mean * margin;
  }
  const start = anchor ? firstOfMonth(anchor) : firstOfMonth(isoDate(new Date(2026, 5, 1)));
  const points = [{ date: isoDate(start), revenue: Math.round(idleCash) }];
  let cum = idleCash;
  for (let m = 1; m <= months; m++) {
    cum += dailyNet.slice((m - 1) * 30, m * 30).reduce((a, b) => a + b, 0);
    const d = new Date(start);
    d.setMonth(d.getMonth() + m);
    points.push({ date: isoDate(d), revenue: Math.round(cum) });
  }
  return {
    points,
    totalIn: Math.round(cum),
    monthlyNet: Math.round(dailyNet.slice(0, 30).reduce((a, b) => a + b, 0)),
  };
}
