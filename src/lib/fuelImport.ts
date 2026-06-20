import type { Business, DayPoint, FuelDay } from "../types";
import { slugId } from "./import";
import { mulberry32, isoDate } from "../data/rng";

/**
 * Real fuel-retail ingestion — the "upload your data" path for a gas-station operator.
 * Reads a Gilbarco Passport / back-office sales export (or any CSV/XLSX) into FuelDay[], or
 * synthesizes a baseline from a few key numbers (gallons/day, CPG, inside sales). Same shape
 * and graceful-derivation contract as lib/hotelImport.ts.
 */

export interface FuelMeta {
  name: string;
  brand?: string;
  location?: string;
  pumps?: number;
  capitalDeployed?: number;
  accent?: string;
}

export interface ParsedFuelImport {
  fuelSeries: FuelDay[];
  series: DayPoint[];
  detected: Record<string, string | null>;
  derived: string[];
  range: { from: string; to: string };
  totals: { days: number; avgGallonsDay: number; avgCpg: number; avgInsideDay: number; totalRevenue: number };
}

const KEYS = {
  date: ["date", "business date", "businessdate", "day", "period"],
  gallons: ["gallons sold", "gallons", "fuel volume", "volume", "gals", "fuel gallons"],
  fuelRev: ["fuel revenue", "fuel sales", "fuel $", "gas sales", "fuel dollars"],
  fuelMargin: ["fuel margin", "fuel profit", "fuel gross profit", "fuel gp"],
  cpg: ["cpg", "cents per gallon", "margin per gallon", "fuel cpg"],
  inside: ["inside sales", "merchandise sales", "store sales", "merch sales", "inside", "c-store sales", "grocery sales"],
  insideMargin: ["inside margin", "inside profit", "merchandise margin", "store margin", "inside gp"],
  other: ["other revenue", "car wash", "carwash", "lottery", "food service", "other income"],
  total: ["total revenue", "total sales", "net sales", "total"],
} as const;

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoUTC = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
function toISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return isoUTC(v);
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : isoUTC(d);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return iso(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : iso(d);
}
function pick(headers: string[], keys: readonly string[]): number {
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

const DEFAULT_CPG = 25;
const DEFAULT_INSIDE_MARGIN = 0.28;
const DEFAULT_PUMP_PRICE = 3.2;
const round2 = (n: number) => Math.round(n * 100) / 100;

const BRAND_ACCENT: Record<string, string> = {
  marathon: "#0061a8",
  bp: "#0b9a4a",
  shell: "#d4a017",
  exxon: "#cd1b2a",
  mobil: "#0a4ea2",
  chevron: "#1f4e9b",
  sunoco: "#ffce00",
  speedway: "#e21d38",
  circle: "#e2231a",
  independent: "#0e7c66",
};
function accentFor(brand?: string): string {
  const b = norm(brand);
  for (const k of Object.keys(BRAND_ACCENT)) if (b.includes(k)) return BRAND_ACCENT[k];
  return "#0e7c66";
}

export async function parseFuelFile(file: File): Promise<ParsedFuelImport> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: false });
  if (!rows.length) throw new Error("That file looks empty.");

  let hi = rows.findIndex((r) => (r as unknown[]).filter((c) => c !== "" && c != null).length >= 2);
  if (hi < 0) hi = 0;
  const headers = (rows[hi] as unknown[]).map(norm);
  const col: Record<keyof typeof KEYS, number> = {} as Record<keyof typeof KEYS, number>;
  (Object.keys(KEYS) as (keyof typeof KEYS)[]).forEach((k) => (col[k] = pick(headers, KEYS[k])));

  let di = col.date;
  if (di < 0) {
    const sample = (rows[hi + 1] ?? []) as unknown[];
    di = sample.findIndex((c) => toISO(c) !== null);
  }
  if (di < 0) throw new Error("Couldn't find a Date column. Add a header row with a Date column.");
  if (col.gallons < 0 && col.fuelRev < 0 && col.inside < 0)
    throw new Error("Couldn't find fuel or inside-sales columns. Include Gallons, Fuel Sales, or Inside Sales.");

  const get = (row: unknown[], k: keyof typeof KEYS): number | null => {
    const i = col[k];
    return i >= 0 && row[i] != null && row[i] !== "" ? toNum(row[i]) : null;
  };

  const fuelSeries: FuelDay[] = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row) continue;
    const date = toISO(row[di]);
    if (!date) continue;

    const gallonsSold = Math.round(get(row, "gallons") ?? 0);
    const fuelRevRaw = get(row, "fuelRev");
    const fuelRevenue = Math.round(fuelRevRaw ?? gallonsSold * DEFAULT_PUMP_PRICE);
    const cpgRaw = get(row, "cpg");
    const fuelMarginRaw = get(row, "fuelMargin");
    let fuelMargin: number;
    let cpg: number;
    if (fuelMarginRaw != null) {
      fuelMargin = Math.round(fuelMarginRaw);
      cpg = gallonsSold ? (fuelMargin / gallonsSold) * 100 : DEFAULT_CPG;
    } else if (cpgRaw != null) {
      cpg = cpgRaw;
      fuelMargin = Math.round(gallonsSold * (cpg / 100));
    } else {
      cpg = DEFAULT_CPG;
      fuelMargin = Math.round(gallonsSold * (cpg / 100));
    }

    const insideSales = Math.round(get(row, "inside") ?? 0);
    const insideMarginRaw = get(row, "insideMargin");
    const insideMargin = Math.round(insideMarginRaw ?? insideSales * DEFAULT_INSIDE_MARGIN);
    const otherRevenue = Math.round(get(row, "other") ?? 0);
    const otherMargin = Math.round(otherRevenue * 0.55);

    const totalRevenue = Math.round(get(row, "total") ?? fuelRevenue + insideSales + otherRevenue);
    const grossProfit = fuelMargin + insideMargin + otherMargin;

    fuelSeries.push({
      date,
      gallonsSold,
      fuelRevenue,
      fuelMargin,
      cpg: round2(cpg),
      insideSales,
      insideMargin,
      insideMarginPct: insideSales ? round2(insideMargin / insideSales) : 0,
      otherRevenue,
      otherMargin,
      totalRevenue,
      grossProfit,
    });
  }
  if (!fuelSeries.length) throw new Error("No dated rows found. Check the Date column and that rows have values.");
  fuelSeries.sort((a, b) => a.date.localeCompare(b.date));

  const derived: string[] = [];
  if (col.fuelMargin < 0 && col.cpg < 0) derived.push(`Fuel margin estimated at ${DEFAULT_CPG}¢/gal — add a CPG or Fuel Margin column for exact.`);
  if (col.insideMargin < 0 && col.inside >= 0) derived.push(`Inside margin estimated at ${Math.round(DEFAULT_INSIDE_MARGIN * 100)}% — add an Inside Margin column for exact.`);
  if (col.fuelRev < 0 && col.gallons >= 0) derived.push("Fuel revenue computed from gallons × pump price");

  const series: DayPoint[] = fuelSeries.map((d) => ({ date: d.date, revenue: d.totalRevenue, transactions: Math.round(d.gallonsSold / 11) }));
  const n = fuelSeries.length;
  const s = (f: (d: FuelDay) => number) => fuelSeries.reduce((a, d) => a + f(d), 0);
  const totalGallons = s((d) => d.gallonsSold);
  return {
    fuelSeries,
    series,
    detected: Object.fromEntries(
      (Object.keys(KEYS) as (keyof typeof KEYS)[]).map((k) => [k, col[k] >= 0 ? headers[col[k]] || `col ${col[k] + 1}` : null]),
    ),
    derived,
    range: { from: fuelSeries[0].date, to: fuelSeries[n - 1].date },
    totals: {
      days: n,
      avgGallonsDay: totalGallons / n,
      avgCpg: totalGallons ? (s((d) => d.fuelMargin) / totalGallons) * 100 : 0,
      avgInsideDay: s((d) => d.insideSales) / n,
      totalRevenue: s((d) => d.totalRevenue),
    },
  };
}

