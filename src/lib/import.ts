import type { DayPoint } from "../types";

export type DateFmt = "ymd" | "mdy" | "dmy" | "serial" | "name" | "unknown";

export interface ParsedImport {
  series: DayPoint[];
  detected: { date: string; revenue: string; transactions: string | null };
  /** Column indices the mapping resolved to (-1 = none). Lets the UI offer a re-map. */
  detectedIdx: { date: number; revenue: number; transactions: number };
  /** All header labels, in file order — populates the re-map dropdowns. */
  headers: string[];
  /** Raw data rows (everything after the header), kept so the UI can re-map columns without re-reading the file. */
  rows: unknown[][];
  /** How the date column was interpreted, so we can show "read as MM/DD/YYYY" and be honest about ambiguity. */
  dateFormat: DateFmt;
  totalRevenue: number;
  totalTransactions: number;
  /** Rows dropped because the date couldn't be read. */
  skipped: number;
  /** True when the chosen revenue column looks like GROSS while a NET-looking column also exists (worth flagging). */
  revenueLooksGross: boolean;
}

// Header synonyms, most-specific first.
const DATE_KEYS = ["date", "business date", "businessdate", "trade date", "sale date", "saledate", "day"];
const NET_KEYS = ["net sales", "net_sales", "netsales", "net sale", "net-sale", "net revenue", "net"];
const GROSS_KEYS = ["gross sales", "gross_sales", "grosssales", "gross"];
const REV_KEYS = [...NET_KEYS, "revenue", "sales", ...GROSS_KEYS, "total sales", "total", "amount"];
const TXN_KEYS = [
  "transactions", "transaction count", "txns", "cust", "customers", "customer count",
  "tickets", "receipts", "orders", "checks", "guests", "tender count", "tendercount", "count",
];

// Weekday name → JS getDay() index, for unpivoting LiveIQ's weekly day-of-week grid.
const DOW_NUM: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function isoOf(y: number, m: number, d: number): string | null {
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const yyyy = y < 100 ? 2000 + y : y;
  return `${yyyy}-${pad(m)}-${pad(d)}`;
}
function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// xlsx stores date-only cells at UTC midnight, and Excel serials decode to UTC epoch ms — read
// both with UTC getters so a negative-UTC machine doesn't shift every imported date back a day.
function isoFromUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Excel stores dates as days since 1899-12-30. */
function fromSerial(n: number): string | null {
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  return isNaN(d.getTime()) ? null : isoFromUtc(d);
}

/** Pull the three integer parts out of a slash/dash/dot-separated date string. */
function dateParts(s: string): [number, number, number] | null {
  const m = s.match(/(\d{1,4})[/.\- ](\d{1,2})[/.\- ](\d{1,4})/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Infer how a whole date COLUMN is formatted, so MM/DD vs DD/MM is decided once from
 * the evidence across every row — not guessed per cell. This is the difference between
 * a clean import and a silently scrambled calendar.
 */
export function inferDateFormat(values: unknown[]): DateFmt {
  let serial = 0, ymd = 0, named = 0, slashLike = 0;
  let sawDayFirst = false, sawMonthFirst = false;
  for (const v of values) {
    if (v == null || v === "") continue;
    if (v instanceof Date) { serial++; continue; }
    if (typeof v === "number") { if (v > 20000 && v < 80000) serial++; continue; }
    const s = String(v).trim().toLowerCase();
    if (/^\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}/.test(s)) { ymd++; continue; }
    if (Object.keys(MONTHS).some((mo) => s.includes(mo))) { named++; continue; }
    const p = dateParts(s);
    if (p) {
      slashLike++;
      if (p[0] > 12) sawDayFirst = true;     // first field can't be a month → day-first
      if (p[1] > 12) sawMonthFirst = true;   // second field can't be a month → month-first
    }
  }
  if (serial && serial >= ymd && serial >= slashLike && serial >= named) return "serial";
  if (named && named >= ymd && named >= slashLike) return "name";
  if (ymd && ymd >= slashLike) return "ymd";
  if (slashLike) {
    if (sawDayFirst && !sawMonthFirst) return "dmy";
    return "mdy"; // US default when unambiguous or genuinely ambiguous
  }
  return "unknown";
}

/** Parse one date value using a known column format. */
export function parseDate(v: unknown, fmt: DateFmt): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return isoFromUtc(v);
  if (typeof v === "number") return fromSerial(v);
  const s = String(v).trim();
  if (!s) return null;

  if (fmt === "serial") {
    const n = Number(s);
    if (!isNaN(n)) return fromSerial(n);
  }
  if (fmt === "ymd") {
    const p = dateParts(s);
    if (p) return isoOf(p[0], p[1], p[2]);
  }
  if (fmt === "mdy") {
    const p = dateParts(s);
    if (p) return isoOf(p[2], p[0], p[1]);
  }
  if (fmt === "dmy") {
    const p = dateParts(s);
    if (p) return isoOf(p[2], p[1], p[0]);
  }
  if (fmt === "name") {
    // "2-Jan-2026", "Jan 2, 2026", "2 January 2026" — find a month word + the day/year numbers.
    const lower = s.toLowerCase();
    const moKey = Object.keys(MONTHS).find((mo) => lower.includes(mo));
    const nums = (s.match(/\d{1,4}/g) || []).map(Number);
    if (moKey && nums.length >= 2) {
      const year = nums.find((n) => n > 31) ?? nums[nums.length - 1];
      const day = nums.find((n) => n >= 1 && n <= 31) ?? nums[0];
      return isoOf(year, MONTHS[moKey], day);
    }
  }
  // Last resort — let the engine try, but only trust an unambiguous result.
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : isoFromDate(d);
}

