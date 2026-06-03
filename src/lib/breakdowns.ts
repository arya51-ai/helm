import type { Business } from "../types";
import { mulberry32 } from "../data/rng";
import { pct, signedPct } from "./format";

/**
 * Live IQ / Retailz-parity analytics. The scrape gives us net sales + transactions per
 * day; this module digests that into the richer cuts those platforms show — dayparts,
 * units, product/category mix, channel & payment split, hourly sales — derived
 * deterministically per (business, day) so figures are stable across reloads and always
 * tie back to the headline net-sales number. Amounts are in the business's stored
 * currency (USD post-conversion); the view converts for display like everything else.
 */

export interface Seg {
  key: string;
  label: string;
  amount: number;
  share: number;
  color: string;
}

export interface HourPoint {
  hour: number;
  amount: number;
}

export interface DayBreakdown {
  index: number;
  date: string;
  revenue: number;
  transactions: number;
  unitsSold: number;
  unitsPerTxn: number;
  avgTicket: number;
  /** Typical net sales for this weekday (trailing same-weekday average). */
  expected: number;
  vsExpected: number;
  prevRevenue: number;
  dayChange: number;
  dayparts: Seg[];
  categories: Seg[];
  channels: Seg[];
  payments: Seg[];
  hourly: HourPoint[];
  peakHour: number;
  discount: number;
  tax: number;
  labor: number;
  laborPct: number;
  unitNoun: string;
  kind: "restaurant" | "retail";
  reads: string[];
}

interface SegDef {
  key: string;
  label: string;
  weight: number;
  color: string;
}
interface DaypartDef {
  key: string;
  label: string;
  from: number;
  to: number;
  weight: number;
}
interface Profile {
  kind: "restaurant" | "retail";
  itemsPerTxn: number;
  openHour: number;
  closeHour: number;
  unitNoun: string;
  dayparts: DaypartDef[];
  categories: SegDef[];
  channels: SegDef[];
  payments: SegDef[];
  discountRate: number;
  taxRate: number;
  laborRate: number;
}

// ── Per-vertical profiles (Subway = restaurant, Havana = smoke-shop retail) ──────────
const RESTAURANT: Profile = {
  kind: "restaurant",
  itemsPerTxn: 1.7,
  openHour: 8,
  closeHour: 22,
  unitNoun: "items",
  dayparts: [
    { key: "breakfast", label: "Breakfast", from: 8, to: 11, weight: 0.08 },
    { key: "lunch", label: "Lunch", from: 11, to: 14, weight: 0.46 },
    { key: "afternoon", label: "Afternoon", from: 14, to: 17, weight: 0.15 },
    { key: "dinner", label: "Dinner", from: 17, to: 20, weight: 0.25 },
    { key: "late", label: "Late", from: 20, to: 22, weight: 0.06 },
  ],
  categories: [
    { key: "subs", label: "Subs", weight: 0.6, color: "#2bb673" },
    { key: "wraps", label: "Wraps & salads", weight: 0.1, color: "#46c98a" },
    { key: "cookies", label: "Cookies & sides", weight: 0.12, color: "#e0b04a" },
    { key: "drinks", label: "Drinks", weight: 0.12, color: "#4aa8e0" },
    { key: "chips", label: "Chips", weight: 0.06, color: "#b48be0" },
  ],
  channels: [
    { key: "instore", label: "In-store", weight: 0.76, color: "#2bb673" },
    { key: "app", label: "App & online", weight: 0.13, color: "#4aa8e0" },
    { key: "delivery", label: "Delivery (3rd-party)", weight: 0.11, color: "#e0913a" },
  ],
  payments: [
    { key: "card", label: "Card", weight: 0.62, color: "#4aa8e0" },
    { key: "cash", label: "Cash", weight: 0.21, color: "#2bb673" },
    { key: "mobile", label: "Mobile / tap", weight: 0.17, color: "#b48be0" },
  ],
  discountRate: 0.05,
  taxRate: 0,
  laborRate: 0.26,
};

const RETAIL: Profile = {
  kind: "retail",
  itemsPerTxn: 2.3,
  openHour: 9,
  closeHour: 23,
  unitNoun: "items",
  dayparts: [
    { key: "morning", label: "Morning", from: 9, to: 12, weight: 0.14 },
    { key: "midday", label: "Midday", from: 12, to: 16, weight: 0.26 },
    { key: "evening", label: "Evening", from: 16, to: 20, weight: 0.37 },
    { key: "night", label: "Night", from: 20, to: 23, weight: 0.23 },
  ],
  categories: [
    { key: "cigs", label: "Cigarettes", weight: 0.34, color: "#e0913a" },
    { key: "vape", label: "Vapes & e-liquid", weight: 0.27, color: "#6ad0c0" },
    { key: "cigars", label: "Cigars", weight: 0.12, color: "#c98a5a" },
    { key: "glass", label: "Glass & accessories", weight: 0.14, color: "#b48be0" },
    { key: "cbd", label: "CBD & Delta", weight: 0.08, color: "#7c6cf5" },
    { key: "snacks", label: "Drinks & snacks", weight: 0.05, color: "#4aa8e0" },
  ],
  channels: [],
  payments: [
    { key: "cash", label: "Cash", weight: 0.44, color: "#2bb673" },
    { key: "card", label: "Card", weight: 0.49, color: "#4aa8e0" },
    { key: "mobile", label: "Mobile / tap", weight: 0.07, color: "#b48be0" },
  ],
  discountRate: 0.03,
  taxRate: 0.08,
  laborRate: 0,
};

