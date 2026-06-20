import type { Business, FuelDay } from "../types";

function last(arr: FuelDay[], n: number): FuelDay[] {
  return arr.slice(-n);
}
function avg(vals: number[]): number {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}
function sum(vals: number[]): number {
  return vals.reduce((a, b) => a + b, 0);
}
function trend(arr: FuelDay[], f: (d: FuelDay) => number, window = 7): number {
  const recent = avg(last(arr, window).map(f));
  const prev = avg(arr.slice(-window * 2, -window).map(f));
  return prev ? recent / prev - 1 : 0;
}

export interface FuelMetrics {
  todayGallons: number;
  todayCpg: number;
  todayInside: number;
  todayTotalRevenue: number;
  todayGrossProfit: number;

  monthGallons: number;
  monthFuelRevenue: number;
  monthFuelMargin: number;
  monthInsideSales: number;
  monthInsideMargin: number;
  monthInsideMarginPct: number;
  monthOther: number;
  monthTotalRevenue: number;
  monthGrossProfit: number;
  /** Average cents-per-gallon over the trailing month. */
  monthCpg: number;
  /** Fuel share of gross profit (the rest is inside + other). */
  fuelProfitShare: number;
  /** Inside $ generated per gallon sold — the c-store "attach". */
  insidePerGallon: number;
  /** Daily averages. */
  avgGallonsDay: number;
  avgInsideDay: number;

  gallonsTrend7: number;
  cpgTrend7: number;
  insideTrend7: number;
}

export function fuelMetricsFor(b: Business): FuelMetrics | null {
  const fs = b.fuelSeries;
  if (!fs?.length) return null;
  const today = fs[fs.length - 1];
  const w30 = last(fs, 30);

  const monthGallons = sum(w30.map((d) => d.gallonsSold));
  const monthFuelMargin = sum(w30.map((d) => d.fuelMargin));
  const monthInsideSales = sum(w30.map((d) => d.insideSales));
  const monthInsideMargin = sum(w30.map((d) => d.insideMargin));
  const monthOtherMargin = sum(w30.map((d) => d.otherMargin));
  const monthGrossProfit = sum(w30.map((d) => d.grossProfit));
  const monthTotalRevenue = sum(w30.map((d) => d.totalRevenue));

  return {
    todayGallons: today.gallonsSold,
    todayCpg: today.cpg,
    todayInside: today.insideSales,
    todayTotalRevenue: today.totalRevenue,
    todayGrossProfit: today.grossProfit,

    monthGallons,
    monthFuelRevenue: sum(w30.map((d) => d.fuelRevenue)),
    monthFuelMargin,
    monthInsideSales,
    monthInsideMargin,
    monthInsideMarginPct: monthInsideSales ? monthInsideMargin / monthInsideSales : 0,
    monthOther: sum(w30.map((d) => d.otherRevenue)),
    monthTotalRevenue,
    monthGrossProfit,
    monthCpg: monthGallons ? (monthFuelMargin / monthGallons) * 100 : 0,
    fuelProfitShare: monthGrossProfit ? monthFuelMargin / monthGrossProfit : 0,
    insidePerGallon: monthGallons ? monthInsideSales / monthGallons : 0,
    avgGallonsDay: monthGallons / Math.max(1, w30.length),
    avgInsideDay: monthInsideSales / Math.max(1, w30.length),

    gallonsTrend7: trend(fs, (d) => d.gallonsSold, 7),
    cpgTrend7: trend(fs, (d) => d.cpg, 7),
    insideTrend7: trend(fs, (d) => d.insideSales, 7),
  };
}

export interface FuelStationSummary {
  id: string;
  name: string;
  shortName: string;
  brand: string;
  location: string;
  accent: string;
  avgGallonsDay: number;
  monthCpg: number;
  monthInsideMarginPct: number;
  insidePerGallon: number;
  monthGrossProfit: number;
  monthTotalRevenue: number;
  fuelProfitShare: number;
}

export interface FuelPortfolioMetrics {
  stations: FuelStationSummary[];
  totalGallons: number;
  avgCpg: number;
  totalInsideSales: number;
  avgInsideMarginPct: number;
  totalRevenue: number;
  totalGrossProfit: number;
  avgInsidePerGallon: number;
  totalPumps: number;
}

export function fuelPortfolioMetrics(stations: Business[]): FuelPortfolioMetrics {
  const sums: FuelStationSummary[] = [];
  let totalGallons = 0;
  let totalFuelMargin = 0;
  let totalInside = 0;
  let totalInsideMargin = 0;
  let totalRevenue = 0;
  let totalGrossProfit = 0;
  let totalPumps = 0;

  for (const s of stations) {
    const m = fuelMetricsFor(s);
    if (!m) continue;
    totalGallons += m.monthGallons;
    totalFuelMargin += m.monthFuelMargin;
    totalInside += m.monthInsideSales;
    totalInsideMargin += m.monthInsideMargin;
    totalRevenue += m.monthTotalRevenue;
    totalGrossProfit += m.monthGrossProfit;
    totalPumps += s.pumps ?? 0;
    sums.push({
      id: s.id,
      name: s.name,
      shortName: s.shortName ?? s.name.split(/\s+/)[0],
      brand: s.brand ?? "",
      location: s.location,
      accent: s.accent,
      avgGallonsDay: m.avgGallonsDay,
      monthCpg: m.monthCpg,
      monthInsideMarginPct: m.monthInsideMarginPct,
      insidePerGallon: m.insidePerGallon,
      monthGrossProfit: m.monthGrossProfit,
      monthTotalRevenue: m.monthTotalRevenue,
      fuelProfitShare: m.fuelProfitShare,
    });
  }

  return {
    stations: sums.sort((a, b) => b.monthGrossProfit - a.monthGrossProfit),
    totalGallons,
    avgCpg: totalGallons ? (totalFuelMargin / totalGallons) * 100 : 0,
    totalInsideSales: totalInside,
    avgInsideMarginPct: totalInside ? totalInsideMargin / totalInside : 0,
    totalRevenue,
    totalGrossProfit,
    avgInsidePerGallon: totalGallons ? totalInside / totalGallons : 0,
    totalPumps,
  };
}
