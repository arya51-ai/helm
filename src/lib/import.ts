import * as XLSX from "xlsx";
import type { DayPoint } from "../types";

export interface ParsedImport {
  series: DayPoint[];
  detected: { date: string; revenue: string; transactions: string | null };
  totalRevenue: number;
  totalTransactions: number;
  skipped: number;
}

// Header synonyms, most-specific first.
const DATE_KEYS = ["date", "business date", "businessdate", "trade date", "sale date", "saledate", "day"];
const REV_KEYS = [
  "net sales", "net_sales", "netsales", "net sale", "net-sale", "net",
  "revenue", "sales", "gross sales", "gross_sales", "total sales", "total", "gross", "amount",
];
const TXN_KEYS = [
  "transactions", "transaction count", "txns", "cust", "customers", "customer count",
  "tickets", "receipts", "orders", "checks", "guests", "tender count", "tendercount", "count",
];

function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return iso(v);
  if (typeof v === "number") {
    // Excel serial date
    const parsed = XLSX.SSF?.parse_date_code?.(v);
    if (parsed && parsed.y) return `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`;
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : iso(d);
  }
  const d = new Date(String(v).trim());
  return isNaN(d.getTime()) ? null : iso(d);
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function pickColumn(headers: string[], keys: string[]): number {
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

/** Parse a CSV/XLSX/XLS sales export into a normalized daily series. */
export async function parseSalesFile(file: File): Promise<ParsedImport> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: false });
  if (!rows.length) throw new Error("That file looks empty.");

  // Header = first row with at least two non-empty cells.
  let hi = rows.findIndex((r) => (r as unknown[]).filter((c) => c !== "" && c != null).length >= 2);
  if (hi < 0) hi = 0;
  const headers = (rows[hi] as unknown[]).map(norm);

  let di = pickColumn(headers, DATE_KEYS);
  let ri = pickColumn(headers, REV_KEYS);
  const ti = pickColumn(headers, TXN_KEYS);

  // Fallbacks: detect a date-like column, and assume revenue is the first numeric non-date column.
  const sample = (rows[hi + 1] ?? []) as unknown[];
  if (di < 0) di = sample.findIndex((c) => toISO(c) !== null);
  if (ri < 0) ri = sample.findIndex((c, i) => i !== di && toNum(c) > 0);
  if (di < 0 || ri < 0) {
    throw new Error("Couldn't find date and sales columns. Make sure the file has a header row.");
  }

  const series: DayPoint[] = [];
  let skipped = 0;
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row) continue;
    const date = toISO(row[di]);
    if (!date) {
      skipped++;
      continue;
    }
    series.push({
      date,
      revenue: toNum(row[ri]),
      transactions: ti >= 0 ? Math.round(toNum(row[ti])) : 0,
    });
  }
  if (!series.length) throw new Error("No dated rows found in that file.");
  series.sort((a, b) => a.date.localeCompare(b.date));

  return {
    series,
    detected: {
      date: headers[di] || "column " + (di + 1),
      revenue: headers[ri] || "column " + (ri + 1),
      transactions: ti >= 0 ? headers[ti] : null,
    },
    totalRevenue: series.reduce((a, p) => a + p.revenue, 0),
    totalTransactions: series.reduce((a, p) => a + p.transactions, 0),
    skipped,
  };
}

/** Slugify a business name into a stable id. */
export function slugId(name: string): string {
  return (
    "biz-" +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "biz-" + Math.abs(hashString(name))
  );
}
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
