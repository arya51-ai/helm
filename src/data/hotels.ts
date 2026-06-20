import type { Business, HotelDay, PipItem } from "../types";
import { mulberry32, isoDate } from "./rng";

const DAYS = 90;

function localMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

interface HotelDef {
  id: string;
  name: string;
  shortName: string;
  brand: string;
  location: string;
  rooms: number;
  stars: number;
  category: string;
  accent: string;
  seed: number;
  baseAdr: number;
  baseOccupancy: number;
  trend: number;
  noise: number;
  dow: number[];
  fbRatio: number;
  otherRatio: number;
  laborRate: number;
  gopMarginBase: number;
  capitalDeployed: number;
  reviewScore: number;
  reviewCount: number;
  compSetAdj: number;
}

const HOTEL_DEFS: HotelDef[] = [
  {
    id: "marriott-downtown-col",
    name: "Marriott Columbus Downtown",
    shortName: "Marriott DT",
    brand: "Marriott",
    location: "Columbus, OH",
    rooms: 248,
    stars: 4,
    category: "Full-service hotel",
    accent: "#BE0028",
    seed: 4401,
    baseAdr: 189,
    baseOccupancy: 0.74,
    trend: 0.06,
    noise: 0.08,
    dow: [0.68, 0.92, 1.05, 1.08, 1.12, 1.06, 0.78],
    fbRatio: 0.22,
    otherRatio: 0.08,
    laborRate: 0.33,
    gopMarginBase: 0.38,
    capitalDeployed: 12_500_000,
    reviewScore: 4.3,
    reviewCount: 2847,
    compSetAdj: 1.04,
  },
  {
    id: "hilton-garden-easton",
    name: "Hilton Garden Inn Easton",
    shortName: "HGI Easton",
    brand: "Hilton",
    location: "Columbus, OH",
    rooms: 156,
    stars: 3,
    category: "Select-service hotel",
    accent: "#003B71",
    seed: 5523,
    baseAdr: 142,
    baseOccupancy: 0.79,
    trend: 0.03,
    noise: 0.07,
    dow: [0.65, 0.88, 1.06, 1.10, 1.14, 1.04, 0.72],
    fbRatio: 0.08,
    otherRatio: 0.04,
    laborRate: 0.28,
    gopMarginBase: 0.42,
    capitalDeployed: 6_200_000,
    reviewScore: 4.1,
    reviewCount: 1523,
    compSetAdj: 0.97,
  },
  {
    id: "hampton-inn-airport",
    name: "Hampton Inn Airport",
    shortName: "Hampton APT",
    brand: "Hilton",
    location: "Columbus, OH",
    rooms: 118,
    stars: 3,
    category: "Limited-service hotel",
    accent: "#002D72",
    seed: 6671,
    baseAdr: 119,
    baseOccupancy: 0.82,
    trend: 0.02,
    noise: 0.06,
    dow: [0.74, 0.90, 1.04, 1.06, 1.08, 0.98, 0.80],
    fbRatio: 0.04,
    otherRatio: 0.02,
    laborRate: 0.25,
    gopMarginBase: 0.44,
    capitalDeployed: 4_100_000,
    reviewScore: 4.4,
    reviewCount: 987,
    compSetAdj: 1.01,
  },
  {
    id: "ihg-holiday-inn-dublin",
    name: "Holiday Inn Dublin",
    shortName: "HI Dublin",
    brand: "IHG",
    location: "Dublin, OH",
    rooms: 192,
    stars: 3,
    category: "Full-service hotel",
    accent: "#008752",
    seed: 7789,
    baseAdr: 134,
    baseOccupancy: 0.71,
    trend: -0.02,
    noise: 0.09,
    dow: [0.62, 0.85, 1.02, 1.08, 1.15, 1.10, 0.74],
    fbRatio: 0.15,
    otherRatio: 0.06,
    laborRate: 0.35,
    gopMarginBase: 0.34,
    capitalDeployed: 7_800_000,
    reviewScore: 3.8,
    reviewCount: 2104,
    compSetAdj: 0.92,
  },
  {
    id: "fairfield-inn-grove-city",
    name: "Fairfield Inn Grove City",
    shortName: "Fairfield GC",
    brand: "Marriott",
    location: "Grove City, OH",
    rooms: 94,
    stars: 3,
    category: "Economy select-service",
    accent: "#B5A268",
    seed: 8834,
    baseAdr: 104,
    baseOccupancy: 0.76,
    trend: 0.04,
    noise: 0.07,
    dow: [0.72, 0.86, 1.02, 1.04, 1.10, 1.08, 0.82],
    fbRatio: 0.03,
    otherRatio: 0.02,
    laborRate: 0.24,
    gopMarginBase: 0.46,
    capitalDeployed: 3_200_000,
    reviewScore: 4.2,
    reviewCount: 643,
    compSetAdj: 1.06,
  },
  // ── AAHOA-scale expansion: varied markets (FL/TX/GA/TN/AZ) and brand tiers, with a few
  //    deliberate "needs-attention" stories so the command center + Brief have sharp things
  //    to say at scale. Pure additive data — same HotelDef shape, same genHotelSeries. ──
  {
    // Sun-belt leisure star — strong demand trend + a hot "today" → the RevPAR-surge headline.
    id: "marriott-beachfront-clearwater",
    name: "Clearwater Beach Marriott Suites",
    shortName: "Marriott CW",
    brand: "Marriott",
    location: "Clearwater, FL",
    rooms: 220,
    stars: 4,
    category: "Resort hotel",
    accent: "#BE0028",
    seed: 9912,
    baseAdr: 268,
    baseOccupancy: 0.82,
    trend: 0.14,
    noise: 0.08,
    dow: [0.92, 0.86, 0.94, 1.0, 1.12, 1.22, 1.18],
    fbRatio: 0.26,
    otherRatio: 0.11,
    laborRate: 0.31,
    gopMarginBase: 0.41,
    capitalDeployed: 18_900_000,
    reviewScore: 4.5,
    reviewCount: 3962,
    compSetAdj: 1.11,
  },
  {
    // Convention-center select-service in a strong corporate market — steady, profitable anchor.
    id: "hilton-garden-austin-dt",
    name: "Hilton Garden Inn Austin Downtown",
    shortName: "HGI Austin",
    brand: "Hilton",
    location: "Austin, TX",
    rooms: 174,
    stars: 3,
    category: "Select-service hotel",
    accent: "#003B71",
    seed: 10234,
    baseAdr: 198,
    baseOccupancy: 0.8,
    trend: 0.05,
    noise: 0.07,
    dow: [0.6, 0.92, 1.08, 1.12, 1.16, 1.02, 0.66],
    fbRatio: 0.1,
    otherRatio: 0.05,
    laborRate: 0.29,
    gopMarginBase: 0.43,
    capitalDeployed: 9_400_000,
    reviewScore: 4.3,
    reviewCount: 2188,
    compSetAdj: 1.02,
  },
  {
    // LABOR-HOT story: thin GOP + elevated labor load (turnover/OT in a tight ATL labor market).
    id: "ihg-crowne-atlanta-perimeter",
    name: "Crowne Plaza Atlanta Perimeter",
    shortName: "Crowne ATL",
    brand: "IHG",
    location: "Atlanta, GA",
    rooms: 286,
    stars: 4,
    category: "Full-service hotel",
    accent: "#008752",
    seed: 11567,
    baseAdr: 156,
    baseOccupancy: 0.69,
    trend: 0.01,
    noise: 0.09,
    dow: [0.6, 0.9, 1.06, 1.1, 1.12, 0.96, 0.66],
    fbRatio: 0.2,
    otherRatio: 0.07,
    laborRate: 0.43,
    gopMarginBase: 0.28,
    capitalDeployed: 11_200_000,
    reviewScore: 3.9,
    reviewCount: 2741,
    compSetAdj: 0.99,
  },
  {
    // RGI-LAGGARD story: comp set out-earns us (priced/positioned below fair share) → RevPAR
    //   index well under 100 even though occupancy looks okay. Losing share. Note rgi tracks
    //   compSetAdj (rgi ≈ compSetAdj × 100 in genHotelSeries), so < 1 = under fair share.
    id: "wyndham-laquinta-nashville",
    name: "La Quinta Nashville Airport",
    shortName: "LQ Nashville",
    brand: "Wyndham",
    location: "Nashville, TN",
    rooms: 142,
    stars: 2,
    category: "Limited-service hotel",
    accent: "#1F6FB2",
    seed: 12890,
    baseAdr: 121,
    baseOccupancy: 0.78,
    trend: -0.03,
    noise: 0.08,
    dow: [0.7, 0.9, 1.04, 1.08, 1.12, 1.0, 0.74],
    fbRatio: 0.04,
    otherRatio: 0.03,
    laborRate: 0.3,
    gopMarginBase: 0.4,
    capitalDeployed: 5_600_000,
    reviewScore: 4.0,
    reviewCount: 1342,
    compSetAdj: 0.82,
  },
  {
    // PIP-OVERDUE story: full-service Marriott carrying a brand-mandated improvement plan with
    //   an item past deadline (see buildSampleHotels — pipItems attached + forced overdue).
    id: "marriott-sheraton-phoenix",
    name: "Sheraton Phoenix Crescent",
    shortName: "Sheraton PHX",
    brand: "Marriott",
    location: "Phoenix, AZ",
    rooms: 264,
    stars: 4,
    category: "Full-service hotel",
    accent: "#BE0028",
    seed: 13456,
    baseAdr: 171,
    baseOccupancy: 0.72,
    trend: 0.02,
    noise: 0.08,
    dow: [0.66, 0.9, 1.04, 1.08, 1.12, 1.02, 0.74],
    fbRatio: 0.18,
    otherRatio: 0.08,
    laborRate: 0.34,
    gopMarginBase: 0.36,
    capitalDeployed: 13_700_000,
    reviewScore: 4.1,
    reviewCount: 2503,
    compSetAdj: 1.0,
  },
  {
    // REVIEW-DIP story: extended-stay whose guest scores have slipped below the 4.0 line — a
    //   reputation problem the Brief should surface (low reviewScore + a soft "today").
    id: "hilton-homewood-dallas",
    name: "Homewood Suites Dallas Las Colinas",
    shortName: "Homewood DAL",
    brand: "Hilton",
    location: "Irving, TX",
    rooms: 132,
    stars: 3,
    category: "Extended-stay hotel",
    accent: "#003B71",
    seed: 14021,
    baseAdr: 144,
    baseOccupancy: 0.81,
    trend: 0.0,
    noise: 0.07,
    dow: [0.82, 0.92, 1.04, 1.06, 1.08, 0.96, 0.84],
    fbRatio: 0.06,
    otherRatio: 0.03,
    laborRate: 0.27,
    gopMarginBase: 0.44,
    capitalDeployed: 7_100_000,
    reviewScore: 3.6,
    reviewCount: 1487,
    compSetAdj: 1.03,
  },
  {
    // Economy roadside anchor — high occupancy, lean cost base, dependable cash cow.
    id: "ihg-holiday-express-savannah",
    name: "Holiday Inn Express Savannah I-95",
    shortName: "HIX Savannah",
    brand: "IHG",
    location: "Savannah, GA",
    rooms: 108,
    stars: 3,
    category: "Limited-service hotel",
    accent: "#008752",
    seed: 14788,
    baseAdr: 128,
    baseOccupancy: 0.84,
    trend: 0.03,
    noise: 0.06,
    dow: [0.78, 0.9, 1.02, 1.06, 1.12, 1.1, 0.86],
    fbRatio: 0.04,
    otherRatio: 0.02,
    laborRate: 0.25,
    gopMarginBase: 0.45,
    capitalDeployed: 4_300_000,
    reviewScore: 4.4,
    reviewCount: 1129,
    compSetAdj: 1.05,
  },
];

