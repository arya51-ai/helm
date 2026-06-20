import type { Business, DayPoint, HotelDay } from "../types";
import { slugId } from "./import";
import { mulberry32, isoDate } from "../data/rng";

/**
 * Real hotel data ingestion — the "upload your data to date" path for a working hotelier.
 *
 * Two ways in, both producing a first-class `Business{ type:"hotel", hotelSeries }` that flows
 * through the existing import pipeline (`upsertImported → loadBusinesses`):
 *   1. parseHotelFile(file, meta)  — a CSV/XLSX of daily or monthly hotel performance.
 *   2. manualHotel(meta)           — no file? Enter rooms + ADR + occupancy and we synthesize a
 *                                    believable trailing series anchored to those real numbers.
 *
 * The parser is forgiving (header synonyms, like lib/import.ts) and derives whatever the file
 * left out — occupancy↔rooms-sold, ADR↔room-revenue, RevPAR=occ×ADR, totals, comp-set/RGI — and
 * is HONEST about it: `derived[]` records every field it computed or defaulted, and `hasComp` /
 * `hasCost` tell the UI when to show an "estimated — add STR/P&L for exact" state instead of
 * silently faking precision.
 */

export interface HotelMeta {
  name: string;
  brand?: string;
  rooms: number;
  stars?: number;
  location?: string;
  /** Acquisition / invested capital. If omitted, estimated from room count. */
  capitalDeployed?: number;
  accent?: string;
}

export interface ParsedHotelImport {
  hotelSeries: HotelDay[];
  series: DayPoint[];
  detected: Record<string, string | null>;
  /** Human-readable notes on what was computed or defaulted (shown for transparency). */
  derived: string[];
  /** True when real comp-set / STR data was present (vs defaulted to RGI 100). */
  hasComp: boolean;
  /** True when real GOP / labor cost data was present (vs estimated from margins). */
  hasCost: boolean;
  range: { from: string; to: string };
  totals: { days: number; avgOccupancy: number; avgAdr: number; avgRevpar: number; totalRevenue: number };
}

// ── Column synonyms (most specific first), matched against the header row ────────────
const KEYS = {
  date: ["date", "business date", "businessdate", "stay date", "period", "month", "day"],
  roomsSold: ["rooms sold", "room nights sold", "rooms occupied", "occupied rooms", "rms sold", "room nights", "roomnights", "sold"],
  roomsAvail: ["rooms available", "available rooms", "room nights available", "available", "capacity", "supply"],
  occ: ["occupancy", "occ %", "occupancy %", "occupancy rate", "occ"],
  adr: ["adr", "average daily rate", "avg daily rate", "average rate", "avg rate"],
  revpar: ["revpar", "rev par", "revenue per available room"],
  roomRev: ["room revenue", "rooms revenue", "room rev", "lodging revenue", "accommodation revenue"],
  totalRev: ["total revenue", "total operating revenue", "total rev", "total sales"],
  fbRev: ["f&b revenue", "food and beverage", "food & beverage", "f&b", "fnb", "food revenue"],
  otherRev: ["other revenue", "ancillary revenue", "other operating revenue", "misc revenue", "ancillary"],
  compRevpar: ["comp set revpar", "compset revpar", "competitive revpar", "market revpar", "str revpar", "comp revpar"],
  rgi: ["rgi", "revpar index", "str index"],
  gop: ["gop", "gross operating profit"],
  labor: ["labor cost", "labour cost", "payroll", "labor", "labour", "wages"],
} as const;

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}
/** Parse a percentage that may be "75%", "75", or "0.75" into a 0–1 fraction. */
function toPct(v: unknown): number {
  const n = toNum(v);
  if (n <= 0) return 0;
  return n > 1.5 ? n / 100 : n; // 75 → 0.75, 0.75 → 0.75, 1 → 1.0 (100%)
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Format using UTC parts — SheetJS encodes date cells at UTC midnight, so reading them with
 *  local getters would shift the calendar day backward in any timezone behind UTC. */
function isoUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function toISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return isoUTC(v);
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000)); // Excel serial → UTC midnight
    return isNaN(d.getTime()) ? null : isoUTC(d);
  }
  const s = String(v).trim();
  // Plain YYYY-MM-DD: build at local midnight so local getters return the same calendar day.
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

