import type { Business, DayPoint, Holding } from "../types";
import { genSeries, genEquityCurve } from "./rng";

const DAYS = 90;

export const EMPIRE = {
  owner: "Arya",
  /** Uninvested cash sitting in business checking, earning ~nothing */
  idleCash: 42_000,
};

/** Local midnight "today" — the demo series ends here. Recomputed on every build so a
 *  reload (or the daily refresh) rolls the data forward to the current calendar day. */
function localMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Engineer the most recent day to a target multiple of its "expected" value
 * (same weekday, trailing average) so the COO brief has real narrative beats.
 */
function engineerToday(series: DayPoint[], factor: number): void {
  const last = series[series.length - 1];
  const dow = new Date(`${last.date}T00:00:00`).getDay();
  const sameDow = series
    .slice(0, -1)
    .filter((p) => new Date(`${p.date}T00:00:00`).getDay() === dow)
    .slice(-8);
  const expected = sameDow.reduce((a, b) => a + b.revenue, 0) / Math.max(1, sameDow.length);
  const ticket = last.transactions > 0 ? last.revenue / last.transactions : 14;
  const revenue = Math.round(expected * factor);
  series[series.length - 1] = {
    ...last,
    revenue,
    transactions: Math.max(1, Math.round(revenue / ticket)),
  };
}

// ─── Investment Portfolio (positions are fixed; the equity curve re-anchors) ──────
const HOLDINGS: Holding[] = [
  { ticker: "VOO", name: "Vanguard S&P 500", shares: 80, price: 545.0, dayChangePct: 0.007, costBasis: 470 },
  { ticker: "AAPL", name: "Apple", shares: 120, price: 212.4, dayChangePct: 0.009, costBasis: 150 },
  { ticker: "MSFT", name: "Microsoft", shares: 45, price: 470.1, dayChangePct: 0.006, costBasis: 360 },
  { ticker: "NVDA", name: "NVIDIA", shares: 60, price: 158.2, dayChangePct: 0.038, costBasis: 95 },
  { ticker: "TSLA", name: "Tesla", shares: 50, price: 295.0, dayChangePct: -0.014, costBasis: 240 },
  { ticker: "AMZN", name: "Amazon", shares: 40, price: 215.0, dayChangePct: 0.011, costBasis: 165 },
];
const PORTFOLIO_VALUE = HOLDINGS.reduce((a, h) => a + h.shares * h.price, 0);
const PORTFOLIO_COST = HOLDINGS.reduce((a, h) => a + h.shares * h.costBasis, 0);

/**
 * Build the sample businesses with the series ending on `asOf` (default: today at local
 * midnight). Called fresh by `loadBusinesses()` on every load, so the demo data rolls
 * forward to the current day instead of being frozen at first-import time.
 */
export function buildSampleBusinesses(asOf: Date = localMidnight()): Business[] {
  // ─── Subway — Española, ON ──────────────────────────────────────────────
  const subwaySeries = genSeries({
    seed: 1207,
    days: DAYS,
    baseRevenue: 1650,
    avgTicket: 12.75,
    trend: 0.16,
    noise: 0.1,
    // Sun..Sat — lunch-driven, strong Fri/Sat, slow Sun
    dow: [0.82, 1.0, 1.0, 1.02, 1.06, 1.16, 1.12],
    endDate: asOf,
  });
  engineerToday(subwaySeries, 1.12); // a strong day — a "win"

  // ─── Riverside Smoke Shop — Columbus, OH ───────────────────────────────────
  const riversideSeries = genSeries({
    seed: 8843,
    days: DAYS,
    baseRevenue: 1300,
    avgTicket: 15.5,
    trend: 0.07,
    noise: 0.14,
    // Sun..Sat — evening/weekend skew
    dow: [0.95, 0.88, 0.9, 0.96, 1.06, 1.22, 1.25],
    endDate: asOf,
  });
  engineerToday(riversideSeries, 0.78); // down ~22% — the alert that needs the owner

  const portfolioSeries = genEquityCurve(2026, DAYS, PORTFOLIO_VALUE, 0.011, 0.026, asOf);

  return [
    {
      id: "subway-espanola",
      name: "Subway",
      shortName: "Subway",
      type: "restaurant",
      currency: "CAD",
      location: "Española, ON",
      category: "Sandwich franchise",
      accent: "#2bb673",
      series: subwaySeries,
      // $450k CAD purchase (2011) + $150k CAD buildout/renovations.
      capitalDeployed: 600_000,
      netMargin: 0.18,
    },
    {
      id: "riverside-columbus",
      name: "Riverside Smoke Shop",
      shortName: "Riverside",
      type: "retail",
      location: "Columbus, OH",
      category: "Tobacco & vape",
      accent: "#e0913a",
      series: riversideSeries,
      // $475k USD acquisition (2025).
      capitalDeployed: 475_000,
      netMargin: 0.40,
    },
    {
      id: "portfolio",
      name: "Investment Portfolio",
      shortName: "Portfolio",
      type: "portfolio",
      location: "Brokerage",
      category: "Stocks & ETFs",
      accent: "#6fa8dc",
      series: portfolioSeries,
      capitalDeployed: Math.round(PORTFOLIO_COST),
      annualReturn: 0.092,
      holdings: HOLDINGS,
    },
  ];
}

/** One-time snapshot for the very first synchronous render (anchored at app start). */
export const BUSINESSES: Business[] = buildSampleBusinesses();
