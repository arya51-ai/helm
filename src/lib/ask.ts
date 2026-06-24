import type { Business, Insight } from "../types";
import type { Metrics, EmpireSummary } from "./analytics";
import { hotelMetricsFor } from "./hotelAnalytics";
import { motelChannelStats, daysToSummerfest } from "./motelInsights";
import { usd, usdCompact, money, pct, signedPct, signedUsd, weekday, daysAgo } from "./format";

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

/**
 * Context-aware starter questions. When the empire holds hotels, surface the
 * hospitality beats ("Why is <property> trailing?", "Where is RevPAR headed?")
 * instead of the shop-centric defaults. Falls back to SUGGESTED_QUESTIONS.
 */
export function suggestedQuestionsFor(ctx: AskContext): string[] {
  const hotels = ctx.businesses.filter((b) => b.type === "hotel" && b.hotelSeries?.length);
  if (!hotels.length) return SUGGESTED_QUESTIONS;

  // An independent motel owner asks owner-operator questions — fees, pricing, the season — not
  // RevPAR-Index questions.
  if (hotels.some((h) => h.independent)) {
    return [
      "How much am I paying Booking.com?",
      "Should I raise rates for the long weekend?",
      "How's my summer pacing?",
      "How full am I this week?",
      "What needs me today?",
      "What's my net worth?",
    ];
  }

  // Pick the property with the lowest RGI to headline the "why is X trailing?" prompt.
  const ranked = hotels
    .map((h) => ({ h, m: hotelMetricsFor(h) }))
    .filter((x) => x.m != null)
    .sort((a, b) => (a.m!.monthRgi ?? 0) - (b.m!.monthRgi ?? 0));
  const trailing = ranked[0]?.h;
  const trailingName = trailing?.shortName ?? trailing?.name ?? "my weakest property";

  return [
    "Which property needs me today?",
    `Why is ${trailingName} trailing?`,
    "Where is RevPAR headed?",
    "What needs me today?",
    "Where should I put my cash?",
    "What's my net worth?",
  ];
}

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

/** Weekday (Mon–Thu) vs weekend (Fri–Sun) occupancy over the last ~28 days — same split hotelInsights uses. */
function midweekSplit(b: Business): { weekday: number; weekend: number } | null {
  const hs = b.hotelSeries;
  if (!hs || hs.length < 14) return null;
  const recent = hs.slice(-28);
  const wd = recent.filter((d) => {
    const dow = new Date(`${d.date}T00:00:00`).getDay();
    return dow >= 1 && dow <= 4;
  });
  const we = recent.filter((d) => {
    const dow = new Date(`${d.date}T00:00:00`).getDay();
    return dow === 0 || dow === 5 || dow === 6;
  });
  const wdOcc = wd.length ? wd.reduce((a, d) => a + d.occupancy, 0) / wd.length : 0;
  const weOcc = we.length ? we.reduce((a, d) => a + d.occupancy, 0) / we.length : 0;
  if (!wdOcc || !weOcc) return null;
  return { weekday: wdOcc, weekend: weOcc };
}

/**
 * Independent-motel answer — the owner-operator's language (occupancy, nightly rate in CAD,
 * booking channels, OTA commission, the season). Mirrors motelInsights.ts so the offline rule
 * engine reads the same story the live model and the cards do. Money is CAD.
 */
