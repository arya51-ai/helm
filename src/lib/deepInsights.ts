import type { Business, Insight } from "../types";
import type { Metrics } from "./analytics";
import { usd, pct, signedPct } from "./format";
import { DOW, weekdayProfile, momentum, ticketTrend, seasonality, volatilityCV } from "./patterns";

/**
 * The "ultimate" COO read — the judgment layer baked in as logic so it runs with no API key.
 * Each card is computed from the live series (weekday shape, year-over-year, seasonality, ticket
 * drift, capital efficiency), so it stays accurate as data rolls forward. Generic across
 * businesses: thresholds decide what's worth saying, not hardcoded store names.
 */
export function deepInsights(businesses: Business[], metricsBy: Record<string, Metrics>): Insight[] {
  const out: Insight[] = [];
  const ops = businesses.filter((b) => b.type !== "portfolio");

  for (const b of ops) {
    const m = metricsBy[b.id];
    if (!m || b.series.length < 30) continue;
    const name = b.shortName ?? b.name;
    const wk = weekdayProfile(b.series);
    const mom = momentum(b.series);

    // ── Year-over-year trajectory — the signal daily totals hide ──────────────
    if (mom.yoy != null && mom.lastYear != null && mom.prevYear != null && mom.yoy <= -0.05) {
      const recovering = mom.m90 >= 0.05;
      out.push({
        id: `deep-yoy-${b.id}`,
        businessId: b.id,
        kind: recovering ? "info" : "alert",
        title: recovering
          ? `${name} is recovering, but still down year over year`
          : `${name} is down ${pct(Math.abs(mom.yoy), 0)} year over year`,
        detail: recovering
          ? `Trailing twelve months ran ${usd(mom.lastYear)} — ${pct(Math.abs(mom.yoy), 0)} below the prior year's ${usd(mom.prevYear)}. But the last 90 days are up ${pct(mom.m90, 0)} on the quarter before, so the slide has reversed. The question is whether the rebound holds; ${DOW[wk.best]}s (+${pct(wk.bestGap, 0)}) are carrying it.`
          : `Trailing twelve months ran ${usd(mom.lastYear)} versus ${usd(mom.prevYear)} the year before — a ${pct(Math.abs(mom.yoy), 0)} decline the daily numbers hide. Worth a hard look at what changed: traffic, pricing, or new competition.`,
        priority: recovering ? 78 : 88,
        metric: signedPct(mom.yoy, 0),
        metricUp: false,
        action: { label: recovering ? "See the trend" : "Draft a turnaround review", done: "Opening trend ✓" },
      });
    }

    // ── Structural soft day (e.g. a lunch-driven store's dead weekend) ────────
    if (wk.worstGap <= -0.15) {
      const lunchy = b.type === "restaurant";
      const weekendNote =
        wk.weekendGap <= -0.12 ? ` Weekends overall run ${pct(wk.weekendGap, 0)} below weekdays.` : "";
      out.push({
        id: `deep-soft-${b.id}`,
        businessId: b.id,
        kind: "opportunity",
        title: `${name}'s ${DOW[wk.worst]}s are a structural soft spot`,
        detail: `${DOW[wk.worst]}s average ${usd(wk.byDow[wk.worst])} — ${pct(wk.worstGap, 0)} versus a normal day.${weekendNote} ${
          lunchy ? "That shape says lunch-driven: the off-day crowd just isn't there." : "Slow days carry the same fixed cost as busy ones."
        } Either trim ${DOW[wk.worst]} labor to protect margin, or test an offer to fill the room. ${DOW[wk.best]} (+${pct(wk.bestGap, 0)}) is the engine — protect it.`,
        priority: 64,
        metric: pct(wk.worstGap, 0),
        metricUp: false,
        action: { label: "Draft a plan", done: "Draft ready ✓" },
      });
    }

    // ── Peak-day concentration — protect the best window ─────────────────────
    if (wk.bestGap >= 0.15) {
      const retail = b.type === "retail";
      out.push({
        id: `deep-peak-${b.id}`,
        businessId: b.id,
        kind: "opportunity",
        title: `${name}'s ${DOW[wk.best]} is its biggest window`,
        detail: `${DOW[wk.best]}s run ${usd(wk.byDow[wk.best])} (+${pct(wk.bestGap, 0)}), the clear weekly peak. ${
          retail
            ? `A ${DOW[wk.best]} stockout on your top SKUs is the single biggest revenue leak — reorder mid-week so the shelves are full for it.`
            : `Make sure ${DOW[wk.best]} is fully staffed — under-covering your best day is the most expensive miss you can make.`
        }`,
        priority: 50,
        metric: `+${pct(wk.bestGap, 0)}`,
        metricUp: true,
        action: retail
          ? { label: "Draft reorder", done: "Reorder draft created ✓" }
          : { label: "Check the schedule", done: "Opening schedule ✓" },
      });
    }

    // ── Seasonality — get ahead of the curve ─────────────────────────────────
    const seas = seasonality(b.series);
    if (seas) {
      out.push({
        id: `deep-season-${b.id}`,
        businessId: b.id,
        kind: "info",
        title: `Plan for ${name}'s seasonal swing`,
        detail: `Across the full history, ${seas.strongest.name} is the peak (~${usd(seas.strongest.avg)}/day) and ${seas.weakest.name} the trough (~${usd(seas.weakest.avg)}/day, ${pct(seas.spread, 0)}). Flex staffing and inventory to that curve, and bank cash ahead of the ${seas.weakest.name} dip instead of being surprised by it.`,
        priority: 38,
        metric: `${seas.strongest.name.slice(0, 3)} ↑`,
        metricUp: true,
      });
    }
  }

  // ── Capital efficiency standout (steadiest, hardest-working dollar) ─────────
  if (ops.length) {
    const ranked = [...ops].sort((a, b) => metricsBy[b.id].roic - metricsBy[a.id].roic);
    const star = ranked[0];
    const sm = metricsBy[star.id];
    if (sm && sm.roic > 0) {
      const starCV = volatilityCV(star.series);
      const other = ops.find((b) => b.id !== star.id);
      const otherCV = other ? volatilityCV(other.series) : starCV;
      const steadier = other != null && otherCV > 0 && starCV < otherCV * 0.85;
      const starMom = momentum(star.series);
      const plateau = Math.abs(starMom.m30) < 0.03;
      out.push({
        id: `deep-capital-${star.id}`,
        businessId: star.id,
        kind: "win",
        title: `${star.shortName ?? star.name} is your hardest-working capital`,
        detail: `It returns ~${pct(sm.roic, 0)} on the capital tied up in it${
          steadier ? `, with roughly ${Math.round((1 - starCV / otherCV) * 100)}% less day-to-day swing than your other shop` : ""
        } — your most efficient asset by a clear margin. ${
          plateau
            ? `The watch item: the last 30 days are essentially flat (${signedPct(starMom.m30, 0)}), so it may be topping out — worth a look at foot traffic and basket size before it drifts.`
            : `Momentum is ${signedPct(starMom.m30, 0)} on the month.`
        }`,
        priority: 58,
        metric: pct(sm.roic, 0),
        metricUp: true,
        action: { label: "Open business", done: "Opening business ✓" },
      });
    }
  }

  // ── Cross-business ticket erosion ──────────────────────────────────────────
  const eroding = ops
    .map((b) => ({ b, t: ticketTrend(b.series) }))
    .filter((x) => x.t.prev > 0 && x.t.change <= -0.03);
  if (eroding.length >= 2) {
    const names = eroding.map((x) => x.b.shortName ?? x.b.name);
    const nows = eroding.map((x) => x.t.now).sort((a, b) => a - b);
    const lo = nows[0];
    const hi = nows[nows.length - 1];
    const level = hi / lo - 1 > 0.15 ? `in the ${usd(lo)}–${usd(hi)} range` : `each near ${usd(lo)}`;
    out.push({
      id: "deep-ticket",
      kind: "info",
      title: "Average ticket is slipping across the board",
      detail: `${names.join(" and ")} are both down on average ticket over the last quarter (${eroding
        .map((x) => signedPct(x.t.change, 0))
        .join(", ")}), ${level}. Flat-to-down ticket while costs rise is a real decline in disguise — a small combo, price, or upsell test could recover it without needing a single extra customer.`,
      priority: 46,
      metric: signedPct(Math.min(...eroding.map((x) => x.t.change)), 0),
      metricUp: false,
      action: { label: "Draft a pricing test", done: "Draft ready ✓" },
    });
  }

  // ── Revenue concentration — the single-point-of-failure an investor watches ──
  if (ops.length >= 2) {
    const rev = ops.map((b) => ({ b, r: metricsBy[b.id]?.last30 ?? 0 }));
    const total = rev.reduce((s, x) => s + x.r, 0) || 1;
    const top = [...rev].sort((a, b) => b.r - a.r)[0];
    const share = top.r / total;
    if (share >= 0.55) {
      const name = top.b.shortName ?? top.b.name;
      out.push({
        id: "deep-concentration",
        businessId: top.b.id,
        kind: "info",
        title: `${name} is ${pct(share, 0)} of your revenue`,
        detail: `${pct(share, 0)} of the last 30 days of sales — and your highest return on capital — runs through ${name}. That concentration cuts both ways: it's your strongest asset, but a single bad event there (a lease renewal, a license issue, a new competitor) lands on the whole empire at once. Worth keeping the other shop healthy and your cash diversified rather than all-in behind it.`,
        priority: 44,
        metric: pct(share, 0),
        metricUp: false,
      });
    }
  }

  return out;
}
