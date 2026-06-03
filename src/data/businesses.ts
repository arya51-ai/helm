import type { Business, DayPoint, Holding } from "../types";
import { genSeries, genEquityCurve } from "./rng";

/** "Today" — anchored to local midnight so the series ends on the current day. */
const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();
const DAYS = 90;

export const EMPIRE = {
  owner: "Arya",
  /** Uninvested cash sitting in business checking, earning ~nothing */
  idleCash: 42_000,
};

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

// ─── Subway — Española, ON ────────────────────────────────────────────────
const subwaySeries = genSeries({
  seed: 1207,
  days: DAYS,
  baseRevenue: 1650,
  avgTicket: 12.75,
  trend: 0.16,
  noise: 0.1,
  // Sun..Sat — lunch-driven, strong Fri/Sat, slow Sun
  dow: [0.82, 1.0, 1.0, 1.02, 1.06, 1.16, 1.12],
  endDate: TODAY,
});
engineerToday(subwaySeries, 1.12); // a strong day — a "win"

// ─── Havana Smoke Shop — Columbus, OH ─────────────────────────────────────
const havanaSeries = genSeries({
  seed: 8843,
  days: DAYS,
  baseRevenue: 1300,
  avgTicket: 15.5,
  trend: 0.07,
  noise: 0.14,
  // Sun..Sat — evening/weekend skew
  dow: [0.95, 0.88, 0.9, 0.96, 1.06, 1.22, 1.25],
  endDate: TODAY,
});
engineerToday(havanaSeries, 0.78); // down ~22% — the alert that needs the owner

// ─── Investment Portfolio ─────────────────────────────────────────────────
const holdings: Holding[] = [
  { ticker: "VOO", name: "Vanguard S&P 500", shares: 80, price: 545.0, dayChangePct: 0.007, costBasis: 470 },
  { ticker: "AAPL", name: "Apple", shares: 120, price: 212.4, dayChangePct: 0.009, costBasis: 150 },
  { ticker: "MSFT", name: "Microsoft", shares: 45, price: 470.1, dayChangePct: 0.006, costBasis: 360 },
  { ticker: "NVDA", name: "NVIDIA", shares: 60, price: 158.2, dayChangePct: 0.038, costBasis: 95 },
  { ticker: "TSLA", name: "Tesla", shares: 50, price: 295.0, dayChangePct: -0.014, costBasis: 240 },
  { ticker: "AMZN", name: "Amazon", shares: 40, price: 215.0, dayChangePct: 0.011, costBasis: 165 },
];
const portfolioValue = holdings.reduce((a, h) => a + h.shares * h.price, 0);
const portfolioCost = holdings.reduce((a, h) => a + h.shares * h.costBasis, 0);
const portfolioSeries = genEquityCurve(2026, DAYS, portfolioValue, 0.011, 0.026, TODAY);

export const BUSINESSES: Business[] = [
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
    capitalDeployed: 250_000,
    netMargin: 0.085,
  },
  {
    id: "havana-columbus",
    name: "Havana Smoke Shop",
    shortName: "Havana",
    type: "retail",
    location: "Columbus, OH",
    category: "Tobacco & vape",
    accent: "#e0913a",
    series: havanaSeries,
    capitalDeployed: 185_000,
    netMargin: 0.135,
  },
  {
    id: "portfolio",
    name: "Investment Portfolio",
    shortName: "Portfolio",
    type: "portfolio",
    location: "Brokerage",
    category: "Stocks & ETFs",
    accent: "#7c6cf5",
    series: portfolioSeries,
    capitalDeployed: Math.round(portfolioCost),
    annualReturn: 0.092,
    holdings,
  },
];