function motelAnswer(biz: Business, q: string): AskAnswer {
  const m = hotelMetricsFor(biz);
  const s = motelChannelStats(biz);
  const name = biz.shortName ?? biz.name;
  const ca = (n: number) => money(n, "CAD");
  if (!m || !s) return { text: `${name} doesn't have its channel mix loaded yet.`, businessId: biz.id };

  // Fees / commission / OTAs — the hot button
  if (/\b(booking\.?com|expedia|ota|otas|commission|fee|fees|cut|channel|where.*money|leak)\b/.test(q)) {
    return {
      text: `${name}: the OTAs took ${ca(s.commission)} last month — ${ca(s.bookingComFee)} to Booking.com, ${ca(
        s.expediaFee,
      )} to Expedia (${pct(s.otaShare, 0)} of your rooms). At summer pace that's ~${ca(s.seasonCommission)} across Jun–Sep. You're ${pct(
        s.directShare,
        0,
      )} direct already — move 1 in 10 OTA stays to your own site or phone and you keep ~${ca(s.shift10Monthly)}/mo.`,
      businessId: biz.id,
      metric: ca(s.commission),
      metricUp: false,
    };
  }
  // Pricing / Summerfest / long weekend / raise rates
  if (/\b(rate|rates|price|pricing|raise|charg|summerfest|long weekend|weekend|holiday|peak|minimum)\b/.test(q)) {
    const hw = daysToSummerfest();
    const lift = 15 * (biz.rooms ?? 22) * 3;
    return {
      text: `Summerfest Weekend (Aug 1–4) is ${hw.days} days out and the island sells out — pure pricing power. Hold a 2-night minimum and lift Fri/Sat; even +${ca(
        15,
      )}/night across ${biz.rooms ?? 22} rooms is ~${ca(lift)} over the long weekend. You're at ${ca(m.todayAdr)} and ${pct(
        m.todayOcc,
        0,
      )} full tonight. Set it in ${biz.pms ?? "your channel manager"} before the OTAs anchor it low.`,
      businessId: biz.id,
      metric: `${hw.days}d to Summerfest`,
      metricUp: true,
    };
  }
  // Season / summer / pacing / cash
  if (/\b(season|summer|pacing|pace|year|winter|cash|slow|trend|headed|outlook)\b/.test(q)) {
    return {
      text: `${name}: you're entering peak — pacing ${signedPct(m.revparTrend30, 0)} over 30 days, ${pct(
        m.todayOcc,
        0,
      )} full tonight at ${ca(m.todayAdr)}. Jun–Sep is the bulk of your year, so bank it: hold weekend rate discipline and don't discount into a sellout.`,
      businessId: biz.id,
      metric: signedPct(m.revparTrend30, 0),
      metricUp: m.revparTrend30 >= 0,
    };
  }
  // Occupancy / how full
  if (/\b(occupanc|occ\b|full|empty|vacan|rooms?|busy|sold)\b/.test(q)) {
    return {
      text: `${name}: ${pct(m.monthOcc, 0)} full over 30 days (${pct(m.todayOcc, 0)} tonight) at ${ca(
        m.monthAdr,
      )} avg rate. Weekends carry it — midweek is where a small deal earns its keep.`,
      businessId: biz.id,
      metric: pct(m.todayOcc, 0),
      metricUp: m.occTrend7 >= 0,
    };
  }
  // Default — lead with the commission story (his hot button)
  return {
    text: `${name}: ${pct(m.todayOcc, 0)} full tonight at ${ca(m.todayAdr)}. The thing to watch is OTA commission — ${ca(
      s.commission,
    )} to Booking.com & Expedia last month (~${ca(s.seasonCommission)} for the season). Shift 1 in 10 OTA stays to direct and that's ~${ca(
      s.shift10Monthly,
    )}/mo back in your pocket.`,
    businessId: biz.id,
    metric: ca(s.commission),
    metricUp: false,
  };
}

/**
 * Hotel-fluent answer for one property. Mirrors the rate-vs-volume / RGI-vs-comp
 * phrasing in hotelInsights.ts so Ask Helm reads the same language as the cards.
 */
