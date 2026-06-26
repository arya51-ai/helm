import type { Business, ChannelMix, DayPoint, HotelDay } from "../types";
import { mulberry32, isoDate } from "./rng";

/**
 * Northwood Motel — Pinecrest, the lake region, ON.
 *
 * The design-partner demo (Sam). A REAL independent motel: 21 rooms, no flag, deeply
 * seasonal (the island lives and dies by summer), sold across Booking.com / Expedia / direct,
 * and run off a phone through Little Hotelier. So Helm here speaks the language an owner-operator
 * actually lives in — occupancy, nightly rate, where the bookings come from, and what the OTAs
 * take — NOT the chain dialect (RevPAR Index, GOP, brand PIP) the seeded Marriotts/Hiltons use.
 *
 * Numbers are modeled, anchored to the property's public reality (21 rooms; rates from ~$111 CAD,
 * climbing in peak season; listed on Booking.com, Expedia, Hotels.com, Priceline). Everything is
 * in CAD and presented natively (the motel surfaces format CA$); we leave `currency` unset so the
 * load pipeline doesn't FX-scale these CAD magnitudes.
 */

export const NORTHWOOD_ID = "northwood-motel";
const ROOMS = 21;
const DAYS = 90;

// ── Pinecrest seasonality. Anchors are the *base* occupancy / nightly rate for the 1st of each
//    month (Jan…Dec); we interpolate within the month so late June reads as "climbing into peak".
//    Summer (Jul–Aug) is the whole year; shoulder collapses fast after Labour Day. ──────────────
const MONTH_OCC = [0.20, 0.20, 0.24, 0.36, 0.54, 0.70, 0.89, 0.90, 0.66, 0.42, 0.26, 0.21];
const MONTH_ADR = [101, 101, 104, 110, 120, 133, 150, 153, 135, 117, 106, 103]; // CAD

// Leisure rhythm — opposite of a business hotel: midweek is the trough, Fri/Sat fill the place.
const OCC_DOW = [0.92, 0.80, 0.78, 0.81, 0.90, 1.16, 1.24]; // Sun..Sat
const ADR_DOW = [0.99, 0.97, 0.96, 0.97, 1.0, 1.06, 1.1]; // weekend rate bump

// Where the bookings come from + what each channel charges. Direct is the prize: zero commission,
// and the guest is yours to bring back. Booking.com dominates Canadian leisure OTAs; Expedia next.
export const NORTHWOOD_CHANNELS: ChannelMix = {
  direct: 0.4,
  bookingCom: 0.34,
  expedia: 0.17,
  other: 0.09,
  bookingComRate: 0.15,
  expediaRate: 0.16,
  otherRate: 0.14,
};

const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Smoothly interpolate a monthly anchor table at a given date. */
function seasonal(table: number[], d: Date): number {
  const m = d.getMonth();
  const frac = (d.getDate() - 1) / daysInMonth(d.getFullYear(), m);
  return lerp(table[m], table[(m + 1) % 12], frac);
}

function localMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildDay(d: Date, rnd: () => number): HotelDay {
  const occBase = seasonal(MONTH_OCC, d);
  const adrBase = seasonal(MONTH_ADR, d);
  const dow = d.getDay();

  const occupancy = Math.max(0.12, Math.min(0.99, occBase * OCC_DOW[dow] * (1 + (rnd() - 0.5) * 0.12)));
  const adr = Math.max(95, adrBase * ADR_DOW[dow] * (1 + (rnd() - 0.5) * 0.05));
  const revpar = occupancy * adr;
  const roomsSold = Math.round(ROOMS * occupancy);
  const roomRevenue = Math.round(roomsSold * adr);
  // A motel has no restaurant — just a little vending / laundry / late-checkout "other".
  const otherRevenue = Math.round(roomRevenue * 0.02);
  const totalRevenue = roomRevenue + otherRevenue;
  // Owner-operated and lean: labor runs well under a full-service hotel; the rest of the cost base
  // (utilities, OTA fees, supplies, taxes) leaves a healthy seasonal GOP.
  const laborCost = Math.round(totalRevenue * 0.2);
  const gop = Math.round(totalRevenue * 0.44);

  return {
    date: isoDate(d),
    roomsSold,
    roomsAvailable: ROOMS,
    occupancy: Math.round(occupancy * 1000) / 1000,
    adr: Math.round(adr * 100) / 100,
    revpar: Math.round(revpar * 100) / 100,
    roomRevenue,
    fbRevenue: 0,
    otherRevenue,
    totalRevenue,
    gop,
    gopMargin: 0.44,
    laborCost,
    laborPct: 0.2,
    // No STR comp set for an independent motel — fair share is a non-concept here, so RGI sits at
    // 100 and the motel UI never shows it.
    compSetRevpar: Math.round(revpar * 100) / 100,
    rgi: 100,
  };
}

/** Pin "today" to a strong summer number — the season has clearly arrived, which is exactly the
 *  moment the commission + pricing story matters most. */
function engineerToday(series: HotelDay[]): void {
  const last = series[series.length - 1];
  const occ = 0.91;
  const roomsSold = Math.round(last.roomsAvailable * occ);
  const roomRevenue = Math.round(roomsSold * last.adr);
  const otherRevenue = Math.round(roomRevenue * 0.02);
  const totalRevenue = roomRevenue + otherRevenue;
  Object.assign(last, {
    occupancy: occ,
    roomsSold,
    roomRevenue,
    otherRevenue,
    totalRevenue,
    revpar: Math.round(occ * last.adr * 100) / 100,
    gop: Math.round(totalRevenue * 0.44),
    laborCost: Math.round(totalRevenue * 0.2),
  });
}

export function buildNorthwoodMotel(asOf: Date = localMidnight()): Business {
  const rnd = mulberry32(20260621);
  const hotelSeries: HotelDay[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(asOf);
    d.setDate(d.getDate() - i);
    hotelSeries.push(buildDay(d, rnd));
  }
  engineerToday(hotelSeries);

  const series: DayPoint[] = hotelSeries.map((d) => ({
    date: d.date,
    revenue: d.totalRevenue,
    transactions: d.roomsSold,
  }));

  return {
    id: NORTHWOOD_ID,
    name: "Northwood Motel",
    shortName: "Northwood",
    type: "hotel",
    location: "Pinecrest, ON",
    category: "Independent motel",
    accent: "#0e7c66", // northwood green — the island's own
    series,
    hotelSeries,
    // ~CA$1.4M independent property; modeled net margin for an owner-operated seasonal motel.
    capitalDeployed: 1_400_000,
    netMargin: 0.3,
    rooms: ROOMS,
    stars: 2,
    reviewScore: 4.5,
    reviewCount: 128,
    independent: true,
    channelMix: NORTHWOOD_CHANNELS,
    // Modeled from the property's public OTA footprint, not a commission feed — labeled as an
    // estimate in the UI until the owner confirms his real booking sources.
    channelEstimated: true,
    pms: "Little Hotelier",
    ownerName: "Sam",
    // No STR feed, no P&L upload — honest about both (the motel UI leans on neither).
    compEstimated: true,
    costEstimated: true,
  };
}
