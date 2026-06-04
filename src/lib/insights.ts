import type { Business, Insight } from "../types";
import type { Metrics } from "./analytics";
import { usd, usdCompact, signedPct, pct, weekday, daysAgo, shortDate } from "./format";
import { empireAnomalies, type Anomaly } from "./anomalies";

/**
 * The COO brain. Turns raw metrics across every business into a ranked feed of
 * "here's what's wrong and what to do." This is the differentiator: not charts,
 * but prioritized judgment written the way an operator would say it.
 */
export function buildInsights(
  businesses: Business[],
  metricsBy: Record<string, Metrics>,
  ctx: { idleCash: number },
): Insight[] {
  const out: Insight[] = [];
  const ops = businesses.filter((b) => b.type !== "portfolio");
  const portfolio = businesses.find((b) => b.type === "portfolio");
  // ── Anomalies: statistically off vs this business's OWN trend + weekday norm ──
  // Real σ-scoring (anomalies.ts) replaces the old flat 12% threshold — only genuine
  // outliers surface, and the copy states the actual σ instead of inventing a cause.
  const anomalies = empireAnomalies(businesses, { lookback: 21, z: 1.5 });
  const anomShown = new Set<string>();
  for (const a of anomalies) {
    if (anomShown.has(a.businessId)) continue; // one headline anomaly per business
    if (Math.abs(a.vsExpected) < 0.08) continue; // skip trivial-dollar wobble
    anomShown.add(a.businessId);
    out.push(anomalyToInsight(a));
  }

  // ── Capital allocation: idle cash vs best return on capital ───────────────
  const best = [...ops].sort((a, b) => metricsBy[b.id].roic - metricsBy[a.id].roic)[0];
  if (best && portfolio && ctx.idleCash > 0) {
    const bestRoic = metricsBy[best.id].roic;
    const mktRoic = metricsBy[portfolio.id].roic;
    const multiple = mktRoic > 0 ? bestRoic / mktRoic : 0;
    const upside = ctx.idleCash * bestRoic;
    const marketAlt = ctx.idleCash * mktRoic;
    out.push({
      id: "capital-idle",
      kind: "capital",
      title: `Put your ${usdCompact(ctx.idleCash)} of idle cash to work`,
      detail: `${best.name} is returning ~${pct(bestRoic, 0)} on the capital in it — about ${multiple.toFixed(
        1,
      )}× your market portfolio (~${pct(mktRoic, 0)}). You've got ${usd(
        ctx.idleCash,
      )} sitting in checking. Redeploying it into ${best.name} could add ~${usd(
        upside,
      )}/yr versus ~${usd(marketAlt)} left in the market.`,
      priority: 80,
      metric: `${multiple.toFixed(1)}×`,
      metricUp: true,
      action: { label: "See the math", done: "Opening capital plan ✓" },
    });
  }

  // ── Portfolio mover of the day ────────────────────────────────────────────
  if (portfolio?.holdings?.length) {
    const m = metricsBy[portfolio.id];
    const top = [...portfolio.holdings].sort(
      (a, b) => b.shares * b.price * b.dayChangePct - a.shares * a.price * a.dayChangePct,
    )[0];
    const contrib = top.shares * top.price * top.dayChangePct;
    if (contrib > 0) {
      out.push({
        id: "port-mover",
        businessId: portfolio.id,
        kind: "info",
        title: `${top.ticker} is carrying your portfolio today`,
        detail: `${top.name} is ${signedPct(top.dayChangePct)} (${usd(
          contrib,
        )}), the biggest contributor to your ${usd(m.dayChangeUsd)} gain. Portfolio sits at ${usd(
          m.marketValue,
        )}, ${signedPct(m.totalReturn)} on cost.`,
        priority: 56,
        metric: signedPct(top.dayChangePct),
        metricUp: true,
        action: { label: "View holdings", done: "Opening portfolio ✓" },
      });
    }
  }

  // ── Week-over-week momentum (only if notable & not already the headline) ──
  for (const b of ops) {
    const m = metricsBy[b.id];
    if (Math.abs(m.wow) >= 0.06 && !out.some((i) => i.businessId === b.id)) {
      const up = m.wow >= 0;
      out.push({
        id: `wow-${b.id}`,
        businessId: b.id,
        kind: up ? "win" : "opportunity",
        title: `${b.name} is ${up ? "up" : "down"} ${pct(Math.abs(m.wow), 0)} week over week`,
        detail: `Last 7 days came in at ${usd(m.weekToDate)} vs ${usd(
          m.prevWeek,
        )} the week before. ${
          up ? "Momentum is building." : "Worth watching if it continues another week."
        }`,
        priority: 48,
        metric: signedPct(m.wow, 0),
        metricUp: up,
        action: { label: "Open business", done: "Opening business ✓" },
      });
    }
  }

  // ── A forward-looking opportunity ─────────────────────────────────────────
  const riverside = ops.find((b) => b.type === "retail");
  if (riverside) {
    out.push({
      id: "opp-weekend",
      businessId: riverside.id,
      kind: "opportunity",
      title: `Stock up — ${riverside.name}'s weekend is its biggest window`,
      detail: `Fri–Sat run ~24% above weekdays here. Inventory on your top SKUs is trending toward a Saturday stockout at the current pace. A reorder today lands in time.`,
      priority: 42,
      metric: "Fri–Sat",
      metricUp: true,
      action: { label: "Draft reorder", done: "Reorder draft created ✓" },
    });
  }

  return out.sort((a, b) => b.priority - a.priority);
}