const DEFAULT_GOP_MARGIN = 0.36;
const DEFAULT_LABOR_PCT = 0.3;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Parse a CSV/XLSX of hotel performance into a normalized `HotelDay[]`. `meta.rooms` is the
 * property's room count — used as the daily availability when the file doesn't carry one, and
 * the anchor that lets every other field derive.
 */
export async function parseHotelFile(file: File, meta: { rooms: number }): Promise<ParsedHotelImport> {
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

  const get = (row: unknown[], k: keyof typeof KEYS): number | null => {
    const i = col[k];
    return i >= 0 && row[i] != null && row[i] !== "" ? toNum(row[i]) : null;
  };

  const hotelSeries: HotelDay[] = [];
  let compSeen = false;
  let costSeen = false;

  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row) continue;
    const date = toISO(row[di]);
    if (!date) continue;

    const roomsAvail = get(row, "roomsAvail") ?? meta.rooms;
    const occRaw = col.occ >= 0 && row[col.occ] != null && row[col.occ] !== "" ? toPct(row[col.occ]) : null;
    const soldRaw = get(row, "roomsSold");

    let occupancy = occRaw ?? (soldRaw != null && roomsAvail ? soldRaw / roomsAvail : 0);
    occupancy = Math.max(0, Math.min(1, occupancy));
    const roomsSold = soldRaw != null ? Math.round(soldRaw) : Math.round(occupancy * roomsAvail);

    const roomRevRaw = get(row, "roomRev");
    let adr = get(row, "adr") ?? (roomRevRaw != null && roomsSold ? roomRevRaw / roomsSold : 0);
    const revparRaw = get(row, "revpar");
    if (!adr && revparRaw != null && occupancy) adr = revparRaw / occupancy;
    adr = Math.max(0, adr);

    const revpar = revparRaw ?? occupancy * adr;
    const roomRevenue = Math.round(roomRevRaw ?? roomsSold * adr);
    const fbRevenue = Math.round(get(row, "fbRev") ?? 0);
    const otherRevenue = Math.round(get(row, "otherRev") ?? 0);
    const totalRevenue = Math.round(get(row, "totalRev") ?? roomRevenue + fbRevenue + otherRevenue);

    const compRaw = get(row, "compRevpar");
    const rgiRaw = get(row, "rgi");
    let compSetRevpar: number;
    if (compRaw != null) {
      compSetRevpar = compRaw;
      compSeen = true;
    } else if (rgiRaw != null && rgiRaw > 0) {
      compSetRevpar = revpar / (rgiRaw / 100);
      compSeen = true;
    } else {
      compSetRevpar = revpar; // no comp data → assume fair share (RGI 100)
    }
    const rgi = compSetRevpar > 0 ? (revpar / compSetRevpar) * 100 : 100;

    const gopRaw = get(row, "gop");
    const laborRaw = get(row, "labor");
    if (gopRaw != null || laborRaw != null) costSeen = true;
    const gop = Math.round(gopRaw ?? totalRevenue * DEFAULT_GOP_MARGIN);
    const laborCost = Math.round(laborRaw ?? totalRevenue * DEFAULT_LABOR_PCT);

    hotelSeries.push({
      date,
      roomsSold,
      roomsAvailable: roomsAvail,
      occupancy: round2(occupancy),
      adr: round2(adr),
      revpar: round2(revpar),
      roomRevenue,
      fbRevenue,
      otherRevenue,
      totalRevenue,
      gop,
      gopMargin: totalRevenue ? round2(gop / totalRevenue) : 0,
      laborCost,
      laborPct: totalRevenue ? round2(laborCost / totalRevenue) : 0,
      compSetRevpar: round2(compSetRevpar),
      rgi: Math.round(rgi * 10) / 10,
    });
  }

  if (!hotelSeries.length) throw new Error("No dated rows found. Check the Date column and that rows have values.");
  hotelSeries.sort((a, b) => a.date.localeCompare(b.date));

  const derived: string[] = [];
  if (col.occ < 0 && col.roomsSold >= 0) derived.push("Occupancy computed from rooms sold ÷ availability");
  if (col.adr < 0 && col.roomRev >= 0) derived.push("ADR computed from room revenue ÷ rooms sold");
  if (col.revpar < 0) derived.push("RevPAR computed as occupancy × ADR");
  if (!compSeen) derived.push("No comp-set/STR data — RGI shown at fair share (100). Add STR for exact benchmarking.");
  if (!costSeen) derived.push(`GOP & labor estimated (${Math.round(DEFAULT_GOP_MARGIN * 100)}% / ${Math.round(DEFAULT_LABOR_PCT * 100)}%). Add a P&L for exact margins.`);

  const series: DayPoint[] = hotelSeries.map((d) => ({ date: d.date, revenue: d.totalRevenue, transactions: d.roomsSold }));
  const n = hotelSeries.length;
  const sum = <K extends keyof HotelDay>(k: K) => hotelSeries.reduce((a, d) => a + (d[k] as number), 0);

  return {
    hotelSeries,
    series,
    detected: Object.fromEntries(
      (Object.keys(KEYS) as (keyof typeof KEYS)[]).map((k) => [k, col[k] >= 0 ? headers[col[k]] || `col ${col[k] + 1}` : null]),
    ),
    derived,
    hasComp: compSeen,
    hasCost: costSeen,
    range: { from: hotelSeries[0].date, to: hotelSeries[n - 1].date },
    totals: {
      days: n,
      avgOccupancy: sum("occupancy") / n,
      avgAdr: sum("adr") / n,
      avgRevpar: sum("revpar") / n,
      totalRevenue: sum("totalRevenue"),
    },
  };
}