function genHotelSeries(
  def: HotelDef,
  days: number,
  endDate: Date,
): { series: import("../types").DayPoint[]; hotelSeries: HotelDay[] } {
  const rnd = mulberry32(def.seed);
  const series: import("../types").DayPoint[] = [];
  const hotelSeries: HotelDay[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const date = isoDate(d);
    const dowMult = def.dow[d.getDay()];
    const progress = (days - 1 - i) / (days - 1);
    const trendMult = 1 + def.trend * progress;
    const noiseMult = 1 + (rnd() - 0.5) * 2 * def.noise;

    const occupancy = Math.min(0.98, Math.max(0.35, def.baseOccupancy * dowMult * trendMult * noiseMult));
    const adr = Math.max(60, def.baseAdr * trendMult * (1 + (rnd() - 0.5) * 0.06));
    const revpar = occupancy * adr;
    const roomsSold = Math.round(def.rooms * occupancy);
    const roomRevenue = Math.round(roomsSold * adr);
    const fbRevenue = Math.round(roomRevenue * def.fbRatio * (1 + (rnd() - 0.5) * 0.2));
    const otherRevenue = Math.round(roomRevenue * def.otherRatio * (1 + (rnd() - 0.5) * 0.15));
    const totalRevenue = roomRevenue + fbRevenue + otherRevenue;

    const laborCost = Math.round(totalRevenue * def.laborRate * (1 + (rnd() - 0.5) * 0.1));
    const laborPct = totalRevenue ? laborCost / totalRevenue : 0;

    const otherCosts = Math.round(totalRevenue * (1 - def.gopMarginBase - def.laborRate) * (1 + (rnd() - 0.5) * 0.08));
    const gop = totalRevenue - laborCost - otherCosts;
    const gopMargin = totalRevenue ? gop / totalRevenue : 0;

    const compSetRevpar = revpar / def.compSetAdj * (1 + (rnd() - 0.5) * 0.04);
    const rgi = compSetRevpar > 0 ? (revpar / compSetRevpar) * 100 : 100;

    series.push({ date, revenue: totalRevenue, transactions: roomsSold });
    hotelSeries.push({
      date,
      roomsSold,
      roomsAvailable: def.rooms,
      occupancy,
      adr: Math.round(adr * 100) / 100,
      revpar: Math.round(revpar * 100) / 100,
      roomRevenue,
      fbRevenue,
      otherRevenue,
      totalRevenue,
      gop,
      gopMargin: Math.round(gopMargin * 1000) / 1000,
      laborCost,
      laborPct: Math.round(laborPct * 1000) / 1000,
      compSetRevpar: Math.round(compSetRevpar * 100) / 100,
      rgi: Math.round(rgi * 10) / 10,
    });
  }

  return { series, hotelSeries };
}

