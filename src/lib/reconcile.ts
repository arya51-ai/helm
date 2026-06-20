import type { DayPoint } from "../types";

/**
 * Trust math for imported data. Answers the two questions a skeptical owner asks:
 *   1. "Did it get all my days?"  → coverage + gaps + freshness   (dataHealth)
 *   2. "Does the total match my POS?" → reconcile against their own reported number.
 * Both are arithmetic, not AI — they're meant to be checkable by hand.
 */

export interface DataHealth {
  days: number;            // rows actually present
  rangeStart: string;
  rangeEnd: string;
  expectedDays: number;    // calendar days in [start, end] inclusive
  coverage: number;        // days / expectedDays (0..1)
  missing: string[];       // missing ISO dates within the range (capped for display)
  missingCount: number;
  freshnessDays: number;   // calendar days between rangeEnd and today
  totalRevenue: number;
  totalTransactions: number;
}

function isoOfDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`);
  return Math.round(ms / 86400000);
}

export function dataHealth(series: DayPoint[]): DataHealth | null {
  if (!series.length) return null;
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const rangeStart = sorted[0].date;
  const rangeEnd = sorted[sorted.length - 1].date;
  const expectedDays = Math.max(1, daysBetween(rangeStart, rangeEnd) + 1);

  const present = new Set(sorted.map((p) => p.date));
  const missing: string[] = [];
  const start = new Date(`${rangeStart}T00:00:00`);
  for (let i = 0; i < expectedDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const iso = isoOfDate(d);
    if (!present.has(iso)) missing.push(iso);
  }

  return {
    days: sorted.length,
    rangeStart,
    rangeEnd,
    expectedDays,
    coverage: sorted.length / expectedDays,
    missing: missing.slice(0, 24),
    missingCount: missing.length,
    freshnessDays: Math.max(0, daysBetween(rangeEnd, isoOfDate(new Date()))),
    totalRevenue: sorted.reduce((a, p) => a + p.revenue, 0),
    totalTransactions: sorted.reduce((a, p) => a + p.transactions, 0),
  };
}

export type ReconcileStatus = "match" | "close" | "off";

export interface Reconciliation {
  reportedTotal: number;
  importedTotal: number;
  diff: number; // imported − reported
  matchPct: number; // imported / reported
  status: ReconcileStatus;
}

/** Compare Helm's imported total against the total the owner reads off their own POS report. */
export function reconcile(importedTotal: number, reportedTotal: number): Reconciliation | null {
  if (!(reportedTotal > 0)) return null;
  const diff = importedTotal - reportedTotal;
  const matchPct = importedTotal / reportedTotal;
  const off = Math.abs(1 - matchPct);
  const status: ReconcileStatus = off <= 0.005 ? "match" : off <= 0.03 ? "close" : "off";
  return { reportedTotal, importedTotal, diff, matchPct, status };
}