// ── Brand accents (so an uploaded hotel looks at home next to the seeded ones) ───────
const BRAND_ACCENT: Record<string, string> = {
  marriott: "#BE0028",
  hilton: "#003B71",
  ihg: "#008752",
  hyatt: "#5C2D2D",
  wyndham: "#1F3A93",
  choice: "#E4002B",
  "best western": "#003896",
  independent: "#0e7c66",
};
function accentFor(brand?: string, fallbackSeed = 0): string {
  const b = norm(brand);
  for (const key of Object.keys(BRAND_ACCENT)) if (b.includes(key)) return BRAND_ACCENT[key];
  const pal = ["#0e7c66", "#b4793a", "#3b6ea5", "#9a5b9c", "#c2613a"];
  return pal[fallbackSeed % pal.length];
}

/** Default invested capital when the owner doesn't supply one (~per-key value × rooms). */
function estimateCapital(rooms: number, stars = 3): number {
  const perKey = stars >= 4 ? 140_000 : stars >= 3 ? 95_000 : 65_000;
  return Math.round(rooms * perKey);
}

/** Assemble a real hotel `Business` from a parsed import + the owner-supplied property meta. */
export function buildHotelFromImport(parsed: ParsedHotelImport, meta: HotelMeta): Business {
  const observedGopMargin =
    parsed.hotelSeries.reduce((a, d) => a + d.gopMargin, 0) / Math.max(1, parsed.hotelSeries.length);
  // Bottom-line margin after debt service & reserves — well below GOP (see data/hotels.ts).
  const netMargin = parsed.hasCost ? Math.max(0.05, observedGopMargin * 0.28) : 0.1;
  return {
    id: slugId(meta.name).replace(/^biz-/, "hotel-"),
    name: meta.name,
    shortName: meta.name.split(/\s+/).slice(0, 2).join(" "),
    type: "hotel",
    location: meta.location || "",
    category: meta.stars && meta.stars >= 4 ? "Full-service hotel" : "Select-service hotel",
    accent: meta.accent || accentFor(meta.brand),
    series: parsed.series,
    hotelSeries: parsed.hotelSeries,
    capitalDeployed: meta.capitalDeployed || estimateCapital(meta.rooms, meta.stars),
    netMargin,
    brand: meta.brand,
    rooms: meta.rooms,
    stars: meta.stars,
    // Honest about precision: comp-set/RGI and GOP/labor were defaulted unless the file carried them.
    compEstimated: !parsed.hasComp,
    costEstimated: !parsed.hasCost,
  };
}

// ── Manual entry: synthesize a believable trailing series from a few real numbers ────
const DOW = [0.7, 0.9, 1.04, 1.07, 1.12, 1.06, 0.78]; // Sun..Sat, business-travel shape