function genPipItems(seed: number, forceOverdue = false): PipItem[] {
  const rnd = mulberry32(seed + 999);
  const items: PipItem[] = [
    {
      id: "pip-lobby",
      title: "Lobby renovation & modernization",
      category: "lobby",
      status: "in-progress",
      deadline: "2026-09-30",
      estimatedCost: 450_000,
      actualCost: 210_000,
    },
    {
      id: "pip-ffe",
      title: "Guest room FF&E refresh (floors 3-6)",
      category: "FF&E",
      status: "upcoming",
      deadline: "2027-03-31",
      estimatedCost: 1_200_000,
    },
    {
      id: "pip-keylock",
      title: "Mobile key + smart lock rollout",
      category: "technology",
      status: "complete",
      deadline: "2026-04-15",
      estimatedCost: 85_000,
      actualCost: 78_500,
    },
    {
      id: "pip-fire",
      title: "Fire suppression system upgrade",
      category: "safety",
      // forceOverdue pins the PIP-overdue narrative for the showcase property; otherwise it's
      // a coin-flip so other properties vary day to day.
      status: forceOverdue || rnd() > 0.5 ? "overdue" : "in-progress",
      deadline: "2026-06-01",
      estimatedCost: 165_000,
    },
    {
      id: "pip-exterior",
      title: "Exterior signage & porte-cochère",
      category: "exterior",
      status: "upcoming",
      deadline: "2027-01-15",
      estimatedCost: 220_000,
    },
    {
      id: "pip-rooms-bath",
      title: "Bathroom refresh (all rooms)",
      category: "rooms",
      status: "upcoming",
      deadline: "2027-06-30",
      estimatedCost: 890_000,
    },
  ];
  return items;
}

