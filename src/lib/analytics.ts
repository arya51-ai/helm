import type { Business, Holding } from "../types";

const YEAR = 365;

export interface Metrics {
  isPortfolio: boolean;
  /** Latest day's revenue (or portfolio value) */
  today: number;
  yesterday: number;
  /** Day-over-day change, fraction */
  dayChange: number;
  /** Expected today from trailing same-weekday average */
  expectedToday: number;
  /** Actual vs expected, fraction (negative = underperforming) */
  vsExpected: number;
  /** Sum of the most recent 7 days */
  weekToDate: number;
  prevWeek: number;
  /** Week-over-week change, fraction */
  wow: number;
  /** Sum of the most recent 30 days */
  last30: number;
  avgTicket: number;
  transactionsToday: number;
  /** Annualized return on deployed capital, fraction */
  roic: number;
  /** Trailing-30-day profit (operating) */
  monthlyProfit: number;
  // Portfolio-only
  marketValue: number;
  costBasis: number;
  totalGain: number;
  totalReturn: number;
  dayChangeUsd: number;
}

function sumRev(b: Business, from: number, to: number): number {
  return b.series.slice(from, to).reduce((a, p) => a + p.revenue, 0);
}

function expectedForLast(b: Business): number {
  const last = b.series[b.series.length - 1];
  const dow = new Date(`${last.date}T00:00:00`).getDay();
  const sameDow = b.series
    .slice(0, -1)
    .filter((p) => new Date(`${p.date}T00:00:00`).getDay() === dow)
    .slice(-8);
  if (!sameDow.length) return last.revenue;
  return sameDow.reduce((a, p) => a + p.revenue, 0) / sameDow.length;
}

export function metricsFor(b: Business): Metrics {
  const n = b.series.length;
  const today = b.series[n - 1].revenue;
  const yesterday = n >= 2 ? b.series[n - 2].revenue : today;
  const dayChange = yesterday ? today / yesterday - 1 : 0;
  const transactionsToday = b.series[n - 1].transactions;

  const weekToDate = sumRev(b, n - 7, n);
  const prevWeek = sumRev(b, n - 14, n - 7);
  const win30 = Math.min(30, n);
  const last30 = sumRev(b, n - win30, n);

  if (b.type === "portfolio") {
    const holdings = b.holdings ?? [];
    const marketValue = holdings.reduce((a, h) => a + h.shares * h.price, 0);
    const costBasis = holdings.reduce((a, h) => a + h.shares * h.costBasis, 0);
    const dayChangeUsd = holdings.reduce((a, h) => a + h.shares * h.price * h.dayChangePct, 0);
    const totalGain = marketValue - costBasis;
    // Stable annualized return (configured) for an apples-to-apples ROIC vs businesses
    const first = b.series[0].revenue;
    const windowReturn = first ? marketValue / first - 1 : 0;
    const roic = b.annualReturn ?? Math.pow(1 + windowReturn, YEAR / n) - 1;
    return {
      isPortfolio: true,
      today: marketValue,
      yesterday: marketValue - dayChangeUsd,
      dayChange: marketValue ? dayChangeUsd / (marketValue - dayChangeUsd) : 0,
      expectedToday: marketValue,
      vsExpected: 0,
      weekToDate,
      prevWeek,
      wow: prevWeek ? weekToDate / prevWeek - 1 : 0,
      last30,
      avgTicket: 0,
      transactionsToday: 0,
      roic,
      monthlyProfit: 0,
      marketValue,
      costBasis,
      totalGain,
      totalReturn: costBasis ? totalGain / costBasis : 0,
      dayChangeUsd,
    };
  }

  const expectedToday = expectedForLast(b);
  const margin = b.netMargin ?? 0;
  // Normalize by the actual days available so ROIC is right for any history length
  const dailyAvg = win30 ? last30 / win30 : 0;
  const monthlyProfit = dailyAvg * 30 * margin;
  const annualProfit = dailyAvg * YEAR * margin;
  const roic = b.capitalDeployed ? annualProfit / b.capitalDeployed : 0;

  return {
    isPortfolio: false,
    today,
    yesterday,
    dayChange,
    expectedToday,
    vsExpected: expectedToday ? today / expectedToday - 1 : 0,
    weekToDate,
    prevWeek,
    wow: prevWeek ? weekToDate / prevWeek - 1 : 0,
    last30,
    avgTicket: transactionsToday ? today / transactionsToday : 0,
    transactionsToday,
    roic,
    monthlyProfit,
    marketValue: 0,
    costBasis: 0,
    totalGain: 0,
    totalReturn: 0,
    dayChangeUsd: 0,
  };
}

