import type { Business, HotelDay, HotelPortfolioMetrics, HotelPropertySummary } from "../types";

function last(arr: HotelDay[], n: number): HotelDay[] {
  return arr.slice(-n);
}

function avg(vals: number[]): number {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function trend(arr: HotelDay[], field: (d: HotelDay) => number, window = 7): number {
  const recent = avg(last(arr, window).map(field));
  const prev = avg(arr.slice(-window * 2, -window).map(field));
  return prev ? recent / prev - 1 : 0;
}

export interface HotelMetrics {
  todayOcc: number;
  todayAdr: number;
  todayRevpar: number;
  todayRgi: number;
  todayGopMargin: number;
  todayLaborPct: number;
  todayTotalRevenue: number;
  todayRoomRevenue: number;
  todayFbRevenue: number;
  todayOtherRevenue: number;
  todayGop: number;
  todayCompSetRevpar: number;

  weekOcc: number;
  weekAdr: number;
  weekRevpar: number;
  weekRgi: number;
  weekGopMargin: number;
  weekLaborPct: number;
  weekTotalRevenue: number;
  weekGop: number;

  monthOcc: number;
  monthAdr: number;
  monthRevpar: number;
  monthRgi: number;
  monthGopMargin: number;
  monthLaborPct: number;
  monthTotalRevenue: number;
  monthGop: number;

  revparTrend7: number;
  occTrend7: number;
  adrTrend7: number;
  rgiTrend7: number;
  gopTrend7: number;

  revparTrend30: number;
  occTrend30: number;

  occVsExpected: number;
}

export function hotelMetricsFor(b: Business): HotelMetrics | null {
  const hs = b.hotelSeries;
  if (!hs?.length) return null;

  const today = hs[hs.length - 1];
  const w7 = last(hs, 7);
  const w30 = last(hs, 30);

  const dow = new Date(`${today.date}T00:00:00`).getDay();
  const sameDow = hs.slice(0, -1).filter((p) => new Date(`${p.date}T00:00:00`).getDay() === dow).slice(-8);
  const expectedOcc = avg(sameDow.map((d) => d.occupancy));

  return {
    todayOcc: today.occupancy,
    todayAdr: today.adr,
    todayRevpar: today.revpar,
    todayRgi: today.rgi,
    todayGopMargin: today.gopMargin,
    todayLaborPct: today.laborPct,
    todayTotalRevenue: today.totalRevenue,
    todayRoomRevenue: today.roomRevenue,
    todayFbRevenue: today.fbRevenue,
    todayOtherRevenue: today.otherRevenue,
    todayGop: today.gop,
    todayCompSetRevpar: today.compSetRevpar,

    weekOcc: avg(w7.map((d) => d.occupancy)),
    weekAdr: avg(w7.map((d) => d.adr)),
    weekRevpar: avg(w7.map((d) => d.revpar)),
    weekRgi: avg(w7.map((d) => d.rgi)),
    weekGopMargin: avg(w7.map((d) => d.gopMargin)),
    weekLaborPct: avg(w7.map((d) => d.laborPct)),
    weekTotalRevenue: w7.reduce((a, d) => a + d.totalRevenue, 0),
    weekGop: w7.reduce((a, d) => a + d.gop, 0),

    monthOcc: avg(w30.map((d) => d.occupancy)),
    monthAdr: avg(w30.map((d) => d.adr)),
    monthRevpar: avg(w30.map((d) => d.revpar)),
    monthRgi: avg(w30.map((d) => d.rgi)),
    monthGopMargin: avg(w30.map((d) => d.gopMargin)),
    monthLaborPct: avg(w30.map((d) => d.laborPct)),
    monthTotalRevenue: w30.reduce((a, d) => a + d.totalRevenue, 0),
    monthGop: w30.reduce((a, d) => a + d.gop, 0),

    revparTrend7: trend(hs, (d) => d.revpar, 7),
    occTrend7: trend(hs, (d) => d.occupancy, 7),
    adrTrend7: trend(hs, (d) => d.adr, 7),
    rgiTrend7: trend(hs, (d) => d.rgi, 7),
    gopTrend7: trend(hs, (d) => d.gop, 7),

    revparTrend30: trend(hs, (d) => d.revpar, 30),
    occTrend30: trend(hs, (d) => d.occupancy, 30),

    occVsExpected: expectedOcc ? today.occupancy / expectedOcc - 1 : 0,
  };
}

export function hotelPortfolioMetrics(hotels: Business[]): HotelPortfolioMetrics {
  const props: HotelPropertySummary[] = [];
  let totalRooms = 0;
  let totalRoomRev = 0;
  let totalRev = 0;
  let totalGop = 0;
  let totalReviewCount = 0;

  for (const h of hotels) {
    const m = hotelMetricsFor(h);
    if (!m || !h.hotelSeries?.length) continue;
    totalRooms += h.rooms ?? 0;
    totalRoomRev += m.monthTotalRevenue * (m.monthOcc > 0 ? m.todayRoomRevenue / m.todayTotalRevenue : 0.7);
    totalRev += m.monthTotalRevenue;
    totalGop += m.monthGop;
    totalReviewCount += h.reviewCount ?? 0;

    props.push({
      id: h.id,
      name: h.name,
      shortName: h.shortName ?? h.name.split(/\s+/)[0],
      brand: h.brand ?? "",
      location: h.location,
      rooms: h.rooms ?? 0,
      accent: h.accent,
      occupancy: m.monthOcc,
      adr: m.monthAdr,
      revpar: m.monthRevpar,
      rgi: m.monthRgi,
      gopMargin: m.monthGopMargin,
      laborPct: m.monthLaborPct,
      reviewScore: h.reviewScore ?? 0,
      revparTrend: m.revparTrend7,
      occupancyTrend: m.occTrend7,
    });
  }

  const n = props.length || 1;
  return {
    totalRooms,
    avgOccupancy: avg(props.map((p) => p.occupancy)),
    avgAdr: avg(props.map((p) => p.adr)),
    avgRevpar: avg(props.map((p) => p.revpar)),
    totalRoomRevenue: Math.round(totalRoomRev),
    totalRevenue: Math.round(totalRev),
    totalGop: Math.round(totalGop),
    avgGopMargin: totalRev ? totalGop / totalRev : 0,
    avgRgi: avg(props.map((p) => p.rgi)),
    avgLaborPct: avg(props.map((p) => p.laborPct)),
    avgReviewScore: avg(props.map((p) => p.reviewScore)),
    totalReviewCount,
    properties: props.sort((a, b) => b.revpar - a.revpar),
  };
}