function engineerHotelToday(
  hotelSeries: HotelDay[],
  series: import("../types").DayPoint[],
  factor: number,
): void {
  const last = hotelSeries[hotelSeries.length - 1];
  const dow = new Date(`${last.date}T00:00:00`).getDay();
  const sameDow = hotelSeries
    .slice(0, -1)
    .filter((p) => new Date(`${p.date}T00:00:00`).getDay() === dow)
    .slice(-8);
  const expectedOcc =
    sameDow.reduce((a, b) => a + b.occupancy, 0) / Math.max(1, sameDow.length);
  const newOcc = Math.min(0.98, Math.max(0.3, expectedOcc * factor));
  const roomsSold = Math.round(last.roomsAvailable * newOcc);
  const roomRevenue = Math.round(roomsSold * last.adr);
  const totalRevenue = roomRevenue + last.fbRevenue + last.otherRevenue;
  const gop = Math.round(totalRevenue * last.gopMargin);
  Object.assign(last, {
    occupancy: newOcc,
    roomsSold,
    roomRevenue,
    totalRevenue,
    gop,
    revpar: newOcc * last.adr,
  });
  series[series.length - 1] = {
    ...series[series.length - 1],
    revenue: totalRevenue,
    transactions: roomsSold,
  };
}

// "Today" occupancy multiplier per property, keyed by id so the engineered narrative stays
// pinned to the right hotel as the portfolio grows. Properties not listed fall back to a mild
// seeded wobble (never undefined → never NaN through engineerHotelToday).
const TODAY_FACTOR: Record<string, number> = {
  "marriott-downtown-col": 1.08,
  "hilton-garden-easton": 0.95,
  "hampton-inn-airport": 1.02,
  "ihg-holiday-inn-dublin": 0.82,
  "fairfield-inn-grove-city": 1.12,
  // Showcase stories:
  "marriott-beachfront-clearwater": 1.16, // RevPAR-surge star — booming today
  "ihg-crowne-atlanta-perimeter": 0.97, // labor-hot (carried by laborRate, not today)
  "wyndham-laquinta-nashville": 0.93, // RGI laggard (carried by compSetAdj)
  "marriott-sheraton-phoenix": 1.0, // PIP-overdue (carried by pipItems)
  "hilton-homewood-dallas": 0.86, // review-dip — soft day on top of weak scores
  "ihg-holiday-express-savannah": 1.05,
  "hilton-garden-austin-dt": 1.03,
};