function hotelAnswer(biz: Business, q: string): AskAnswer {
  // Independent motels read in owner-operator language, not chain RGI/GOP.
  if (biz.independent) return motelAnswer(biz, q);
  const m = hotelMetricsFor(biz);
  const name = biz.shortName ?? biz.name;
  if (!m) {
    return { text: `${name} doesn't have hospitality data loaded yet — add a daily RevPAR/occupancy feed and I'll read it.`, businessId: biz.id };
  }

  // RevPAR direction / "where is RevPAR headed"
  if (/\b(revpar|rev par|headed|heading|trend|trending|momentum|forecast|outlook|direction|where.*going)\b/.test(q)) {
    const dir = m.revparTrend30 >= 0.02 ? "climbing" : m.revparTrend30 <= -0.02 ? "softening" : "flat";
    return {
      text: `${name}: RevPAR ${usd(m.monthRevpar)} (${pct(m.monthOcc, 0)} occ × ${usd(m.monthAdr)} ADR), ${signedPct(
        m.revparTrend30,
        0,
      )} over 30 days and ${signedPct(m.revparTrend7, 0)} this week — ${dir}. RGI sits at ${m.monthRgi.toFixed(0)} vs the comp set.`,
      businessId: biz.id,
      metric: `RevPAR ${signedPct(m.revparTrend30, 0)}`,
      metricUp: m.revparTrend30 >= 0,
    };
  }

  // Labor / cost
  if (/\b(labor|labour|staff|staffing|payroll|cost|expense)\b/.test(q)) {
    const target = 0.32;
    const over = m.monthLaborPct - target;
    const tail =
      over > 0.02
        ? `running hot — ~${usdCompact(m.monthTotalRevenue * over)}/mo above a ${pct(target, 0)} target. Match housekeeping hours to actual occupancy.`
        : `in line with the ${pct(target, 0)} target — no action needed.`;
    return {
      text: `${name}: labor is ${pct(m.monthLaborPct, 0)} of revenue, GOP margin ${pct(m.monthGopMargin, 0)} (${usdCompact(
        m.monthGop,
      )} this month). ${tail}`,
      businessId: biz.id,
      metric: pct(m.monthLaborPct, 0),
      metricUp: over <= 0.02,
    };
  }

  // GOP / profit / margin
  if (/\b(gop|profit|margin|profitab|bottom line|making)\b/.test(q)) {
    return {
      text: `${name}: GOP ${usdCompact(m.monthGop)} this month at a ${pct(m.monthGopMargin, 0)} margin, on ${usdCompact(
        m.monthTotalRevenue,
      )} total revenue. Labor is ${pct(m.monthLaborPct, 0)} and RevPAR ${usd(m.monthRevpar)} (RGI ${m.monthRgi.toFixed(0)}).`,
      businessId: biz.id,
      metric: pct(m.monthGopMargin, 0),
      metricUp: m.monthGopMargin >= 0.38,
    };
  }

  // Occupancy
  if (/\b(occupanc|occ\b|full|empty|vacan|rooms? (sold|filled)|sold out)\b/.test(q)) {
    const split = midweekSplit(biz);
    const splitTxt = split
      ? ` Weekday runs ${pct(split.weekday, 0)} vs weekend ${pct(split.weekend, 0)}.`
      : "";
    return {
      text: `${name}: occupancy ${pct(m.monthOcc, 0)} this month (${signedPct(m.occTrend30, 0)} over 30 days), ADR ${usd(
        m.monthAdr,
      )}, RevPAR ${usd(m.monthRevpar)}.${splitTxt}`,
      businessId: biz.id,
      metric: pct(m.monthOcc, 0),
      metricUp: m.occTrend30 >= 0,
    };
  }

  // ADR / rate / pricing
  if (/\b(adr|rate|pricing|price|how much.*charg|charging)\b/.test(q)) {
    return {
      text: `${name}: ADR ${usd(m.monthAdr)} (${signedPct(m.adrTrend7, 0)} this week) at ${pct(
        m.monthOcc,
        0,
      )} occupancy → RevPAR ${usd(m.monthRevpar)}. RGI ${m.monthRgi.toFixed(0)} vs comp set ${usd(m.todayCompSetRevpar)}.`,
      businessId: biz.id,
      metric: usd(m.monthAdr),
      metricUp: m.adrTrend7 >= 0,
    };
  }

  // Default property read — leads with the rate-vs-volume / RGI diagnosis (the marquee beat).
  const split = midweekSplit(biz);
  if (m.monthRgi < 100) {
    const winningRate = m.monthAdr >= m.todayCompSetRevpar / Math.max(m.monthOcc, 0.01);
    const lever = split && split.weekend < split.weekday * 0.92
      ? `you're winning rate (ADR ${usd(m.monthAdr)}) but losing midweek occupancy (${pct(split.weekday, 0)} weekday vs ${pct(
          split.weekend,
          0,
        )} weekend). Drop BAR ~6% Tue/Wed to pull volume.`
      : winningRate
        ? `rate's there (ADR ${usd(m.monthAdr)}) but occupancy at ${pct(m.monthOcc, 0)} is leaving rooms unsold — push OTA placement and a midweek BAR cut.`
        : `you're pricing below the comp set — ADR ${usd(m.monthAdr)} isn't capturing fair share. Tighten rate discipline and audit OTA parity.`;
    return {
      text: `${name}: RGI ${m.monthRgi.toFixed(0)} — ${lever}`,
      businessId: biz.id,
      metric: `RGI ${m.monthRgi.toFixed(0)}`,
      metricUp: false,
    };
  }
  // Outperforming comp set
  const splitTxt = split ? ` Weekday ${pct(split.weekday, 0)} vs weekend ${pct(split.weekend, 0)}.` : "";
  return {
    text: `${name}: RGI ${m.monthRgi.toFixed(0)} — beating its comp set. RevPAR ${usd(m.monthRevpar)} on ${pct(
      m.monthOcc,
      0,
    )} occupancy at ${usd(m.monthAdr)} ADR, GOP margin ${pct(m.monthGopMargin, 0)}.${splitTxt} Hold rate discipline — don't discount into strength.`,
    businessId: biz.id,
    metric: `RGI ${m.monthRgi.toFixed(0)}`,
    metricUp: true,
  };
}

