import type { DayPoint } from "../types";

/**
 * Pure pattern-extraction over a daily revenue series. These are the signals a sharp
 * operator would pull out by hand — weekday shape, momentum across horizons, ticket drift,
 * seasonality, volatility — computed once here and shared by the deep-insight generator and
 * the baked COO brief so both reason over the same numbers. Everything is currency-agnostic
 * (operates on whatever currency the series is already in) and length-safe.
 */

export const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const dowOf = (date: string) => new Date(`${date}T00:00:00`).getDay();
const monthOf = (date: string) => Number(date.slice(5, 7));
const sumRev = (a: DayPoint[]) => a.reduce((s, p) => s + p.revenue, 0);
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

/** Sum the `n` days ending `offset` days before the series end. */
function windowSum(series: DayPoint[], n: number, offset = 0): number {
  const end = series.length - offset;
  return sumRev(series.slice(Math.max(0, end - n), Math.max(0, end)));
}

export interface WeekdayProfile {
  /** Mean revenue indexed by JS weekday (0 = Sunday). */
  byDow: number[];
  dailyAvg: number;
  weekdayAvg: number;
  weekendAvg: number;
  /** Weekday index of the strongest / weakest day. */
  best: number;
  worst: number;
  /** Best / worst day as a fraction vs the overall daily average. */
  bestGap: number;
  worstGap: number;
  /** Weekend vs weekday, as a fraction (negative = weekends slower). */
  weekendGap: number;
}

export function weekdayProfile(series: DayPoint[], weeks = 12): WeekdayProfile {
  const recent = series.slice(-weeks * 7);
  const byDow = DOW.map((_, i) => mean(recent.filter((p) => dowOf(p.date) === i).map((p) => p.revenue)));
  const dailyAvg = mean(recent.map((p) => p.revenue)) || 1;
  const weekdayAvg = mean(recent.filter((p) => dowOf(p.date) >= 1 && dowOf(p.date) <= 5).map((p) => p.revenue));
  const weekendAvg = mean(recent.filter((p) => dowOf(p.date) === 0 || dowOf(p.date) === 6).map((p) => p.revenue));
  const best = byDow.indexOf(Math.max(...byDow));
  const worst = byDow.indexOf(Math.min(...byDow));
  return {
    byDow,
    dailyAvg,
    weekdayAvg,
    weekendAvg,
    best,
    worst,
    bestGap: byDow[best] / dailyAvg - 1,
    worstGap: byDow[worst] / dailyAvg - 1,
    weekendGap: weekdayAvg ? weekendAvg / weekdayAvg - 1 : 0,
  };
}

export interface Momentum {
  /** Last 30 days vs the 30 before, as a fraction. */
  m30: number;
  /** Last 90 days vs the 90 before. */
  m90: number;
  /** Trailing 12mo vs the prior 12mo — null when <~2yr of history. */
  yoy: number | null;
  lastYear: number | null;
  prevYear: number | null;
}

export function momentum(series: DayPoint[]): Momentum {
  const l30 = windowSum(series, 30);
  const p30 = windowSum(series, 30, 30);
  const l90 = windowSum(series, 90);
  const p90 = windowSum(series, 90, 90);
  const has2yr = series.length >= 720;
  const lastYear = has2yr ? windowSum(series, 365) : null;
  const prevYear = has2yr ? windowSum(series, 365, 365) : null;
  return {
    m30: p30 ? l30 / p30 - 1 : 0,
    m90: p90 ? l90 / p90 - 1 : 0,
    yoy: lastYear && prevYear ? lastYear / prevYear - 1 : null,
    lastYear,
    prevYear,
  };
}

function ticketOver(series: DayPoint[], n: number, offset = 0): number {
  const end = series.length - offset;
  const w = series.slice(Math.max(0, end - n), Math.max(0, end));
  const rev = sumRev(w);
  const tx = w.reduce((s, p) => s + p.transactions, 0);
  return tx ? rev / tx : 0;
}

export interface TicketTrend {
  now: number;
  prev: number;
  change: number;
}

/** Average ticket now (last 30d) vs a quarter ago (the 30d window 60–90 days back). */
export function ticketTrend(series: DayPoint[]): TicketTrend {
  const now = ticketOver(series, 30);
  const prev = ticketOver(series, 30, 60);
  return { now, prev, change: prev ? now / prev - 1 : 0 };
}

export interface Seasonality {
  strongest: { month: number; name: string; avg: number };
  weakest: { month: number; name: string; avg: number };
  /** Trough vs peak, as a fraction (negative). */
  spread: number;
}

/** Calendar-month seasonality — needs ~10 months of history or returns null. */
export function seasonality(series: DayPoint[]): Seasonality | null {
  if (series.length < 300) return null;
  const buckets: Record<number, number[]> = {};
  for (const p of series) (buckets[monthOf(p.date)] ??= []).push(p.revenue);
  const ranked = Object.entries(buckets)
    .map(([m, vals]) => ({ month: Number(m), name: MONTHS[Number(m)], avg: mean(vals) }))
    .sort((a, b) => b.avg - a.avg);
  if (ranked.length < 6) return null;
  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];
  return { strongest, weakest, spread: strongest.avg ? weakest.avg / strongest.avg - 1 : 0 };
}

/** Coefficient of variation of daily revenue (a clean "how swingy is this business" number). */
export function volatilityCV(series: DayPoint[], lastN = 60): number {
  const w = series.slice(-lastN).map((p) => p.revenue);
  const m = mean(w);
  if (!m) return 0;
  const sd = Math.sqrt(mean(w.map((x) => (x - m) ** 2)));
  return sd / m;
}
