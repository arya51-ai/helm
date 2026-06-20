import type { Business } from "../types";
import {
  type NetWorthStore,
  manualAssetTotal,
  manualLiabilityTotal,
  extraMonthlyNet,
} from "../data/networth";
import { isoDate } from "../data/rng";

/**
 * Net-worth intelligence. Reconstructs a daily net-worth curve from the same series the
 * rest of Helm already trusts, then projects it forward and scores its health. Pure math —
 * no model, deterministic, and works on real imported data exactly as on the demo.
 *
 * The honest decomposition (why the line is believable):
 *   • investments  — the brokerage account's real daily value (moves every day).
 *   • businessEquity — invested capital plus accumulated retained earnings, back-cast by
 *                    un-accruing each day's profit so the curve lands exactly on today and
 *                    rises smoothly. Earnings build equity (not idle cash), so this works
 *                    whether profit is small (a shop) or large (a hotel group).
 *   • cash         — idle cash on hand, held roughly flat (distributions keep it from
 *                    silently absorbing every dollar of profit).
 *   • other / liabilities — manual assets and debts, held at today's value (no history known).
 *
 * Day-to-day movement therefore comes from the markets (real) plus retained earnings
 * (smooth) — which is exactly how a real owner's net worth behaves.
 */

export interface NetWorthPoint {
  date: string;
  netWorth: number;
  investments: number;
  businessEquity: number;
  cash: number;
  other: number;
  liabilities: number;
}

export interface NetWorthBand {
  date: string;
  mean: number;
  lo: number;
  hi: number;
}

export interface HealthFactor {
  key: "liquidity" | "leverage" | "diversification" | "growth";
  label: string;
  score: number;
  detail: string;
}

export interface HealthScore {
  score: number;
  grade: string;
  factors: HealthFactor[];
}

export interface Milestone {
  next: number;
  prev: number;
  progress: number;
  etaMonths: number | null;
  etaDate: string | null;
}

export interface AttributionItem {
  label: string;
  delta: number;
  color: string;
}

export interface NetWorthIntel {
  history: NetWorthPoint[];
  projection: NetWorthBand[];
  current: NetWorthPoint;
  windowDays: number;
  change1d: number;
  change7d: number;
  change30d: number;
  changeWindow: number;
  /** Annualized growth rate implied by the window (fraction). */
  growthRate: number;
  attribution: AttributionItem[];
  health: HealthScore;
  milestone: Milestone;
  /** Projected net worth mean at the +12mo horizon (or end of projection). */
  projectedYear: number;
  liquidNow: number;
}

const MS_DAY = 86_400_000;
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

function addMonths(iso: string, m: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + m);
  return isoDate(d);
}

const TIERS = [
  100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000,
  100_000_000, 250_000_000,
];

