import type { Business, Holding } from "../types";
import { genEquityCurve } from "../data/rng";
import { knownName } from "./quotes";

/**
 * Parse a brokerage positions export (Yahoo Finance, Robinhood, Fidelity, Schwab,
 * or generic) into normalized holdings. Column names vary by broker, so we
 * auto-detect by header synonyms.
 */
const SYM = ["symbol", "ticker"];
const QTY = ["quantity", "qty", "shares", "share", "units"];
const PRICE = ["current price", "last price", "market price", "price", "last", "mark"];
const COST_SHARE = ["purchase price", "average cost", "avg cost", "average cost basis", "cost/share", "cost per share", "unit cost"];
const COST_TOTAL = ["cost basis", "total cost", "cost value"];
const NAME = ["name", "description", "security", "company"];
const CHG_PCT = ["change %", "% change", "percent change", "day change %", "chg %", "change percent"];
const CHG_ABS = ["change", "day change", "$ change", "chg"];

function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}
function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}
function pick(headers: string[], keys: string[]): number {
  for (const k of keys) {
    const i = headers.indexOf(k);
    if (i >= 0) return i;
  }
  for (const k of keys) {
    const i = headers.findIndex((h) => h.includes(k));
    if (i >= 0) return i;
  }
  return -1;
}

export interface ParsedHoldings {
  holdings: Holding[];
  detected: { ticker: string; shares: string; price: string | null; cost: string | null };
  skipped: number;
}

export async function parseHoldingsFile(file: File): Promise<ParsedHoldings> {
  const XLSX = await import("xlsx"); // lazy — SheetJS only loads when a file is actually parsed
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: false });
  if (!rows.length) throw new Error("That file looks empty.");

  let hi = rows.findIndex((r) => (r as unknown[]).filter((c) => c !== "" && c != null).length >= 2);
  if (hi < 0) hi = 0;
  const headers = (rows[hi] as unknown[]).map(norm);

  const si = pick(headers, SYM);
  const qi = pick(headers, QTY);
  const pi = pick(headers, PRICE);
  const cShare = pick(headers, COST_SHARE);
  const cTotal = pick(headers, COST_TOTAL);
  const ni = pick(headers, NAME);
  const chgPct = pick(headers, CHG_PCT);
  const chgAbs = pick(headers, CHG_ABS);

  if (si < 0 || qi < 0) {
    throw new Error("Couldn't find Symbol and Quantity columns. Make sure the file has a header row.");
  }

  const holdings: Holding[] = [];
  let skipped = 0;
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row) continue;
    const ticker = String(row[si] ?? "").trim().toUpperCase();
    const shares = toNum(row[qi]);
    if (!ticker || shares <= 0) {
      skipped++;
      continue;
    }
    const price = pi >= 0 ? toNum(row[pi]) : 0;
    let costBasis = cShare >= 0 ? toNum(row[cShare]) : 0;
    if (!costBasis && cTotal >= 0) costBasis = toNum(row[cTotal]) / shares; // total → per share
    if (!costBasis) costBasis = price; // unknown → no gain/loss
    let changePct = 0;
    if (chgPct >= 0) changePct = toNum(row[chgPct]) / 100;
    else if (chgAbs >= 0 && price) {
      const abs = toNum(row[chgAbs]);
      changePct = price - abs !== 0 ? abs / (price - abs) : 0;
    }
    const name = ni >= 0 ? String(row[ni] ?? "").trim() || knownName(ticker) : knownName(ticker);
    holdings.push({ ticker, name, shares, price: price || costBasis, dayChangePct: changePct, costBasis });
  }
  if (!holdings.length) throw new Error("No positions found in that file.");

  return {
    holdings,
    detected: {
      ticker: headers[si] || "symbol",
      shares: headers[qi] || "quantity",
      price: pi >= 0 ? headers[pi] : null,
      cost: cShare >= 0 ? headers[cShare] : cTotal >= 0 ? headers[cTotal] : null,
    },
    skipped,
  };
}

const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

/** Build/replace the portfolio business from a set of holdings. */
export function buildPortfolioBusiness(existing: Business | undefined, holdings: Holding[]): Business {
  const marketValue = holdings.reduce((a, h) => a + h.shares * h.price, 0);
  const cost = holdings.reduce((a, h) => a + h.shares * h.costBasis, 0);
  // Cosmetic equity curve ending at current value (ROIC uses annualReturn, not this).
  const series = genEquityCurve(7, 120, Math.max(1, marketValue), 0.011, 0.05, TODAY);
  return {
    id: "portfolio",
    type: "portfolio",
    name: existing?.name ?? "Investment Portfolio",
    shortName: existing?.shortName ?? "Portfolio",
    currency: "USD",
    location: existing?.location ?? "Brokerage",
    category: existing?.category ?? "Stocks & ETFs",
    accent: existing?.accent ?? "#7c6cf5",
    series,
    capitalDeployed: Math.max(1, Math.round(cost)),
    annualReturn: existing?.annualReturn ?? 0.1,
    holdings,
  };
}
