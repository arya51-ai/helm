import type { Business, Insight } from "../types";
import type { Metrics, EmpireSummary } from "./analytics";
import { usd, usdCompact, pct, signedPct, signedUsd, weekday, daysAgo } from "./format";

/**
 * "Ask Helm" — a natural-language layer over the owner's data. Intentionally
 * rule/intent-based (not an LLM call): it's instant, works offline, and never
 * fabricates — every answer is computed from real metrics. The intent router is
 * structured so a hosted model can be swapped in later behind the same interface.
 */
export interface AskContext {
  businesses: Business[];
  metricsBy: Record<string, Metrics>;
  empire: EmpireSummary;
  insights: Insight[];
  idleCash: number;
}

export interface AskAnswer {
  text: string;
  businessId?: string;
  metric?: string;
  metricUp?: boolean;
}

export const SUGGESTED_QUESTIONS = [
  "What needs me today?",
  "Where should I put my cash?",
  "How's Riverside this week?",
  "What's my net worth?",
  "Which business earns most per dollar?",
  "How's my portfolio?",
];

function findBusiness(q: string, businesses: Business[]): Business | undefined {
  for (const b of businesses) {
    const toks = [b.shortName, b.name].filter(Boolean).flatMap((s) => s!.toLowerCase().split(/\s+/));
    if (toks.some((t) => t.length >= 3 && q.includes(t))) return b;
  }
  if (/\b(smoke|vape|tobacco)\b/.test(q)) return businesses.find((b) => /riverside/i.test(b.name));
  if (/\b(sandwich|franchise)\b/.test(q)) return businesses.find((b) => /subway/i.test(b.name));
  if (/\b(stock|stocks|brokerage|portfolio|investment|investments|market)\b/.test(q))
    return businesses.find((b) => b.type === "portfolio");
  return undefined;
}