/** Portfolio/empire-level hotel answer: which property needs attention, RevPAR direction across the book. */
function hotelPortfolioAnswer(hotels: Business[], q: string): AskAnswer | null {
  const rows = hotels
    .map((h) => ({ h, m: hotelMetricsFor(h) }))
    .filter((x): x is { h: Business; m: NonNullable<ReturnType<typeof hotelMetricsFor>> } => x.m != null);
  if (!rows.length) return null;

  // "Which property needs me / is trailing / worst" → lowest RGI (fair-share gap is the cleanest single signal).
  if (/\b(which|what).*(property|properties|hotel|hotels|one)\b/.test(q) || /\b(trailing|worst|weakest|underperform|behind|needs? (me|attention|fixing)|drag|laggard)\b/.test(q)) {
    const byRgi = [...rows].sort((a, b) => a.m.monthRgi - b.m.monthRgi);
    const worst = byRgi[0];
    return hotelAnswer(worst.h, ""); // reuse the property diagnosis (RGI-led)
  }

  // "Where is RevPAR headed" across the portfolio.
  if (/\b(revpar|rev par|headed|heading|trend|trending|momentum|forecast|outlook|direction)\b/.test(q)) {
    const totRev = rows.reduce((a, r) => a + r.m.monthTotalRevenue, 0);
    const wAvg = (sel: (m: (typeof rows)[number]["m"]) => number) =>
      totRev ? rows.reduce((a, r) => a + sel(r.m) * r.m.monthTotalRevenue, 0) / totRev : 0;
    const revparTrend = wAvg((m) => m.revparTrend30);
    const avgRevpar = wAvg((m) => m.monthRevpar);
    const avgRgi = wAvg((m) => m.monthRgi);
    const up = [...rows].sort((a, b) => b.m.revparTrend30 - a.m.revparTrend30)[0];
    const down = [...rows].sort((a, b) => a.m.revparTrend30 - b.m.revparTrend30)[0];
    const dir = revparTrend >= 0.02 ? "climbing" : revparTrend <= -0.02 ? "softening" : "holding flat";
    return {
      text: `Across ${rows.length} properties RevPAR is ${dir} — ${usd(avgRevpar)} blended (${signedPct(
        revparTrend,
        0,
      )} over 30 days), RGI ~${avgRgi.toFixed(0)}. ${up.h.shortName ?? up.h.name} leads (${signedPct(
        up.m.revparTrend30,
        0,
      )}); ${down.h.shortName ?? down.h.name} lags (${signedPct(down.m.revparTrend30, 0)}).`,
      metric: `RevPAR ${signedPct(revparTrend, 0)}`,
      metricUp: revparTrend >= 0,
    };
  }

  return null;
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

  // 1c) Independent-motel questions that didn't name the property (fees, pricing, season, occupancy).
  const indMotel = ctx.businesses.find((b) => b.independent && b.hotelSeries?.length);
  if (
    indMotel &&
    !biz &&
    /\b(booking\.?com|expedia|ota|otas|commission|fee|fees|direct|rate|rates|price|pricing|raise|summerfest|weekend|occupanc|full|summer|season|pacing|pace|cash)\b/.test(q)
  ) {
    return motelAnswer(indMotel, q);
  }

  // 1b) Portfolio/empire-level hotel questions (no single property matched): which property needs me, where is RevPAR headed.
  const hotels = ctx.businesses.filter((b) => b.type === "hotel" && b.hotelSeries?.length);
  if (hotels.length && !biz && /\b(property|properties|hotel|hotels|revpar|rev par|adr|occupanc|rgi)\b/.test(q)) {
    const hp = hotelPortfolioAnswer(hotels, q);
    if (hp) return hp;
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

  // 6b) A specific hotel — answer in RevPAR/ADR/occupancy/RGI/GOP/labor, never weekToDate/avgTicket.
  if (biz && biz.type === "hotel") {
    return hotelAnswer(biz, q);
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
