import type { Business, DayPoint, FuelDay } from "../types";
import { mulberry32, isoDate } from "./rng";

const DAYS = 90;

function localMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

interface StationDef {
  id: string;
  name: string;
  shortName: string;
  brand: string;
  location: string;
  pumps: number;
  category: string;
  accent: string;
  seed: number;
  baseGallons: number; // gallons/day
  pumpPrice: number; // $/gal retail
  baseCpg: number; // cents/gal margin
  baseInside: number; // inside sales $/day
  insideMarginPct: number;
  otherRevenue: number; // car wash / lottery / food $/day
  otherMarginPct: number;
  trend: number; // gallons trend across window
  noise: number;
  dow: number[]; // Sun..Sat — commuter-weighted
  capitalDeployed: number;
}

// Three stations with deliberately different shapes so the COO has something to say:
//  • Highway — huge volume, weak inside (leaving c-store money on the table)
//  • Neighborhood — modest volume, strong inside + margin (the model to replicate)
//  • Midtown — balanced, with a car wash carrying "other"
const STATION_DEFS: StationDef[] = [
  {
    id: "fuel-marathon-hwy",
    name: "Marathon — Highway 40",
    shortName: "Marathon 40",
    brand: "Marathon",
    location: "Columbus, OH",
    pumps: 12,
    category: "Fuel + c-store",
    accent: "#0061a8",
    seed: 3301,
    baseGallons: 5600,
    pumpPrice: 3.18,
    baseCpg: 24,
    baseInside: 2700,
    insideMarginPct: 0.26,
    otherRevenue: 240,
    otherMarginPct: 0.5,
    trend: 0.04,
    noise: 0.08,
    dow: [0.82, 1.08, 1.1, 1.08, 1.12, 1.14, 0.74],
    capitalDeployed: 2_900_000,
  },
  {
    id: "fuel-bp-grandview",
    name: "BP — Grandview",
    shortName: "BP Grandview",
    brand: "BP",
    location: "Grandview, OH",
    pumps: 8,
    category: "Fuel + c-store",
    accent: "#0b9a4a",
    seed: 4422,
    baseGallons: 3400,
    pumpPrice: 3.24,
    baseCpg: 31,
    baseInside: 4600,
    insideMarginPct: 0.33,
    otherRevenue: 180,
    otherMarginPct: 0.55,
    trend: 0.03,
    noise: 0.07,
    dow: [0.95, 1.0, 1.02, 1.03, 1.08, 1.12, 0.96],
    capitalDeployed: 3_400_000,
  },
  {
    id: "fuel-shell-dublin",
    name: "Shell — Dublin Rd",
    shortName: "Shell Dublin",
    brand: "Shell",
    location: "Dublin, OH",
    pumps: 10,
    category: "Fuel + c-store + wash",
    accent: "#d4a017",
    seed: 5544,
    baseGallons: 4300,
    pumpPrice: 3.21,
    baseCpg: 28,
    baseInside: 3500,
    insideMarginPct: 0.29,
    otherRevenue: 1400, // car wash carries this one
    otherMarginPct: 0.62,
    trend: -0.02,
    noise: 0.09,
    dow: [1.0, 0.98, 1.0, 1.02, 1.06, 1.16, 1.04],
    capitalDeployed: 3_100_000,
  },
];

