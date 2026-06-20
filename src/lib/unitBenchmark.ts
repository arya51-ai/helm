import type { Business, Insight } from "../types";
import type { Metrics } from "./analytics";
import { usd, usdCompact, pct, signedPct } from "./format";

/**
 * Same-brand benchmarking — the multi-unit operator's edge. When an owner runs several of
 * the same thing (three Subways, two of a c-store banner), the sharpest read isn't "how am I
 * doing" but "which of my own units is winning, and what's the gap worth." Same menu, same
 * prices, same brand standards — so a spread between units is operator-fixable, not structural.
 *
 * Groups operating shops by `brand` (only brands with ≥2 units), ranks them on the metrics an
 * operator actually compares, and surfaces the leader→laggard gap as money on the table.
 */

export interface UnitStat {
  id: string;
  name: string;
  shortName: string;
  accent: string;
  revPerDay: number;
  avgTicket: number;
  txPerDay: number;
  roic: number;
  trend: number;
  /** Fraction vs the group leader's revenue/day (0 for the leader, negative below). */
  vsLeader: number;
  rank: number;
}

export interface UnitGroup {
  brand: string;
  units: UnitStat[]; // best → worst by revenue/day
  leader: UnitStat;
  laggard: UnitStat;
  /** (leader − laggard) / leader, as a fraction. */
  spread: number;
  medianRevPerDay: number;
  /** Monthly revenue gap between leader and laggard. */
  monthlyGap: number;
}

function statFor(b: Business, m: Metrics): UnitStat {
  const s = b.series;
  const last30 = s.slice(-30);
  const rev = last30.reduce((a, p) => a + p.revenue, 0);
  const tx = last30.reduce((a, p) => a + p.transactions, 0);
  const l14 = s.slice(-14);
  const p14 = s.slice(-28, -14);
  const a14 = l14.reduce((x, p) => x + p.revenue, 0) / Math.max(1, l14.length);
  const b14 = p14.reduce((x, p) => x + p.revenue, 0) / Math.max(1, p14.length);
  return {
    id: b.id,
    name: b.name,
    shortName: b.shortName ?? b.name,
    accent: b.accent,
    revPerDay: rev / Math.max(1, last30.length),
    avgTicket: tx ? rev / tx : 0,
    txPerDay: tx / Math.max(1, last30.length),
    roic: m.roic,
    trend: b14 ? a14 / b14 - 1 : 0,
    vsLeader: 0,
    rank: 0,
  };
}

/** Group same-brand operating units (≥2 sharing a brand) into ranked peer sets. */
export function unitGroups(businesses: Business[], metricsBy: Record<string, Metrics>): UnitGroup[] {
  const byBrand = new Map<string, Business[]>();
  for (const b of businesses) {
    if (b.type === "portfolio" || b.type === "hotel" || b.type === "fuel") continue;
    if (!b.brand) continue;
    const key = b.brand.trim().toLowerCase();
    if (!byBrand.has(key)) byBrand.set(key, []);
    byBrand.get(key)!.push(b);
  }

  const groups: UnitGroup[] = [];
  for (const [, units] of byBrand) {
    if (units.length < 2) continue;
    const stats = units
      .map((b) => statFor(b, metricsBy[b.id]))
      .filter((s) => s.revPerDay > 0)
      .sort((a, b) => b.revPerDay - a.revPerDay);
    if (stats.length < 2) continue;
    const leader = stats[0];
    const laggard = stats[stats.length - 1];
    stats.forEach((s, i) => {
      s.rank = i + 1;
      s.vsLeader = leader.revPerDay ? s.revPerDay / leader.revPerDay - 1 : 0;
    });
    const sorted = [...stats].sort((a, b) => a.revPerDay - b.revPerDay);
    const median = sorted[Math.floor(sorted.length / 2)].revPerDay;
    groups.push({
      brand: units[0].brand!,
      units: stats,
      leader,
      laggard,
      spread: leader.revPerDay ? (leader.revPerDay - laggard.revPerDay) / leader.revPerDay : 0,
      medianRevPerDay: median,
      monthlyGap: (leader.revPerDay - laggard.revPerDay) * 30,
    });
  }
  return groups.sort((a, b) => b.monthlyGap - a.monthlyGap);
}

/** Cross-unit insight: the leader→laggard gap as a fixable opportunity. */
export function buildUnitInsights(businesses: Business[], metricsBy: Record<string, Metrics>): Insight[] {
  const out: Insight[] = [];
  for (const g of unitGroups(businesses, metricsBy)) {
    if (g.spread < 0.12) continue; // units roughly even — nothing to act on
    out.push({
      id: `unit-compare-${g.brand.toLowerCase().replace(/\s+/g, "-")}`,
      kind: "capital",
      title: `Your ${g.units.length} ${g.brand}s aren't performing the same`,
      detail: `${g.leader.shortName} runs ${usd(g.leader.revPerDay)}/day at a ${usd(
        g.leader.avgTicket,
        true,
      )} ticket; ${g.laggard.shortName} trails ${pct(Math.abs(g.laggard.vsLeader), 0)} at ${usd(
        g.laggard.revPerDay,
      )}. Same menu, same prices — the gap is traffic and attach, not the market. Bring ${
        g.laggard.shortName
      } halfway to ${g.leader.shortName} and that's ~${usdCompact((g.monthlyGap / 2))}/mo more revenue.`,
      priority: 75,
      metric: `${pct(g.spread, 0)} spread`,
      metricUp: false,
      action: { label: "Compare units", done: "Opening comparison ✓" },
    });
  }
  return out;
}

export const UNIT_METRICS: { key: keyof UnitStat; label: string; fmt: (n: number) => string; higherBetter: boolean }[] = [
  { key: "revPerDay", label: "Revenue / day", fmt: (n) => usd(n), higherBetter: true },
  { key: "avgTicket", label: "Avg ticket", fmt: (n) => usd(n, true), higherBetter: true },
  { key: "txPerDay", label: "Transactions / day", fmt: (n) => Math.round(n).toLocaleString(), higherBetter: true },
  { key: "roic", label: "Return on capital", fmt: (n) => pct(n, 0), higherBetter: true },
  { key: "trend", label: "2-week trend", fmt: (n) => signedPct(n, 0), higherBetter: true },
];