/** True if a value plausibly reads as a date (used for column auto-detection). */
function looksLikeDate(v: unknown): boolean {
  if (v instanceof Date) return !isNaN(v.getTime());
  if (typeof v === "number") return v > 20000 && v < 80000;
  const s = String(v ?? "").trim();
  if (!s) return false;
  return /\d{4}[/.\-]\d{1,2}/.test(s) || !!dateParts(s) || Object.keys(MONTHS).some((m) => s.toLowerCase().includes(m));
}

/**
 * Money parsing that survives real exports: currency symbols, thousands separators,
 * parenthesised negatives `(1,234)`, and trailing-minus `1,234-`.
 */
export function toNum(v: unknown): number {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  let s = String(v ?? "").trim();
  if (!s) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }       // (1,234) → -1234
  if (/-\s*$/.test(s)) { neg = true; }                              // 1,234-  → -1234
  s = s.replace(/[^0-9.\-]/g, "");
  if (s.indexOf("-") > 0) s = s.replace(/-/g, "");                  // stray inner minus
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return neg ? -Math.abs(n) : n;
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

/** Build the daily series + totals from raw rows and a chosen column mapping. */
function buildSeries(
  rows: unknown[][],
  idx: { date: number; revenue: number; transactions: number },
  fmt: DateFmt,
): { series: DayPoint[]; totalRevenue: number; totalTransactions: number; skipped: number } {
  // Collapse duplicate dates (some exports split a day across rows) by summing.
  const byDate = new Map<string, { revenue: number; transactions: number }>();
  let skipped = 0;
  for (const row of rows) {
    if (!row) continue;
    const date = parseDate(row[idx.date], fmt);
    if (!date) { skipped++; continue; }
    const cur = byDate.get(date) ?? { revenue: 0, transactions: 0 };
    cur.revenue += toNum(row[idx.revenue]);
    if (idx.transactions >= 0) cur.transactions += Math.round(toNum(row[idx.transactions]));
    byDate.set(date, cur);
  }
  const todayIso = isoFromDate(new Date());
  const series: DayPoint[] = [...byDate.entries()]
    .map(([date, v]) => ({ date, revenue: v.revenue, transactions: v.transactions }))
    .filter((p) => p.date <= todayIso && p.revenue > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    series,
    totalRevenue: series.reduce((a, p) => a + p.revenue, 0),
    totalTransactions: series.reduce((a, p) => a + p.transactions, 0),
    skipped,
  };
}

function finalize(
  headers: string[],
  rows: unknown[][],
  idx: { date: number; revenue: number; transactions: number },
): ParsedImport {
  const fmt = inferDateFormat(rows.map((r) => r?.[idx.date]));
  const built = buildSeries(rows, idx, fmt);
  if (!built.series.length) throw new Error("No dated rows found — check that the Date column is mapped correctly.");
  const revHeader = norm(headers[idx.revenue]);
  const revenueLooksGross =
    GROSS_KEYS.some((k) => revHeader.includes(k)) &&
    headers.some((h) => NET_KEYS.some((k) => norm(h).includes(k)));
  return {
    ...built,
    detected: {
      date: headers[idx.date] || "column " + (idx.date + 1),
      revenue: headers[idx.revenue] || "column " + (idx.revenue + 1),
      transactions: idx.transactions >= 0 ? headers[idx.transactions] : null,
    },
    detectedIdx: { ...idx },
    headers,
    rows,
    dateFormat: fmt,
    revenueLooksGross,
  };
}

/** Re-map columns (from the UI's dropdowns) without re-reading the file. */
export function remap(
  parsed: ParsedImport,
  idx: { date: number; revenue: number; transactions: number },
): ParsedImport {
  return finalize(parsed.headers, parsed.rows, idx);
}

/**
 * LiveIQ "Daily Sales Volume" exports a WEEKLY GRID: one row per week (a "Week End Date" plus a
 * column for each day of the week — Wed…Tue). Detect that shape and unpivot it into a tall daily
 * series, mapping each day-of-week column to its real calendar date within the week. Returns null
 * if the file isn't this grid (so normal column detection runs). Throws if it IS the grid but every
 * cell is empty/N/A (the common "exported the wrong date range" mistake).
 */
