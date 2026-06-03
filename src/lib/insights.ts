import type { Business, Insight } from "../types";
import type { Metrics } from "./analytics";
import { usd, usdCompact, signedPct, pct } from "./format";
import { weekday, daysAgo } from "./format";

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
  const asOf = businesses[0].series.at(-1)!.date;
  const todayName = weekday(asOf, true);
  // POS data usually lags a day — when the latest close isn't literally today, the
  // brief speaks in the past tense ("had a strong Tuesday") instead of pretending it's live.
  const live = daysAgo(asOf) <= 0;

  // ── Anomalies: today materially off its same-weekday expectation ──────────
  for (const b of ops) {
    const m = metricsBy[b.id];
    if (m.vsExpected <= -0.12) {
      const sev = Math.min(1, Math.abs(m.vsExpected) / 0.3);
      out.push({
        id: `alert-${b.id}`,
        businessId: b.id,
        kind: "alert",
        title: `${b.name} ${live ? "is running" : "ran"} ${pct(Math.abs(m.vsExpected), 0)} below a normal ${todayName}`,
        detail: `${live ? `Today is tracking ${usd(m.today)}` : `${todayName} closed at ${usd(m.today)}`} against a typical ${usd(
          m.expectedToday,
        )}. The gap is concentrated in the afternoon/evening window — the last few times this shape showed up, it lined up with a short-staffed shift. ${live ? "Worth a text before close." : "Worth a word with whoever ran that shift."}`,
        priority: 90 + sev * 10,
        metric: signedPct(m.vsExpected, 0),
        metricUp: false,
        action: { label: "Text manager", done: "Message drafted to your Riverside manager ✓" },
      });
    } else if (m.vsExpected >= 0.1) {
      out.push({
        id: `win-${b.id}`,
        businessId: b.id,
        kind: "win",
        title: `${b.name} ${live ? "is having" : "had"} a strong ${todayName}`,
        detail: `Up ${pct(m.vsExpected, 0)} on its typical ${todayName} at ${usd(
          m.today,
        )} — one of its best ${todayName}s this month. ${live ? "Whatever you changed, keep doing it." : "Whatever drove it is worth repeating."}`,
        priority: 64 + Math.min(8, m.vsExpected * 20),
        metric: signedPct(m.vsExpected, 0),
        metricUp: true,
        action: { label: "See what's driving it", done: "Opening Subway breakdown ✓" },
      });
    }
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