function estimateCapital(pumps = 8): number {
  return Math.round(1_800_000 + pumps * 140_000); // land + tanks + store + pumps
}

export function buildStationFromImport(parsed: ParsedFuelImport, meta: FuelMeta): Business {
  const grossRev = parsed.fuelSeries.reduce((a, d) => a + d.totalRevenue, 0);
  const grossProfit = parsed.fuelSeries.reduce((a, d) => a + d.grossProfit, 0);
  const netMargin = grossRev ? Math.max(0.02, (grossProfit / grossRev) * 0.45) : 0.04;
  return {
    id: slugId(meta.name).replace(/^biz-/, "fuel-"),
    name: meta.name,
    shortName: meta.name.split(/\s+/).slice(0, 2).join(" "),
    type: "fuel",
    location: meta.location || "",
    category: meta.pumps ? "Fuel + c-store" : "Fuel + c-store",
    accent: meta.accent || accentFor(meta.brand),
    series: parsed.series,
    fuelSeries: parsed.fuelSeries,
    capitalDeployed: meta.capitalDeployed || estimateCapital(meta.pumps),
    netMargin: Math.round(netMargin * 1000) / 1000,
    brand: meta.brand,
    pumps: meta.pumps,
  };
}

// ── Manual entry ────────────────────────────────────────────────────────────────────
const DOW = [0.85, 1.05, 1.07, 1.06, 1.1, 1.12, 0.84]; // Sun..Sat commuter shape

