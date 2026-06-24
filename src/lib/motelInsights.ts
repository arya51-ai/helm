import type { Business, Insight } from "../types";
import { hotelMetricsFor } from "./hotelAnalytics";
import { money, pct, signedPct } from "./format";

/**
 * The independent-motel read — the half of hospitality the chain dashboards ignore. An owner-
 * operator doesn't think in RevPAR Index or brand PIP; they think in *how full am I, what's my
 * rate, how much is Booking.com taking, and is summer pacing.* This module computes exactly that
 * and writes it in their language. Used both for the Brief insight cards (via hotelInsights) and
 * the AI context (via agent.ts), so the cards and Claude tell the same story.
 *
 * All money is CAD and formatted natively (CA$). The numbers derive from the last 30 days of the
 * property's own room revenue × its channel mix — no fabricated channel feed.
 */

const round0 = (n: number) => Math.round(n);

export interface MotelChannelStats {
  monthRoomRev: number;
  directRev: number;
  bookingComRev: number;
  expediaRev: number;
  otherRev: number;
  otaRev: number;
  bookingComFee: number;
  expediaFee: number;
  otherFee: number;
  /** Total OTA commission over the trailing 30 days. */
  commission: number;
  /** Blended OTA take rate (commission ÷ OTA revenue). */
  otaRate: number;
  otaShare: number;
  directShare: number;
  /** ~A peak season (Jun–Sep) commission estimate at the current monthly pace. */
  seasonCommission: number;
  /** Putting 10 points of OTA demand onto direct: monthly fee saved, and across the season. */
  shift10Monthly: number;
  shift10Season: number;
}

/** Trailing-30-day channel economics for an independent property, or null if it isn't one. */
export function motelChannelStats(b: Business): MotelChannelStats | null {
  const c = b.channelMix;
  const hs = b.hotelSeries;
  if (!c || !hs?.length) return null;

  const monthRoomRev = hs.slice(-30).reduce((a, d) => a + d.roomRevenue, 0);
  const directRev = monthRoomRev * c.direct;
  const bookingComRev = monthRoomRev * c.bookingCom;
  const expediaRev = monthRoomRev * c.expedia;
  const otherRev = monthRoomRev * c.other;
  const otaRev = bookingComRev + expediaRev + otherRev;

  const bookingComFee = bookingComRev * c.bookingComRate;
  const expediaFee = expediaRev * c.expediaRate;
  const otherFee = otherRev * c.otherRate;
  const commission = bookingComFee + expediaFee + otherFee;
  const otaRate = otaRev ? commission / otaRev : 0;

  // Peak season carries ~4 strong months; current pace is still ramping, so scale by ~3.6.
  const seasonCommission = commission * 3.6;
  const shift10Monthly = monthRoomRev * 0.1 * otaRate;
  const shift10Season = shift10Monthly * 3.6;

  return {
    monthRoomRev: round0(monthRoomRev),
    directRev: round0(directRev),
    bookingComRev: round0(bookingComRev),
    expediaRev: round0(expediaRev),
    otherRev: round0(otherRev),
    otaRev: round0(otaRev),
    bookingComFee: round0(bookingComFee),
    expediaFee: round0(expediaFee),
    otherFee: round0(otherFee),
    commission: round0(commission),
    otaRate,
    otaShare: c.bookingCom + c.expedia + c.other,
    directShare: c.direct,
    seasonCommission: round0(seasonCommission),
    shift10Monthly: round0(shift10Monthly),
    shift10Season: round0(shift10Season),
  };
}

/** Days from today to the next Summerfest Weekend (Pinecrest's Civic-Holiday long weekend,
 *  pinned to Aug 1). Pinecrest's biggest event — the cleanest pricing-power anchor in the year. */
export function daysToSummerfest(today = new Date()): { days: number; year: number; label: string } {
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  let year = t.getFullYear();
  let target = new Date(year, 7, 1); // Aug 1
  if ((target.getTime() - t.getTime()) / 86_400_000 < -4) {
    year += 1;
    target = new Date(year, 7, 1);
  }
  const days = Math.round((target.getTime() - t.getTime()) / 86_400_000);
  return { days, year, label: `Aug 1–4` };
}

/**
 * Build the independent-motel insight cards. Commission leakage leads (it's the most visceral
 * "that's my money" read for an owner), then the seasonal pricing-power window, then pacing.
 */
export function buildMotelInsights(b: Business): Insight[] {
  const m = hotelMetricsFor(b);
  const stats = motelChannelStats(b);
  if (!m || !stats) return [];
  const out: Insight[] = [];
  const name = b.shortName ?? b.name;
  const ca = (n: number) => money(n, "CAD");

  // ── 1) Commission leakage — the hero ─────────────────────────────────────────
  out.push({
    id: `motel-commission-${b.id}`,
    businessId: b.id,
    kind: "capital",
    title: `Booking.com & Expedia took ${ca(stats.commission)} last month`,
    detail: `${pct(stats.otaShare, 0)} of your room revenue came through the OTAs — ${ca(
      stats.bookingComFee,
    )} to Booking.com, ${ca(stats.expediaFee)} to Expedia. At your summer pace that's ~${ca(
      stats.seasonCommission,
    )} across Jun–Sep. A direct booking keeps the whole rate: moving just 1 in 10 OTA stays to your own site or phone is ~${ca(
      stats.shift10Monthly,
    )}/mo back — about ${ca(
      stats.shift10Season,
    )} over the season. You're already ${pct(stats.directShare, 0)} direct; a card at checkout and a repeat-guest rate pushes that up fast.`,
    priority: 96,
    metric: ca(stats.commission),
    metricUp: false,
    action: { label: "Draft a direct-booking nudge", done: "Direct-booking offer drafted ✓" },
  });

  // ── 2) Summerfest Weekend pricing power ────────────────────────────────────────
  const hw = daysToSummerfest();
  const liftPerNight = 15;
  const longWeekendLift = liftPerNight * (b.rooms ?? 22) * 3;
  out.push({
    id: `motel-summerfest-${b.id}`,
    businessId: b.id,
    kind: "opportunity",
    title: `Summerfest Weekend is ${hw.days} days out — the island sells out`,
    detail: `${hw.label}: Pinecrest's biggest weekend fills Pinecrest end to end. You're still showing summer-shoulder rates into it. Put a 2-night minimum on it and lift your Fri/Sat rate — even +${ca(
      liftPerNight,
    )}/night across your ${b.rooms ?? 22} rooms over the long weekend is ~${ca(
      longWeekendLift,
    )} you'd otherwise leave on the table. Set it in Little Hotelier now, before the OTAs price it for you.`,
    priority: 92,
    metric: `${hw.days}d`,
    metricUp: true,
    action: { label: "Set the Summerfest rate", done: "Summerfest rate plan drafted ✓" },
  });

  // ── 3) Season pacing — bank the summer ───────────────────────────────────────
  out.push({
    id: `motel-season-${b.id}`,
    businessId: b.id,
    kind: "win",
    title: `Summer's here — ${name} is pacing ${signedPct(m.revparTrend30, 0)} into peak`,
    detail: `${pct(m.todayOcc, 0)} full tonight at ${ca(
      m.todayAdr,
    )} — your strongest in months. Jun–Sep is the bulk of your year, so this stretch funds the quiet ones. Hold rate discipline on weekends (don't discount into a sellout) and bank it.`,
    priority: 80,
    metric: pct(m.todayOcc, 0),
    metricUp: true,
  });

  return out;
}