export interface EmpireSummary {
  /** Combined revenue today across operating businesses (excludes portfolio) */
  revenueToday: number;
  revenueYesterday: number;
  revenueDayChange: number;
  weekToDate: number;
  last30: number;
  /** Net worth = total assets − total liabilities */
  netWorth: number;
  investments: number;
  cash: number;
  businessEquity: number;
  /** Total assets = investments + cash + business equity + manual assets. */
  totalAssets: number;
  /** User-entered manual assets (real estate, savings elsewhere, etc.). */
  manualAssets: number;
  /** Total liabilities (mortgages, loans, cards) — net worth subtracts these. */
  liabilities: number;
  /** Net worth $ change today (driven by the portfolio's daily move) */
  netWorthDayChange: number;
  /** Combined 14-day operating revenue series for the hero chart */
  combinedSeries: { date: string; revenue: number }[];
  /** Latest date present across operating businesses (ISO). Often lags the real calendar day. */
  asOf: string;
}

export function empireSummary(
  businesses: Business[],
  metricsBy: Record<string, Metrics>,
  idleCash: number,
  manual?: { assets: number; liabilities: number },
): EmpireSummary {
  const ops = businesses.filter((b) => b.type !== "portfolio");
  const portfolio = businesses.find((b) => b.type === "portfolio");
  const pm = portfolio ? metricsBy[portfolio.id] : undefined;

  const revenueToday = ops.reduce((a, b) => a + metricsBy[b.id].today, 0);
  const revenueYesterday = ops.reduce((a, b) => a + metricsBy[b.id].yesterday, 0);
  const weekToDate = ops.reduce((a, b) => a + metricsBy[b.id].weekToDate, 0);
  const last30 = ops.reduce((a, b) => a + metricsBy[b.id].last30, 0);

  const investments = pm?.marketValue ?? 0;
  const businessEquity = ops.reduce((a, b) => a + b.capitalDeployed, 0);
  const manualAssets = manual?.assets ?? 0;
  const liabilities = manual?.liabilities ?? 0;
  const totalAssets = investments + idleCash + businessEquity + manualAssets;
  const netWorth = totalAssets - liabilities;

  // Combined operating revenue across the last 14 distinct dates (hero chart).
  // Aligned by date so businesses with different histories still sum correctly.
  const byBizDate = new Map<string, Map<string, number>>();
  const dateSet = new Set<string>();
  for (const b of ops) {
    const m = new Map<string, number>();
    for (const p of b.series.slice(-21)) {
      m.set(p.date, p.revenue);
      dateSet.add(p.date);
    }
    byBizDate.set(b.id, m);
  }
  const dates = [...dateSet].sort().slice(-14);
  const combinedSeries = dates.map((date) => ({
    date,
    revenue: ops.reduce((a, b) => a + (byBizDate.get(b.id)?.get(date) ?? 0), 0),
  }));

  const asOf = ops.reduce((mx, b) => {
    const d = b.series.at(-1)?.date ?? "";
    return d > mx ? d : mx;
  }, "");

  return {
    revenueToday,
    revenueYesterday,
    revenueDayChange: revenueYesterday ? revenueToday / revenueYesterday - 1 : 0,
    weekToDate,
    last30,
    netWorth,
    investments,
    cash: idleCash,
    businessEquity,
    totalAssets,
    manualAssets,
    liabilities,
    netWorthDayChange: pm?.dayChangeUsd ?? 0,
    combinedSeries,
    asOf,
  };
}