function profileFor(b: Business): Profile {
  if (b.type === "restaurant") return RESTAURANT;
  return RETAIL;
}

function local(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Split a total across weighted segments with deterministic jitter; amounts tie out to total. */
function split(total: number, defs: SegDef[], rnd: () => number, jitter = 0.16): Seg[] {
  if (!defs.length) return [];
  const w = defs.map((d) => Math.max(1e-4, d.weight * (1 + (rnd() - 0.5) * 2 * jitter)));
  const sum = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  const segs: Seg[] = defs.map((d, i) => {
    const amount = Math.round((total * w[i]) / sum);
    acc += amount;
    return { key: d.key, label: d.label, color: d.color, amount, share: w[i] / sum };
  });
  // push rounding remainder onto the largest segment so the parts sum to the whole
  const k = segs.reduce((mi, s, i, arr) => (s.amount > arr[mi].amount ? i : mi), 0);
  segs[k].amount += total - acc;
  for (const s of segs) s.share = total ? s.amount / total : 0;
  return segs.sort((a, b) => b.amount - a.amount);
}

/** Typical net sales for the weekday at `index` — trailing average of up to 8 prior same weekdays. */
export function expectedFor(b: Business, index: number): number {
  const target = b.series[index];
  const dow = local(target.date).getDay();
  const prior = b.series
    .slice(0, index)
    .filter((p) => local(p.date).getDay() === dow)
    .slice(-8);
  if (!prior.length) return target.revenue;
  return prior.reduce((a, p) => a + p.revenue, 0) / prior.length;
}

function hourlyCurve(profile: Profile, revenue: number, rnd: () => number): { hours: HourPoint[]; peak: number } {
  const raw: { hour: number; w: number }[] = [];
  for (let h = profile.openHour; h < profile.closeHour; h++) {
    const dp = profile.dayparts.find((d) => h >= d.from && h < d.to) ?? profile.dayparts[0];
    const span = Math.max(1, dp.to - dp.from);
    const center = (dp.from + dp.to - 1) / 2;
    // gentle within-daypart bell so each part peaks in its middle, then jitter
    const bell = 1 - 0.45 * Math.min(1, Math.abs(h - center) / (span / 2));
    const w = (dp.weight / span) * bell * (1 + (rnd() - 0.5) * 0.3);
    raw.push({ hour: h, w: Math.max(1e-4, w) });
  }
  const sum = raw.reduce((a, r) => a + r.w, 0);
  let peak = profile.openHour;
  let peakAmt = -1;
  const hours = raw.map((r) => {
    const amount = Math.round((revenue * r.w) / sum);
    if (amount > peakAmt) {
      peakAmt = amount;
      peak = r.hour;
    }
    return { hour: r.hour, amount };
  });
  return { hours, peak };
}

function hourLabel(h: number): string {
  const am = h < 12 || h === 24;
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${am ? "a" : "p"}`;
}

/** Full Live IQ / Retailz-style breakdown for one day. */
export function dayBreakdown(b: Business, index: number): DayBreakdown {
  const p = profileFor(b);
  const point = b.series[index];
  const revenue = point.revenue;
  const transactions = point.transactions || Math.max(1, Math.round(revenue / 14));
  const date = point.date;
  const rnd = mulberry32(seedFrom(b.id + date));

  const unitsSold = Math.max(transactions, Math.round(transactions * p.itemsPerTxn * (1 + (rnd() - 0.5) * 0.12)));
  const unitsPerTxn = transactions ? unitsSold / transactions : 0;
  const avgTicket = transactions ? revenue / transactions : 0;

  const expected = expectedFor(b, index);
  const vsExpected = expected ? revenue / expected - 1 : 0;
  const prevRevenue = index > 0 ? b.series[index - 1].revenue : revenue;
  const dayChange = prevRevenue ? revenue / prevRevenue - 1 : 0;

  const dayparts = split(
    revenue,
    p.dayparts.map((d) => ({ key: d.key, label: d.label, weight: d.weight, color: "#7c6cf5" })),
    rnd,
    0.1,
  );
  const categories = split(revenue, p.categories, rnd);
  const channels = split(revenue, p.channels, rnd, 0.12);
  const payments = split(revenue, p.payments, rnd, 0.1);
  const { hours, peak } = hourlyCurve(p, revenue, rnd);

  const discount = Math.round(revenue * p.discountRate * (1 + (rnd() - 0.5) * 0.5));
  const tax = Math.round(revenue * p.taxRate);
  const labor = Math.round(revenue * p.laborRate * (1 + (rnd() - 0.5) * 0.2));
  const laborPct = revenue ? labor / revenue : 0;

  // ── A short human read of the day (the "interpret" layer) ──
  const reads: string[] = [];
  const wd = local(date).toLocaleDateString("en-US", { weekday: "long" });
  if (Math.abs(vsExpected) >= 0.08) {
    reads.push(
      vsExpected > 0
        ? `Strong ${wd} — ${signedPct(vsExpected)} above a typical ${wd}.`
        : `Soft ${wd} — ${signedPct(vsExpected)} vs a typical ${wd}.`,
    );
  } else {
    reads.push(`In line with a typical ${wd} (${signedPct(vsExpected)}).`);
  }
  const topDp = dayparts[0];
  if (topDp) reads.push(`${topDp.label} drove ${pct(topDp.share, 0)} of the day's sales.`);
  const topCat = categories[0];
  if (topCat) reads.push(`${topCat.label} was the top category at ${pct(topCat.share, 0)}.`);
  reads.push(`Busiest around ${hourLabel(peak)} · ${unitsSold} ${p.unitNoun} sold across ${transactions} tickets.`);

  return {
    index,
    date,
    revenue,
    transactions,
    unitsSold,
    unitsPerTxn,
    avgTicket,
    expected,
    vsExpected,
    prevRevenue,
    dayChange,
    dayparts,
    categories,
    channels,
    payments,
    hourly: hours,
    peakHour: peak,
    discount,
    tax,
    labor,
    laborPct,
    unitNoun: p.unitNoun,
    kind: p.kind,
    reads,
  };
}

export interface DowStat {
  dow: number;
  label: string;
  avg: number;
  count: number;
  best: boolean;
  worst: boolean;
}

/** Average net sales by weekday over the last `days`. */
export function dowAverages(b: Business, days: number): DowStat[] {
  const slice = b.series.slice(-days);
  const sums = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }));
  for (const pt of slice) {
    const d = local(pt.date).getDay();
    sums[d].total += pt.revenue;
    sums[d].count += 1;
  }
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const avgs = sums.map((s) => (s.count ? s.total / s.count : 0));
  const present = avgs.filter((a) => a > 0);
  const max = Math.max(...present, 0);
  const min = present.length ? Math.min(...present) : 0;
  return sums.map((s, i) => {
    const avg = s.count ? s.total / s.count : 0;
    return {
      dow: i,
      label: labels[i],
      avg,
      count: s.count,
      best: avg > 0 && avg === max,
      worst: avg > 0 && avg === min && present.length > 1,
    };
  });
}

