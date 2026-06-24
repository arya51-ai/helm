import type { Business, Insight } from "../types";
import { hotelMetricsFor, type HotelMetrics } from "./hotelAnalytics";
import { buildMotelInsights } from "./motelInsights";
import { usd, usdCompact, pct, signedPct } from "./format";

export function buildHotelInsights(hotels: Business[]): Insight[] {
  const out: Insight[] = [];
  if (!hotels.length) return out;

  for (const h of hotels) {
    // Independent motels speak a different language — channels, OTA commission, seasonal pricing —
    // not the chain dialect (RGI, GOP, PIP) the rest of this engine writes. Route them out.
    if (h.independent) {
      out.push(...buildMotelInsights(h));
      continue;
    }
    const m = hotelMetricsFor(h);
    if (!m) continue;
    const name = h.shortName ?? h.name;

    // ── RGI below 100 = losing to comp set ──
    if (m.monthRgi < 95) {
      const gap = 100 - m.monthRgi;
      out.push({
        id: `hotel-rgi-low-${h.id}`,
        businessId: h.id,
        kind: "alert",
        title: `${name} is underperforming its comp set`,
        detail: `RevPAR Index is ${m.monthRgi.toFixed(1)} — ${gap.toFixed(1)} points below fair share. Your RevPAR of ${usd(m.monthRevpar)} trails the comp set at ${usd(m.todayCompSetRevpar)}. This means you're leaving rooms on the table or pricing below market. Review your rate strategy against the comp set and check if OTA placement has slipped.`,
        priority: 92,
        metric: `RGI ${m.monthRgi.toFixed(0)}`,
        metricUp: false,
        action: { label: "Revenue strategy", done: "Opening rate analysis ✓" },
      });
    } else if (m.monthRgi > 110) {
      out.push({
        id: `hotel-rgi-high-${h.id}`,
        businessId: h.id,
        kind: "win",
        title: `${name} is crushing its comp set`,
        detail: `RevPAR Index at ${m.monthRgi.toFixed(1)} — you're capturing ${(m.monthRgi - 100).toFixed(1)} points MORE than fair share. RevPAR of ${usd(m.monthRevpar)} vs comp set at ${usd(m.todayCompSetRevpar)}. This property is your rate-strategy benchmark — replicate what's working here across the portfolio.`,
        priority: 70,
        metric: `RGI ${m.monthRgi.toFixed(0)}`,
        metricUp: true,
      });
    }

    // ── Occupancy drop vs expected ──
    if (m.occVsExpected <= -0.10) {
      out.push({
        id: `hotel-occ-drop-${h.id}`,
        businessId: h.id,
        kind: "alert",
        title: `${name} occupancy fell ${pct(Math.abs(m.occVsExpected), 0)} below normal`,
        detail: `Today's occupancy is ${pct(m.todayOcc, 0)} — well below typical for this day of week. That's ${Math.round((h.rooms ?? 0) * Math.abs(m.occVsExpected))} rooms that should be filled. Check for event cancellations, group no-shows, or distribution channel issues. Consider a same-day rate push on OTAs.`,
        priority: 88,
        metric: signedPct(m.occVsExpected, 0),
        metricUp: false,
        action: { label: "Push rate to OTAs", done: "Rate push drafted ✓" },
      });
    }

    // ── Labor cost creep ──
    if (m.monthLaborPct > 0.36) {
      out.push({
        id: `hotel-labor-${h.id}`,
        businessId: h.id,
        kind: "alert",
        title: `${name} labor cost is running hot at ${pct(m.monthLaborPct, 0)}`,
        detail: `Industry target for ${h.category} is 28-33% of revenue. You're at ${pct(m.monthLaborPct, 0)}, costing an extra ~${usdCompact(m.monthTotalRevenue * (m.monthLaborPct - 0.32))} per month vs target. Review housekeeping schedules against actual occupancy — are you staffing for 100% on 75% nights?`,
        priority: 82,
        metric: pct(m.monthLaborPct, 0),
        metricUp: false,
        action: { label: "Staffing audit", done: "Opening labor analysis ✓" },
      });
    }

    // ── GOP margin opportunity ──
    if (m.monthGopMargin < 0.35) {
      out.push({
        id: `hotel-gop-low-${h.id}`,
        businessId: h.id,
        kind: "opportunity",
        title: `${name} GOP margin is below target at ${pct(m.monthGopMargin, 0)}`,
        detail: `Industry median for ${h.category} is ~38-42%. Your margin gap costs ~${usdCompact(m.monthTotalRevenue * (0.38 - m.monthGopMargin))}/month in lost profit. Top levers: labor scheduling (currently ${pct(m.monthLaborPct, 0)}), energy management, and F&B cost controls.`,
        priority: 76,
        metric: pct(m.monthGopMargin, 0),
        metricUp: false,
        action: { label: "Margin playbook", done: "Opening playbook ✓" },
      });
    }

    // ── ADR growth vs occupancy — rate vs volume balance ──
    if (m.adrTrend7 > 0.03 && m.occTrend7 < -0.03) {
      out.push({
        id: `hotel-rate-vol-${h.id}`,
        businessId: h.id,
        kind: "opportunity",
        title: `${name}: rates up but occupancy falling`,
        detail: `ADR grew ${signedPct(m.adrTrend7)} this week but occupancy dropped ${signedPct(m.occTrend7)}. You may be pricing above the demand curve. Run an A/B test: lower BAR by 5-8% on the weakest two weekdays and see if the volume lift more than offsets the rate drop.`,
        priority: 74,
        metric: `ADR ${signedPct(m.adrTrend7, 0)}`,
        metricUp: true,
        action: { label: "Draft rate test", done: "Rate test drafted ✓" },
      });
    }

    // ── Review score dipping ──
    if (h.reviewScore && h.reviewScore < 4.0) {
      out.push({
        id: `hotel-review-${h.id}`,
        businessId: h.id,
        kind: "alert",
        title: `${name} review score is ${h.reviewScore.toFixed(1)} — below the booking threshold`,
        detail: `Properties below 4.0 see 20-30% fewer direct bookings. With ${h.reviewCount?.toLocaleString()} reviews, moving the needle requires systematic fixes: respond to every negative review within 24 hours, identify the top 3 complaint categories, and task the GM with a 90-day improvement plan.`,
        priority: 84,
        metric: `${h.reviewScore.toFixed(1)}/5`,
        metricUp: false,
        action: { label: "Review action plan", done: "Action plan drafted ✓" },
      });
    }

    // ── RevPAR momentum (positive) ──
    if (m.revparTrend30 > 0.08) {
      out.push({
        id: `hotel-revpar-up-${h.id}`,
        businessId: h.id,
        kind: "win",
        title: `${name} RevPAR is surging — up ${signedPct(m.revparTrend30, 0)} this month`,
        detail: `Monthly RevPAR of ${usd(m.monthRevpar)} with ${pct(m.monthOcc, 0)} occupancy at ${usd(m.monthAdr)} ADR. This property is in a strong cycle — protect it by maintaining rate discipline (don't discount to chase volume when you're already growing).`,
        priority: 62,
        metric: signedPct(m.revparTrend30, 0),
        metricUp: true,
      });
    }
  }

  // ── PIP compliance across portfolio ──
  const pipOverdue = hotels.flatMap((h) =>
    (h.pipItems ?? [])
      .filter((p) => p.status === "overdue")
      .map((p) => ({ hotel: h.shortName ?? h.name, item: p })),
  );
  if (pipOverdue.length > 0) {
    const total = pipOverdue.reduce((a, p) => a + p.item.estimatedCost, 0);
    out.push({
      id: "hotel-pip-overdue",
      kind: "alert",
      title: `${pipOverdue.length} PIP item${pipOverdue.length > 1 ? "s" : ""} overdue across your portfolio`,
      detail: `${pipOverdue.map((p) => `${p.hotel}: "${p.item.title}" (${p.item.deadline})`).join("; ")}. Total estimated cost: ${usdCompact(total)}. Brand compliance deadlines are hard — missing them risks franchise penalties or termination notices.`,
      priority: 90,
      metric: `${pipOverdue.length} overdue`,
      metricUp: false,
      action: { label: "PIP tracker", done: "Opening PIP tracker ✓" },
    });
  }

  // ── Portfolio-wide: best vs worst RevPAR property (the 2-motel cross-property unlock) ──
  if (hotels.filter((h) => !h.independent).length >= 2) {
    const ranked = hotels
      .filter((h) => !h.independent)
      .map((h) => ({ h, m: hotelMetricsFor(h) }))
      .filter((x) => x.m != null)
      .sort((a, b) => b.m!.monthRevpar - a.m!.monthRevpar);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    if (best && worst && best.h.id !== worst.h.id) {
      const gap = best.m!.monthRevpar - worst.m!.monthRevpar;
      out.push({
        id: "hotel-portfolio-spread",
        kind: "capital",
        title: `${usd(gap)} RevPAR spread across your portfolio`,
        detail: `${best.h.shortName ?? best.h.name} leads at ${usd(best.m!.monthRevpar)} RevPAR while ${worst.h.shortName ?? worst.h.name} trails at ${usd(worst.m!.monthRevpar)}. The question: is ${worst.h.shortName ?? worst.h.name} underperforming fixably (rate strategy, distribution, GM execution) or structurally (market, location, product)? If fixable, closing half that gap adds ~${usdCompact(gap * 0.5 * (worst.h.rooms ?? 100) * 30)} in monthly room revenue.`,
        priority: 72,
        metric: usd(gap),
        metricUp: false,
        action: { label: "Compare properties", done: "Opening comparison ✓" },
      });
    }
  }

  // ── Weekend occupancy opportunity ──
  for (const h of hotels) {
    if (h.independent) continue; // motels run leisure-strong weekends — chain "weekend promo" doesn't apply
    const hs = h.hotelSeries;
    if (!hs || hs.length < 14) continue;
    const name = h.shortName ?? h.name;
    const recent = hs.slice(-28);
    const weekday = recent.filter((d) => {
      const dow = new Date(`${d.date}T00:00:00`).getDay();
      return dow >= 1 && dow <= 4;
    });
    const weekend = recent.filter((d) => {
      const dow = new Date(`${d.date}T00:00:00`).getDay();
      return dow === 0 || dow === 5 || dow === 6;
    });
    const wdOcc = weekday.length ? weekday.reduce((a, d) => a + d.occupancy, 0) / weekday.length : 0;
    const weOcc = weekend.length ? weekend.reduce((a, d) => a + d.occupancy, 0) / weekend.length : 0;
    if (wdOcc > 0 && weOcc < wdOcc * 0.75) {
      const lostRooms = Math.round((h.rooms ?? 0) * (wdOcc - weOcc) * 8);
      const m = hotelMetricsFor(h);
      const lostRev = lostRooms * (m?.monthAdr ?? 120);
      out.push({
        id: `hotel-weekend-${h.id}`,
        businessId: h.id,
        kind: "opportunity",
        title: `${name} weekends are ${pct(1 - weOcc / wdOcc, 0)} below weekday occupancy`,
        detail: `Weekday occupancy runs ${pct(wdOcc, 0)} but weekends drop to ${pct(weOcc, 0)}. That's ~${lostRooms} unsold room-nights per month, worth ~${usdCompact(lostRev)} in lost revenue. Target leisure travelers with weekend packages, local staycation promotions, or event partnerships.`,
        priority: 58,
        metric: pct(weOcc, 0),
        metricUp: false,
        action: { label: "Draft weekend promo", done: "Promo drafted ✓" },
      });
    }
  }

  return out.sort((a, b) => b.priority - a.priority);
}
