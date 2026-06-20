import type { Business, DayPoint } from "../types";
import { genSeries } from "./rng";

const DAYS = 90;

function localMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Engineer the latest day to a target multiple of its typical (same-weekday) value. */
function engineerToday(series: DayPoint[], factor: number): void {
  const last = series[series.length - 1];
  const dow = new Date(`${last.date}T00:00:00`).getDay();
  const sameDow = series.slice(0, -1).filter((p) => new Date(`${p.date}T00:00:00`).getDay() === dow).slice(-8);
  const expected = sameDow.reduce((a, b) => a + b.revenue, 0) / Math.max(1, sameDow.length);
  const ticket = last.transactions > 0 ? last.revenue / last.transactions : 13;
  const revenue = Math.round(expected * factor);
  series[series.length - 1] = { ...last, revenue, transactions: Math.max(1, Math.round(revenue / ticket)) };
}

/**
 * Dev's world — a multi-unit operator near Dayton: three Subways (same brand, deliberately
 * different performance so head-to-head benchmarking has a story) plus a liquor store. The
 * three Subways share `brand: "Subway"`, which is what groups them for same-brand comparison.
 */
export function buildDevUnits(asOf: Date = localMidnight()): Business[] {
  const dt = [1.04, 1.0, 0.82]; // today factors: leader steady, mid steady, laggard a down day

  // ─── Subway — Dayton North (the leader) ─────────────────────────────────
  const north = genSeries({
    seed: 2101,
    days: DAYS,
    baseRevenue: 1260,
    avgTicket: 13.4,
    trend: 0.1,
    noise: 0.09,
    dow: [0.78, 1.04, 1.06, 1.05, 1.08, 1.12, 0.92],
    endDate: asOf,
  });
  engineerToday(north, dt[0]);

  // ─── Subway — Huber Heights (the middle) ────────────────────────────────
  const huber = genSeries({
    seed: 2102,
    days: DAYS,
    baseRevenue: 1040,
    avgTicket: 12.5,
    trend: 0.04,
    noise: 0.1,
    dow: [0.8, 1.02, 1.04, 1.03, 1.06, 1.1, 0.9],
    endDate: asOf,
  });
  engineerToday(huber, dt[1]);

  // ─── Subway — Centerville (the laggard that needs attention) ────────────
  const centerville = genSeries({
    seed: 2103,
    days: DAYS,
    baseRevenue: 850,
    avgTicket: 11.8,
    trend: -0.03,
    noise: 0.11,
    dow: [0.82, 1.0, 1.0, 1.0, 1.04, 1.06, 0.94],
    endDate: asOf,
  });
  engineerToday(centerville, dt[2]);

  // ─── Dayton Wine & Spirits (a different vertical in the mix) ────────────
  const liquor = genSeries({
    seed: 2110,
    days: DAYS,
    baseRevenue: 2150,
    avgTicket: 21.5,
    trend: 0.05,
    noise: 0.13,
    dow: [0.92, 0.84, 0.86, 0.92, 1.08, 1.34, 1.26],
    endDate: asOf,
  });
  engineerToday(liquor, 1.06);

  return [
    {
      id: "subway-dayton-north",
      name: "Subway — Dayton North",
      shortName: "Dayton North",
      type: "restaurant",
      location: "Dayton, OH",
      category: "Sandwich franchise",
      accent: "#2bb673",
      series: north,
      capitalDeployed: 245_000,
      netMargin: 0.16,
      brand: "Subway",
    },
    {
      id: "subway-huber-heights",
      name: "Subway — Huber Heights",
      shortName: "Huber Heights",
      type: "restaurant",
      location: "Huber Heights, OH",
      category: "Sandwich franchise",
      accent: "#37a86b",
      series: huber,
      capitalDeployed: 225_000,
      netMargin: 0.15,
      brand: "Subway",
    },
    {
      id: "subway-centerville",
      name: "Subway — Centerville",
      shortName: "Centerville",
      type: "restaurant",
      location: "Centerville, OH",
      category: "Sandwich franchise",
      accent: "#4f9e74",
      series: centerville,
      capitalDeployed: 235_000,
      netMargin: 0.14,
      brand: "Subway",
    },
    {
      id: "liquor-dayton",
      name: "Dayton Wine & Spirits",
      shortName: "Wine & Spirits",
      type: "retail",
      location: "Dayton, OH",
      category: "Liquor store",
      accent: "#9a5b9c",
      series: liquor,
      capitalDeployed: 390_000,
      netMargin: 0.3,
    },
  ];
}