function parseWeeklyDailyGrid(headersRaw: string[], headers: string[], rows: unknown[][]): ParsedImport | null {
  const wi = headers.findIndex((h) => h.includes("week end") || h.includes("week ending"));
  if (wi < 0) return null;
  // Weekday columns, in file order (e.g. Wed…Tue). The last one IS the week-end day, so position
  // k maps to (n-1-k) days before the week-end — order-based, not weekday-name-based, so a one-day
  // date-parse wobble can never rotate which value lands on which day.
  const dayCols = headers.map((_, i) => i).filter((i) => i !== wi && DOW_NUM[headers[i]] !== undefined);
  if (dayCols.length < 5) return null; // not the day-of-week grid

  const n = dayCols.length;
  const fmt = inferDateFormat(rows.map((r) => r?.[wi]));
  const byDate = new Map<string, number>();
  let skipped = 0;
  for (const row of rows) {
    if (!row) continue;
    const end = weekEndUtcMs(row[wi], fmt);
    if (end == null) { skipped++; continue; }
    dayCols.forEach((ci, k) => {
      const s = String(row[ci] ?? "").trim();
      if (!s || /^n\/?a$/i.test(s)) return; // closed / no-data day
      const val = toNum(row[ci]);
      if (!(val > 0)) return;
      const d = new Date(end - (n - 1 - k) * 86400000); // UTC math → no timezone/DST drift
      const iso = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      byDate.set(iso, (byDate.get(iso) ?? 0) + val);
    });
  }
  const series: DayPoint[] = [...byDate.entries()]
    .map(([date, revenue]) => ({ date, revenue, transactions: 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!series.length) {
    throw new Error(
      "This is a LiveIQ Daily Sales Volume export, but every day is empty (N/A). Re-export it for a date range that has sales.",
    );
  }
  return {
    series,
    detected: { date: headersRaw[wi] || "Week End Date", revenue: "daily sales (weekday grid)", transactions: null },
    detectedIdx: { date: wi, revenue: -1, transactions: -1 },
    headers: headersRaw,
    rows,
    dateFormat: fmt,
    totalRevenue: series.reduce((a, p) => a + p.revenue, 0),
    totalTransactions: 0,
    skipped,
    revenueLooksGross: false,
  };
}

// A "Week End Date" cell → UTC-midnight epoch ms. xlsx stores date-only cells at UTC midnight, so
// read them with UTC getters; string dates go through the normal parser. Keeps the calendar date
// stable regardless of the machine's timezone.
function weekEndUtcMs(v: unknown, fmt: DateFmt): number | null {
  const iso =
    v instanceof Date && !isNaN(v.getTime())
      ? `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`
      : parseDate(v, fmt);
  return iso ? Date.parse(`${iso}T00:00:00Z`) : null;
}

/** Parse a CSV/XLSX/XLS sales export into a normalized daily series. */
export async function parseSalesFile(file: File): Promise<ParsedImport> {
  const XLSX = await import("xlsx"); // lazy — SheetJS only loads when a file is actually parsed
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: false });
  if (!allRows.length) throw new Error("That file looks empty.");

  // Header = first row with at least two non-empty cells.
  let hi = allRows.findIndex((r) => (r as unknown[]).filter((c) => c !== "" && c != null).length >= 2);
  if (hi < 0) hi = 0;
  // Spread first so a sparse header row (gaps in a messy export) densifies to "" rather than
  // leaving holes that become `undefined` and crash downstream `.includes()` checks.
  const headersRaw = [...((allRows[hi] as unknown[]) ?? [])].map((c) => String(c ?? "").trim());
  const headers = headersRaw.map(norm);
  const rows = allRows.slice(hi + 1) as unknown[][];

  // LiveIQ "Daily Sales Volume" is a weekly day-of-week grid — unpivot it to a daily series.
  const grid = parseWeeklyDailyGrid(headersRaw, headers, rows);
  if (grid) return grid;

  let di = pickColumn(headers, DATE_KEYS);
  let ri = pickColumn(headers, REV_KEYS);
  const ti = pickColumn(headers, TXN_KEYS);

  // Fallbacks: scan the first few data rows for a date-like column, and take the first
  // positive numeric non-date column as revenue.
  const sample = rows.slice(0, 8);
  if (di < 0) di = headers.findIndex((_, i) => sample.some((row) => looksLikeDate(row?.[i])));
  if (ri < 0) ri = headers.findIndex((_, i) => i !== di && sample.some((row) => toNum(row?.[i]) > 0));
  if (di < 0 || ri < 0) {
    throw new Error("Couldn't find date and sales columns. Make sure the file has a header row.");
  }

  // Return the labels with original casing for display.
  return finalize(headersRaw, rows, { date: di, revenue: ri, transactions: ti });
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