export interface ManualHotelInput extends HotelMeta {
  /** Typical Average Daily Rate ($). */
  adr: number;
  /** Typical occupancy as a fraction (0–1) or percent (Helm normalizes). */
  occupancy: number;
  /** Optional: how the property is trending over the window (e.g. 0.05 = +5%). */
  trend?: number;
  /** Optional: RGI vs comp set (100 = fair share). Defaults to 100. */
  rgi?: number;
  /** Days of history to synthesize (default 90). */
  days?: number;
}

/**
 * Build a hotel `Business` from a handful of real numbers (rooms, ADR, occupancy). Anchors a
 * seeded, weekday-seasonal series to those values so a hotelier with no file in hand still sees
 * *their* property the moment they enter four fields. Deterministic per property name.
 */
export function manualHotel(input: ManualHotelInput): Business {
  const days = input.days ?? 90;
  const occBase = input.occupancy > 1.5 ? input.occupancy / 100 : input.occupancy;
  const trend = input.trend ?? 0;
  const rgiTarget = input.rgi ?? 100;
  const rnd = mulberry32(Math.abs(hash(input.name)) >>> 0);
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const hotelSeries: HotelDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const progress = (days - 1 - i) / (days - 1);
    const trendMult = 1 + trend * progress;
    const noise = 1 + (rnd() - 0.5) * 0.12;

    const occupancy = Math.max(0.25, Math.min(0.98, occBase * DOW[d.getDay()] * trendMult * noise));
    const adr = Math.max(40, input.adr * trendMult * (1 + (rnd() - 0.5) * 0.05));
    const revpar = occupancy * adr;
    const roomsSold = Math.round(input.rooms * occupancy);
    const roomRevenue = Math.round(roomsSold * adr);
    const fbRevenue = Math.round(roomRevenue * 0.06 * (1 + (rnd() - 0.5) * 0.2));
    const otherRevenue = Math.round(roomRevenue * 0.03);
    const totalRevenue = roomRevenue + fbRevenue + otherRevenue;
    const compSetRevpar = (revpar / (rgiTarget / 100)) * (1 + (rnd() - 0.5) * 0.04);
    const gop = Math.round(totalRevenue * DEFAULT_GOP_MARGIN);
    const laborCost = Math.round(totalRevenue * DEFAULT_LABOR_PCT);

    hotelSeries.push({
      date: isoDate(d),
      roomsSold,
      roomsAvailable: input.rooms,
      occupancy: round2(occupancy),
      adr: round2(adr),
      revpar: round2(revpar),
      roomRevenue,
      fbRevenue,
      otherRevenue,
      totalRevenue,
      gop,
      gopMargin: round2(gop / totalRevenue),
      laborCost,
      laborPct: round2(laborCost / totalRevenue),
      compSetRevpar: round2(compSetRevpar),
      rgi: Math.round((compSetRevpar > 0 ? (revpar / compSetRevpar) * 100 : 100) * 10) / 10,
    });
  }

  const series: DayPoint[] = hotelSeries.map((d) => ({ date: d.date, revenue: d.totalRevenue, transactions: d.roomsSold }));
  return {
    id: slugId(input.name).replace(/^biz-/, "hotel-"),
    name: input.name,
    shortName: input.name.split(/\s+/).slice(0, 2).join(" "),
    type: "hotel",
    location: input.location || "",
    category: input.stars && input.stars >= 4 ? "Full-service hotel" : "Select-service hotel",
    accent: input.accent || accentFor(input.brand),
    series,
    hotelSeries,
    capitalDeployed: input.capitalDeployed || estimateCapital(input.rooms, input.stars),
    netMargin: 0.1,
    brand: input.brand,
    rooms: input.rooms,
    stars: input.stars,
    // Manual entry has no STR feed (RGI defaults to fair share unless given) and no P&L —
    // GOP & labor are synthesized from default margins, so both read as estimates.
    compEstimated: input.rgi == null,
    costEstimated: true,
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** The columns of the downloadable upload template (header order). */
export const HOTEL_TEMPLATE_COLUMNS = [
  "Date",
  "Rooms Available",
  "Rooms Sold",
  "Occupancy",
  "ADR",
  "RevPAR",
  "Room Revenue",
  "F&B Revenue",
  "Other Revenue",
  "Total Revenue",
  "Comp Set RevPAR",
  "GOP",
  "Labor Cost",
];