// Properties that carry a brand-mandated PIP. Sheraton PHX is the deliberate PIP-OVERDUE story.
const PIP_HOTELS = new Set([
  "marriott-downtown-col",
  "ihg-holiday-inn-dublin",
  "marriott-sheraton-phoenix",
]);

export function buildSampleHotels(asOf: Date = localMidnight()): Business[] {
  return HOTEL_DEFS.map((def) => {
    const { series, hotelSeries } = genHotelSeries(def, DAYS, asOf);

    // Engineer "today" for narrative variety. Unlisted hotels get a gentle seeded wobble so
    // the figure is always a finite number.
    const factor =
      TODAY_FACTOR[def.id] ?? 1 + (mulberry32(def.seed + 17)() - 0.5) * 0.16;
    engineerHotelToday(hotelSeries, series, factor);

    const pipItems = PIP_HOTELS.has(def.id)
      ? genPipItems(def.seed, def.id === "marriott-sheraton-phoenix")
      : undefined;

    return {
      id: def.id,
      name: def.name,
      shortName: def.shortName,
      type: "hotel" as const,
      location: def.location,
      category: def.category,
      accent: def.accent,
      series,
      hotelSeries,
      capitalDeployed: def.capitalDeployed,
      // Bottom-line margin after debt service, management fees, FF&E reserve, taxes &
      // insurance — well below the GOP margin the hospitality KPIs report. Keeps ROIC and
      // net-worth accrual realistic (~10-13% return on a hotel's capital).
      netMargin: def.gopMarginBase * 0.25,
      brand: def.brand,
      rooms: def.rooms,
      stars: def.stars,
      reviewScore: def.reviewScore,
      reviewCount: def.reviewCount,
      pipItems,
    };
  });
}

export { HOTEL_DEFS };