function genStationSeries(def: StationDef, days: number, endDate: Date): { series: DayPoint[]; fuelSeries: FuelDay[] } {
  const rnd = mulberry32(def.seed);
  const series: DayPoint[] = [];
  const fuelSeries: FuelDay[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const date = isoDate(d);
    const dowMult = def.dow[d.getDay()];
    const progress = (days - 1 - i) / (days - 1);
    const trendMult = 1 + def.trend * progress;
    const noise = 1 + (rnd() - 0.5) * 2 * def.noise;

    const gallonsSold = Math.round(def.baseGallons * dowMult * trendMult * noise);
    const cpg = Math.max(8, def.baseCpg * (1 + (rnd() - 0.5) * 0.18)); // fuel margin swings day to day
    const pumpPrice = def.pumpPrice * (1 + (rnd() - 0.5) * 0.03);
    const fuelRevenue = Math.round(gallonsSold * pumpPrice);
    const fuelMargin = Math.round(gallonsSold * (cpg / 100));

    const insideSales = Math.round(def.baseInside * (0.85 + dowMult * 0.15) * trendMult * (1 + (rnd() - 0.5) * 0.12));
    const insideMarginPct = def.insideMarginPct * (1 + (rnd() - 0.5) * 0.06);
    const insideMargin = Math.round(insideSales * insideMarginPct);

    const otherRevenue = Math.round(def.otherRevenue * (1 + (rnd() - 0.5) * 0.25));
    const otherMargin = Math.round(otherRevenue * def.otherMarginPct);

    const totalRevenue = fuelRevenue + insideSales + otherRevenue;
    const grossProfit = fuelMargin + insideMargin + otherMargin;

    series.push({ date, revenue: totalRevenue, transactions: Math.round(gallonsSold / 11 + insideSales / 9) });
    fuelSeries.push({
      date,
      gallonsSold,
      fuelRevenue,
      fuelMargin,
      cpg: Math.round(cpg * 10) / 10,
      insideSales,
      insideMargin,
      insideMarginPct: Math.round(insideMarginPct * 1000) / 1000,
      otherRevenue,
      otherMargin,
      totalRevenue,
      grossProfit,
    });
  }
  return { series, fuelSeries };
}

/** Engineer the latest day to a narrative multiple of typical (vs same weekday). */
function engineerToday(fuelSeries: FuelDay[], series: DayPoint[], factor: number): void {
  const last = fuelSeries[fuelSeries.length - 1];
  const dow = new Date(`${last.date}T00:00:00`).getDay();
  const sameDow = fuelSeries.slice(0, -1).filter((p) => new Date(`${p.date}T00:00:00`).getDay() === dow).slice(-8);
  const expGal = sameDow.reduce((a, b) => a + b.gallonsSold, 0) / Math.max(1, sameDow.length);
  const newGal = Math.max(500, Math.round(expGal * factor));
  const scale = last.gallonsSold ? newGal / last.gallonsSold : 1;
  const fuelRevenue = Math.round(last.fuelRevenue * scale);
  const fuelMargin = Math.round(last.fuelMargin * scale);
  const totalRevenue = fuelRevenue + last.insideSales + last.otherRevenue;
  Object.assign(last, {
    gallonsSold: newGal,
    fuelRevenue,
    fuelMargin,
    totalRevenue,
    grossProfit: fuelMargin + last.insideMargin + last.otherMargin,
  });
  series[series.length - 1] = { ...series[series.length - 1], revenue: totalRevenue };
}

export function buildSampleStations(asOf: Date = localMidnight()): Business[] {
  const factors = [1.07, 0.96, 0.83];
  return STATION_DEFS.map((def, i) => {
    const { series, fuelSeries } = genStationSeries(def, DAYS, asOf);
    engineerToday(fuelSeries, series, factors[i]);
    // Net margin ≈ gross profit / revenue × (after-opex factor). Fuel retail nets thin.
    const grossRev = fuelSeries.reduce((a, d) => a + d.totalRevenue, 0);
    const grossProfit = fuelSeries.reduce((a, d) => a + d.grossProfit, 0);
    const netMargin = grossRev ? Math.max(0.02, (grossProfit / grossRev) * 0.45) : 0.04;
    return {
      id: def.id,
      name: def.name,
      shortName: def.shortName,
      type: "fuel" as const,
      location: def.location,
      category: def.category,
      accent: def.accent,
      series,
      fuelSeries,
      capitalDeployed: def.capitalDeployed,
      netMargin: Math.round(netMargin * 1000) / 1000,
      brand: def.brand,
      pumps: def.pumps,
    };
  });
}

export { STATION_DEFS };