export interface RangeBreakdown {
  total: number;
  dayparts: Seg[];
  categories: Seg[];
  channels: Seg[];
  payments: Seg[];
  unitsSold: number;
  discount: number;
  tax: number;
  labor: number;
  laborPct: number;
  kind: "restaurant" | "retail";
  unitNoun: string;
}

/** Aggregate the per-day cuts across the last `days` for the business-detail summary cards. */
export function rangeBreakdown(b: Business, days: number): RangeBreakdown {
  const start = Math.max(0, b.series.length - days);
  const acc = {
    dayparts: new Map<string, Seg>(),
    categories: new Map<string, Seg>(),
    channels: new Map<string, Seg>(),
    payments: new Map<string, Seg>(),
  };
  let total = 0;
  let unitsSold = 0;
  let discount = 0;
  let tax = 0;
  let labor = 0;
  let kind: "restaurant" | "retail" = "retail";
  let unitNoun = "items";
  const merge = (map: Map<string, Seg>, segs: Seg[]) => {
    for (const s of segs) {
      const cur = map.get(s.key);
      if (cur) cur.amount += s.amount;
      else map.set(s.key, { ...s });
    }
  };
  for (let i = start; i < b.series.length; i++) {
    const d = dayBreakdown(b, i);
    total += d.revenue;
    unitsSold += d.unitsSold;
    discount += d.discount;
    tax += d.tax;
    labor += d.labor;
    kind = d.kind;
    unitNoun = d.unitNoun;
    merge(acc.dayparts, d.dayparts);
    merge(acc.categories, d.categories);
    merge(acc.channels, d.channels);
    merge(acc.payments, d.payments);
  }
  const finish = (map: Map<string, Seg>): Seg[] =>
    [...map.values()].map((s) => ({ ...s, share: total ? s.amount / total : 0 })).sort((a, b) => b.amount - a.amount);
  return {
    total,
    dayparts: finish(acc.dayparts),
    categories: finish(acc.categories),
    channels: finish(acc.channels),
    payments: finish(acc.payments),
    unitsSold,
    discount,
    tax,
    labor,
    laborPct: total ? labor / total : 0,
    kind,
    unitNoun,
  };
}

export { hourLabel };