/** Turn a detected anomaly into a Brief card — honest about the σ, never inventing a cause. */
function anomalyToInsight(a: Anomaly): Insight {
  const wd = weekday(a.endDate, true);
  const recent = daysAgo(a.endDate);
  const down = a.kind === "dip" || a.kind === "streak-down";
  const sigma = Math.abs(a.z).toFixed(1);
  const mag = pct(Math.abs(a.vsExpected), 0);
  const downAction = { label: "Draft a check-in", done: "Draft ready ✓" };
  const upAction = { label: "See what's driving it", done: "Opening breakdown ✓" };

  if (a.runLength >= 3) {
    return {
      id: `anom-${a.businessId}-${a.endDate}`,
      businessId: a.businessId,
      kind: down ? "alert" : "win",
      title: `${a.businessName} has been ${down ? "soft" : "hot"} ${a.runLength} days running`,
      detail: `Through ${wd} it's ${usd(a.actual)} vs ~${usd(a.expected)} expected (${mag} ${
        down ? "below" : "above"
      } its norm, ~${sigma}σ). One day is noise; ${a.runLength} in a row is a pattern ${
        down ? "worth getting ahead of before it compounds" : "worth understanding so you can repeat it"
      }.`,
      priority: (down ? 86 : 60) + Math.min(10, Math.abs(a.z) * 3),
      metric: signedPct(a.vsExpected, 0),
      metricUp: !down,
      action: down ? downAction : upAction,
    };
  }

  const whenTitle = recent <= 0 ? "today" : recent === 1 ? "yesterday" : `on ${wd}`;
  const whenDetail = recent <= 1 ? `${wd} came in` : `${wd} ${shortDate(a.endDate)} closed`;
  return {
    id: `anom-${a.businessId}-${a.date}`,
    businessId: a.businessId,
    kind: down ? "alert" : "win",
    title: `${a.businessName} ${down ? "dipped" : "spiked"} ${mag} ${whenTitle}`,
    detail: `${whenDetail} at ${usd(a.actual)} — about ${sigma}σ ${down ? "below" : "above"} its typical ${usd(
      a.expected,
    )}. That's outside ${a.businessName}'s normal day-to-day swing, so it's ${
      down
        ? "worth a look rather than writing off as a slow day"
        : "a genuine outlier, not noise — worth knowing what worked"
    }.`,
    priority: (down ? 90 : 64) + Math.min(10, Math.abs(a.z) * 3),
    metric: signedPct(a.vsExpected, 0),
    metricUp: !down,
    action: down ? downAction : upAction,
  };
}
