import type { Business, Currency, DayPoint } from "../types";
import { toDisplayCurrency } from "./currency";

/**
 * Frontend client for the Helm Tally connector (server/tally.mjs at /api/tally).
 * TallyPrime is India's dominant SMB accounting system; the connector pulls a daily
 * sales series from its local HTTP-XML gateway (or serves a realistic INR demo when
 * Tally isn't reachable). Defensive: throws only on a hard failure; callers fall back.
 */
export interface TallyResult {
  company: string;
  currency: string; // typically "INR"
  series: DayPoint[];
  totals: { days: number; revenue: number; transactions: number };
  demo: boolean;
  note?: string;
}

export async function tallyStatus(): Promise<{ reachable: boolean; configured: boolean; demo: boolean }> {
  try {
    const r = await fetch("/api/tally/status");
    if (!r.ok) return { reachable: false, configured: false, demo: false };
    const d = await r.json();
    return { reachable: true, configured: !!d.configured, demo: !!d.demo };
  } catch {
    return { reachable: false, configured: false, demo: false };
  }
}

export async function tallySync(days = 90): Promise<TallyResult> {
  const r = await fetch("/api/tally/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ days }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !Array.isArray(d.series) || !d.series.length) {
    throw new Error(d.error || "Tally returned no data. Is the connector running?");
  }
  return {
    company: d.company || "Tally business",
    currency: d.currency || "INR",
    series: d.series as DayPoint[],
    totals: d.totals || { days: d.series.length, revenue: 0, transactions: 0 },
    demo: !!d.demo,
    note: d.note,
  };
}

/**
 * Build a Business from a Tally pull. Returns BOTH the native-currency version (for
 * persistence — `loadBusinesses` re-converts on reload) and the display-converted
 * version (for immediate state, so totals are correct without a flash).
 */
export function tallyToBusiness(result: TallyResult, opts?: { name?: string }): { native: Business; display: Business } {
  const name = (opts?.name || result.company || "Tally business").trim();
  const id =
    "tally-" +
    (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28) || "business");
  const native: Business = {
    id,
    name,
    shortName: name.split(/\s+/)[0],
    type: "retail",
    currency: (result.currency as Currency) || "INR",
    location: "India",
    category: "Tally · accounting",
    accent: "#10b981",
    series: result.series,
    capitalDeployed: 4_000_000, // ₹ native default (~$48k); owner refines in Economics editor
    netMargin: 0.09,
  };
  const display = toDisplayCurrency([native])[0];
  return { native, display };
}