export interface ManualFuelInput extends FuelMeta {
  gallonsPerDay: number;
  cpg: number;
  insidePerDay: number;
  insideMarginPct?: number;
  otherPerDay?: number;
  trend?: number;
  days?: number;
}

export function manualFuel(input: ManualFuelInput): Business {
  const days = input.days ?? 90;
  const insMargin = input.insideMarginPct
    ? input.insideMarginPct > 1
      ? input.insideMarginPct / 100
      : input.insideMarginPct
    : DEFAULT_INSIDE_MARGIN;
  const trend = input.trend ?? 0;
  const rnd = mulberry32(Math.abs(hash(input.name)) >>> 0);
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const fuelSeries: FuelDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const progress = (days - 1 - i) / (days - 1);
    const tm = 1 + trend * progress;
    const dm = DOW[d.getDay()];
    const noise = 1 + (rnd() - 0.5) * 0.14;

    const gallonsSold = Math.max(200, Math.round(input.gallonsPerDay * dm * tm * noise));
    const cpg = Math.max(8, input.cpg * (1 + (rnd() - 0.5) * 0.15));
    const fuelRevenue = Math.round(gallonsSold * DEFAULT_PUMP_PRICE);
    const fuelMargin = Math.round(gallonsSold * (cpg / 100));
    const insideSales = Math.round(input.insidePerDay * (0.85 + dm * 0.15) * tm * (1 + (rnd() - 0.5) * 0.12));
    const insideMargin = Math.round(insideSales * insMargin);
    const otherRevenue = Math.round((input.otherPerDay ?? 0) * (1 + (rnd() - 0.5) * 0.25));
    const otherMargin = Math.round(otherRevenue * 0.55);
    const totalRevenue = fuelRevenue + insideSales + otherRevenue;

    fuelSeries.push({
      date: isoDate(d),
      gallonsSold,
      fuelRevenue,
      fuelMargin,
      cpg: round2(cpg),
      insideSales,
      insideMargin,
      insideMarginPct: insideSales ? round2(insideMargin / insideSales) : 0,
      otherRevenue,
      otherMargin,
      totalRevenue,
      grossProfit: fuelMargin + insideMargin + otherMargin,
    });
  }

  const series: DayPoint[] = fuelSeries.map((d) => ({ date: d.date, revenue: d.totalRevenue, transactions: Math.round(d.gallonsSold / 11) }));
  const grossRev = fuelSeries.reduce((a, d) => a + d.totalRevenue, 0);
  const grossProfit = fuelSeries.reduce((a, d) => a + d.grossProfit, 0);
  return {
    id: slugId(input.name).replace(/^biz-/, "fuel-"),
    name: input.name,
    shortName: input.name.split(/\s+/).slice(0, 2).join(" "),
    type: "fuel",
    location: input.location || "",
    category: "Fuel + c-store",
    accent: input.accent || accentFor(input.brand),
    series,
    fuelSeries,
    capitalDeployed: input.capitalDeployed || estimateCapital(input.pumps),
    netMargin: grossRev ? Math.round(Math.max(0.02, (grossProfit / grossRev) * 0.45) * 1000) / 1000 : 0.04,
    brand: input.brand,
    pumps: input.pumps,
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

export const FUEL_TEMPLATE_COLUMNS = [
  "Date",
  "Gallons Sold",
  "Fuel Revenue",
  "Fuel Margin",
  "Inside Sales",
  "Inside Margin",
  "Other Revenue",
  "Total Revenue",
];