export function answerQuestion(raw: string, ctx: AskContext): AskAnswer {
  const q = raw.toLowerCase().trim();
  const ops = ctx.businesses.filter((b) => b.type !== "portfolio");
  const portfolio = ctx.businesses.find((b) => b.type === "portfolio");
  const biz = findBusiness(q, ctx.businesses);
  const lag = ctx.empire.asOf ? daysAgo(ctx.empire.asOf) : 0;
  const dayWord = lag <= 0 ? "today" : lag === 1 ? "yesterday" : `on ${weekday(ctx.empire.asOf)}`;
  const roicOf = (b: Business) => ctx.metricsBy[b.id]?.roic ?? 0;
  const marketRoic = portfolio ? ctx.metricsBy[portfolio.id].roic : 0.09;

  // 1) What needs me / priorities / problems
  if (/\b(need|needs|attention|priorit|problem|wrong|focus|urgent|look at|do today|today.*do)\b/.test(q) && !biz) {
    const ranked = [...ctx.insights].sort((a, b) => b.priority - a.priority);
    const top = ranked.find((i) => i.kind === "alert") ?? ranked[0];
    if (top)
      return { text: `${top.title}. ${top.detail}`, businessId: top.businessId, metric: top.metric, metricUp: top.metricUp };
    return { text: "Nothing urgent — everything's tracking close to normal today." };
  }

  // 2) Where to put cash / capital allocation
  if (/\b(where.*(put|invest)|put.*(cash|money)|allocat|deploy|idle cash|redeploy|best return|highest return)\b/.test(q)) {
    const ranked = [...ops].sort((a, b) => roicOf(b) - roicOf(a));
    const best = ranked[0];
    if (best) {
      const r = roicOf(best);
      const upside = ctx.idleCash * (r - marketRoic);
      return {
        text: `${best.name} returns ~${pct(r, 0)} on the capital in it — vs ~${pct(
          marketRoic,
          0,
        )} in the market. Your ${usd(ctx.idleCash)} of idle cash would earn about ${signedUsd(
          upside,
        )}/yr more there than left in the market.`,
        businessId: best.id,
        metric: `${(r / Math.max(marketRoic, 0.0001)).toFixed(1)}×`,
        metricUp: true,
      };
    }
  }

  // 3) Net worth
  if (/\b(net worth|networth|how much.*(have|worth)|total.*worth)\b/.test(q)) {
    const e = ctx.empire;
    return {
      text: `Your estimated net worth is ${usd(e.netWorth)} — ${usdCompact(e.investments)} in investments, ${usdCompact(
        e.businessEquity,
      )} in business equity, and ${usdCompact(e.cash)} cash. Markets moved it ${signedUsd(e.netWorthDayChange)} ${dayWord}.`,
      metric: usdCompact(e.netWorth),
      metricUp: e.netWorthDayChange >= 0,
    };
  }

  // 4) Which business is best / most per dollar
  if (/\b(most profit|best business|which business|per dollar|most per|works hardest|earns? (the )?most|biggest)\b/.test(q) && !biz) {
    const ranked = [...ops].sort((a, b) => roicOf(b) - roicOf(a));
    const lines = ranked
      .map((b) => `${b.shortName ?? b.name} ${pct(roicOf(b), 0)} (${usdCompact(ctx.metricsBy[b.id].monthlyProfit)}/mo)`)
      .join(", ");
    const best = ranked[0];
    return {
      text: `By return on capital: ${lines}. ${best?.name} works your money hardest right now.`,
      businessId: best?.id,
      metric: best ? pct(roicOf(best), 0) : undefined,
      metricUp: true,
    };
  }

  // 5) Cash on hand / runway
  if (/\b(cash on hand|how much cash|runway|cash position|liquid)\b/.test(q)) {
    return {
      text: `You have ${usd(ctx.idleCash)} in idle cash. Combined with ~${usdCompact(
        ctx.empire.last30,
      )}/mo of sales coming in, you're well covered — but that idle cash is earning ~0%. Ask me where to put it.`,
      metric: usdCompact(ctx.idleCash),
    };
  }

  // 6) Portfolio status
  if (portfolio && (biz?.id === portfolio.id || /\b(portfolio|stock|stocks|market|brokerage)\b/.test(q))) {
    const m = ctx.metricsBy[portfolio.id];
    const top = (portfolio.holdings ?? [])
      .slice()
      .sort((a, b) => b.shares * b.price * b.dayChangePct - a.shares * a.price * a.dayChangePct)[0];
    return {
      text: `Your portfolio is worth ${usd(m.marketValue)}, ${signedPct(m.totalReturn)} on cost (${signedUsd(
        m.totalGain,
      )}). It moved ${signedUsd(m.dayChangeUsd)} ${dayWord}${top ? `, led by ${top.ticker} ${signedPct(top.dayChangePct)}` : ""}.`,
      businessId: portfolio.id,
      metric: usdCompact(m.marketValue),
      metricUp: m.totalReturn >= 0,
    };
  }

  // 7) A specific operating business
  if (biz && biz.type !== "portfolio") {
    const m = ctx.metricsBy[biz.id];
    if (/\bweek\b/.test(q))
      return {
        text: `${biz.name} did ${usd(m.weekToDate)} this week, ${signedPct(m.wow)} vs last week. Avg ticket ${usd(
          m.avgTicket,
          true,
        )}.`,
        businessId: biz.id,
        metric: signedPct(m.wow),
        metricUp: m.wow >= 0,
      };
    if (/\bmonth\b/.test(q))
      return {
        text: `${biz.name} did ${usd(m.last30)} over the last 30 days — about ${usd(m.monthlyProfit)}/mo profit at ${pct(
          biz.netMargin ?? 0,
          0,
        )} margin.`,
        businessId: biz.id,
        metric: usdCompact(m.last30),
      };
    if (/\b(profit|margin|roic|return|capital)\b/.test(q))
      return {
        text: `${biz.name} runs ~${usd(m.monthlyProfit)}/mo profit (${pct(
          biz.netMargin ?? 0,
          0,
        )} margin) and returns ${pct(m.roic, 0)} on the ${usdCompact(biz.capitalDeployed)} deployed in it.`,
        businessId: biz.id,
        metric: pct(m.roic, 0),
        metricUp: true,
      };
    if (/\b(transaction|customers?|tickets?|traffic|count|busy)\b/.test(q))
      return {
        text: `${biz.name} had ${m.transactionsToday} transactions ${dayWord} at a ${usd(m.avgTicket, true)} average ticket.`,
        businessId: biz.id,
        metric: String(m.transactionsToday),
      };
    const take =
      m.vsExpected <= -0.1
        ? `that's ${pct(Math.abs(m.vsExpected), 0)} below a normal day — worth a look`
        : m.vsExpected >= 0.1
          ? `that's ${pct(m.vsExpected, 0)} above a normal day — strong`
          : "right around normal";
    return {
      text: `${biz.name} did ${usd(m.today)} ${dayWord} — ${take}. This week: ${usd(m.weekToDate)} (${signedPct(
        m.wow,
      )} WoW).`,
      businessId: biz.id,
      metric: signedPct(m.vsExpected),
      metricUp: m.vsExpected >= 0,
    };
  }

  // 8) Totals (sales/revenue)
  if (/\b(sales|revenue|made|today|how much|combined|total|empire)\b/.test(q)) {
    const e = ctx.empire;
    if (/\bweek\b/.test(q)) return { text: `Across all businesses you did ${usd(e.weekToDate)} this week.`, metric: usdCompact(e.weekToDate) };
    if (/\bmonth\b/.test(q)) return { text: `Across all businesses you did ${usd(e.last30)} over the last 30 days.`, metric: usdCompact(e.last30) };
    return {
      text: `Across all businesses you did ${usd(e.revenueToday)} ${dayWord}, ${signedPct(e.revenueDayChange)} vs the prior day.`,
      metric: usd(e.revenueToday),
      metricUp: e.revenueDayChange >= 0,
    };
  }

  // Fallback
  return {
    text: `I can tell you about sales, profit, net worth, your portfolio, or where to put cash. Try "How's Riverside this week?" or "Where should I put my cash?"`,
  };
}