export function buildNetWorthIntel(
  businesses: Business[],
  idleCash: number,
  store: NetWorthStore,
  opts?: { windowDays?: number; projMonths?: number },
): NetWorthIntel | null {
  const windowDays = opts?.windowDays ?? 90;
  const projMonths = opts?.projMonths ?? 12;

  const ops = businesses.filter((b) => b.type !== "portfolio");
  const portfolio = businesses.find((b) => b.type === "portfolio");

  // ── Date axis: union of every series' dates, trailing `windowDays` ───────────────
  const dateSet = new Set<string>();
  for (const b of businesses) for (const p of b.series) dateSet.add(p.date);
  const axis = [...dateSet].sort().slice(-windowDays);
  if (axis.length < 2) return null;

  // ── Per-business revenue lookup, and portfolio value lookup (carry-forward) ──────
  const revByBiz = new Map<string, Map<string, number>>();
  for (const b of ops) revByBiz.set(b.id, new Map(b.series.map((p) => [p.date, p.revenue])));

  const pVal = new Map<string, number>();
  if (portfolio) for (const p of portfolio.series) pVal.set(p.date, p.revenue);
  const investmentsAt = (() => {
    let lastV = portfolio?.series[0]?.revenue ?? 0;
    return (date: string): number => {
      const v = pVal.get(date);
      if (v != null) lastV = v;
      return lastV;
    };
  })();

  // ── Constant components (today's snapshot; no daily history to vary them) ─────────
  const businessEquity = ops.reduce((a, b) => a + b.capitalDeployed, 0);
  const other = manualAssetTotal(store);
  const liabilities = manualLiabilityTotal(store);
  const extraDaily = extraMonthlyNet(store) / 30;

  // ── Equity back-cast: today's equity minus everything earned after each day ──────
  // Retained earnings accrue into business equity (a large base that never clamps),
  // while idle cash stays flat — so the curve is smooth for a corner store and a hotel
  // group alike, instead of spiking when monthly profit dwarfs the cash balance.
  const margin = new Map(ops.map((b) => [b.id, b.netMargin ?? 0]));
  const dayProfit = (date: string): number => {
    let s = 0;
    for (const b of ops) s += (revByBiz.get(b.id)!.get(date) ?? 0) * (margin.get(b.id) ?? 0);
    return s + extraDaily;
  };
  // suffix accrual: profitAfter[k] = sum of profit for days strictly after k
  const accr = axis.map(dayProfit);
  const profitAfter = new Array(axis.length).fill(0);
  for (let k = axis.length - 2; k >= 0; k--) profitAfter[k] = profitAfter[k + 1] + accr[k + 1];

  const history: NetWorthPoint[] = axis.map((date, k) => {
    const investments = investmentsAt(date);
    const equity = Math.max(0, businessEquity - profitAfter[k]);
    const netWorth = investments + idleCash + equity + other - liabilities;
    return { date, netWorth, investments, businessEquity: equity, cash: idleCash, other, liabilities };
  });

  const current = history[history.length - 1];
  const at = (daysBack: number): NetWorthPoint =>
    history[Math.max(0, history.length - 1 - daysBack)];

  const change1d = current.netWorth - at(1).netWorth;
  const change7d = current.netWorth - at(7).netWorth;
  const change30d = current.netWorth - at(30).netWorth;
  const windowStart = history[0];
  const changeWindow = current.netWorth - windowStart.netWorth;

  const yearsSpan = (axis.length - 1) / 365;
  const growthRate =
    windowStart.netWorth > 0 && current.netWorth > 0 && yearsSpan > 0
      ? Math.pow(current.netWorth / windowStart.netWorth, 1 / yearsSpan) - 1
      : 0;

  // ── Attribution over the last 30d (what actually moved) ──────────────────────────
  const ref = at(30);
  const attribution: AttributionItem[] = [
    { label: "Investments", delta: current.investments - ref.investments, color: "#7c6cf5" },
    { label: "Retained profit", delta: current.businessEquity - ref.businessEquity, color: "#34d399" },
  ];
  if (current.other - ref.other !== 0)
    attribution.push({ label: "Other assets", delta: current.other - ref.other, color: "#10b981" });
  if (current.liabilities - ref.liabilities !== 0)
    attribution.push({ label: "Debt paydown", delta: ref.liabilities - current.liabilities, color: "#fb7185" });

  // ── Forward projection (monthly, with a market-driven band) ──────────────────────
  const annual = portfolio?.annualReturn ?? 0.08;
  const monthlyProfit = accr.slice(-30).reduce((a, b) => a + b, 0); // last 30d retained + manual
  const invNow = current.investments;
  const monthlyVol = 0.045; // ~typical diversified-equity monthly σ
  const projection: NetWorthBand[] = [
    { date: current.date, mean: current.netWorth, lo: current.netWorth, hi: current.netWorth },
  ];
  for (let m = 1; m <= projMonths; m++) {
    const inv = invNow * Math.pow(1 + annual, m / 12);
    // Retained earnings compound into equity; idle cash stays flat (mirrors the history model).
    const equity = businessEquity + monthlyProfit * m;
    const mean = inv + idleCash + equity + other - liabilities;
    // Cone widens on two independent sources: market volatility on the investments, and
    // operating-profit variance on the retained-earnings path (a random-walk in monthly profit).
    const sigmaMarket = invNow * monthlyVol * Math.sqrt(m);
    const sigmaProfit = Math.abs(monthlyProfit) * 0.4 * Math.sqrt(m);
    const sigma = Math.sqrt(sigmaMarket * sigmaMarket + sigmaProfit * sigmaProfit);
    projection.push({
      date: addMonths(current.date, m),
      mean: Math.round(mean),
      lo: Math.round(mean - 1.28 * sigma),
      hi: Math.round(mean + 1.28 * sigma),
    });
  }
  const projectedYear = projection[projection.length - 1].mean;

  // ── Health score ─────────────────────────────────────────────────────────────────
  const liquidNow = current.investments + current.cash;
  const totalAssets = liquidNow + businessEquity + other;
  const leverageRatio = totalAssets > 0 ? liabilities / totalAssets : 0;
  const liquidityRatio = totalAssets > 0 ? liquidNow / totalAssets : 0;

  // concentration across asset buckets (lower HHI = better spread)
  const buckets = [current.investments, current.cash, other, ...ops.map((b) => b.capitalDeployed)].filter(
    (v) => v > 0,
  );
  const hhi = totalAssets > 0 ? buckets.reduce((a, v) => a + (v / totalAssets) ** 2, 0) : 1;

  const leverageScore = clamp(100 * (1 - leverageRatio / 0.5));
  const liquidityScore = clamp((liquidityRatio / 0.3) * 100);
  const diversificationScore = clamp((1 - hhi) * 135);
  const growthScore = clamp(50 + growthRate * 400);

  const factors: HealthFactor[] = [
    {
      key: "liquidity",
      label: "Liquidity",
      score: Math.round(liquidityScore),
      detail: `${Math.round(liquidityRatio * 100)}% of assets are liquid (cash + investments)`,
    },
    {
      key: "leverage",
      label: "Leverage",
      score: Math.round(leverageScore),
      detail:
        liabilities > 0
          ? `Debt is ${Math.round(leverageRatio * 100)}% of assets`
          : "Debt-free — no liabilities recorded",
    },
    {
      key: "diversification",
      label: "Diversification",
      score: Math.round(diversificationScore),
      detail: `${buckets.length} asset bucket${buckets.length === 1 ? "" : "s"}; largest is ${Math.round(
        (Math.max(...buckets, 0) / Math.max(1, totalAssets)) * 100,
      )}% of the pie`,
    },
    {
      key: "growth",
      label: "Growth",
      score: Math.round(growthScore),
      detail:
        growthRate >= 0
          ? `Trending +${(growthRate * 100).toFixed(1)}%/yr`
          : `Trending ${(growthRate * 100).toFixed(1)}%/yr`,
    },
  ];
  const composite = Math.round(
    leverageScore * 0.25 + liquidityScore * 0.2 + diversificationScore * 0.25 + growthScore * 0.3,
  );
  const grade =
    composite >= 90 ? "A+" : composite >= 80 ? "A" : composite >= 70 ? "B+" : composite >= 60 ? "B" : composite >= 50 ? "C" : "D";

  const health: HealthScore = { score: composite, grade, factors };

  // ── Milestone ──────────────────────────────────────────────────────────────────
  const nw = current.netWorth;
  const nextIdx = TIERS.findIndex((t) => t > nw);
  const next = nextIdx >= 0 ? TIERS[nextIdx] : Math.ceil(nw / 50_000_000) * 50_000_000 + 50_000_000;
  const prev = nextIdx > 0 ? TIERS[nextIdx - 1] : nextIdx === 0 ? 0 : next - 50_000_000;
  const progress = next > prev ? clamp(((nw - prev) / (next - prev)) * 100) / 100 : 0;
  const hitMonth = projection.findIndex((p) => p.mean >= next);
  const milestone: Milestone = {
    next,
    prev,
    progress,
    etaMonths: hitMonth > 0 ? hitMonth : null,
    etaDate: hitMonth > 0 ? projection[hitMonth].date : null,
  };

  return {
    history,
    projection,
    current,
    windowDays: axis.length,
    change1d,
    change7d,
    change30d,
    changeWindow,
    growthRate,
    attribution,
    health,
    milestone,
    projectedYear,
    liquidNow,
  };
}
