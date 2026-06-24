import type { Business, Insight, PipItem } from "../types";
import type { Metrics, EmpireSummary } from "./analytics";
import { answerQuestion, type AskContext, type AskAnswer } from "./ask";
import { hotelMetricsFor, type HotelMetrics } from "./hotelAnalytics";
import { motelChannelStats, daysToSummerfest } from "./motelInsights";
import { summarizeForecast, paceToGoal } from "./forecast";
import { empireAnomalies } from "./anomalies";
import { bakedBrief } from "./bakedBrief";
import { goalFor } from "../data/goals";

/**
 * The Helm "brain" client. Talks to the server-side Claude connector (/api/agent),
 * with a strict three-tier graceful degradation:
 *   1. real Claude (when ANTHROPIC_API_KEY is configured server-side)  → source: "claude"
 *   2. the existing rule engine (ask.ts / insights.ts)                 → source: "rules"
 *   3. never throws to the caller — the app must never break on the model.
 *
 * Numbers always come from analytics.ts; Claude only prioritizes, explains, and drafts.
 * The owner-state we send is a compact projection of the same metrics the UI shows. Fields the
 * server-side tools compute on (capitalDeployed, roic, monthlyProfit, anomaly stats) are kept
 * EXACT/un-rounded so reallocate_what_if math is precise; display-only fields stay rounded.
 */

export type AgentSource = "claude" | "rules";

export interface AgentAnswer extends AskAnswer {
  source: AgentSource;
}

export interface AgentStatus {
  available: boolean;
  askModel?: string;
  briefModel?: string;
}

const API = "/api/agent";

// ── Status (feature-detect once; cache the probe) ──────────────────────────────
let _statusProbe: Promise<AgentStatus> | null = null;
export function agentStatus(): Promise<AgentStatus> {
  if (!_statusProbe) {
    _statusProbe = fetch(`${API}/status`)
      .then((r) => (r.ok ? r.json() : { available: false }))
      .catch(() => ({ available: false }));
  }
  return _statusProbe;
}

// ── Compact owner-state the model reasons over (rounded; no 90-day series) ──────
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100; // fractions
const r0 = (n: number) => Math.round(n); // money

// PIP (Property Improvement Plan) — brand-mandated capital work. Surface the pressure,
// not the full list: counts of unfinished items by status + the soonest deadline.
function summarizePip(items?: PipItem[]) {
  if (!items?.length) return undefined;
  const count = (s: PipItem["status"]) => items.filter((p) => p.status === s).length;
  const overdue = count("overdue");
  const inProgress = count("in-progress");
  const upcoming = count("upcoming");
  if (!overdue && !inProgress && !upcoming) return undefined;
  const next = items
    .filter((p) => p.status !== "complete")
    .sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
  return { overdue, inProgress, upcoming, ...(next ? { nextItem: next.title, nextDeadline: next.deadline } : {}) };
}

// The independent-motel layer — what an owner-operator (Sam @ Northwood) actually reasons in:
// occupancy, nightly rate (CAD), where the bookings come from, what the OTAs take, and the season.
// Deliberately NO RevPAR Index / GOP / PIP — those are chain concepts that don't exist here.
function motelBlock(b: Business, h: HotelMetrics) {
  const s = motelChannelStats(b);
  const hw = daysToSummerfest();
  const c = b.channelMix;
  return {
    independent: true,
    currency: "CAD",
    rooms: b.rooms,
    pms: b.pms,
    occupancy: r2(h.monthOcc),
    occToday: r2(h.todayOcc),
    occVsExpected: r2(h.occVsExpected),
    adrCad: r0(h.monthAdr),
    adrTodayCad: r0(h.todayAdr),
    revparCad: r0(h.monthRevpar),
    revparTrend30: r2(h.revparTrend30),
    occTrend7: r2(h.occTrend7),
    directSharePct: c ? r2(c.direct) : undefined,
    bookingComSharePct: c ? r2(c.bookingCom) : undefined,
    expediaSharePct: c ? r2(c.expedia) : undefined,
    ...(s
      ? {
          otaSharePct: r2(s.otaShare),
          monthRoomRevenueCad: s.monthRoomRev,
          monthCommissionCad: s.commission,
          bookingComFeeCad: s.bookingComFee,
          expediaFeeCad: s.expediaFee,
          seasonCommissionCad: s.seasonCommission,
          shift10pctToDirectMonthlyCad: s.shift10Monthly,
          shift10pctToDirectSeasonCad: s.shift10Season,
        }
      : {}),
    daysToSummerfestWeekend: hw.days,
  };
}

// The hospitality KPI layer for a hotel — the same numbers HotelDetail shows, rounded for the
// model: rate (ADR), volume (occupancy), the two folded together (RevPAR), share-of-market (RGI
// vs the comp set), profitability (GOP/labor), 7-day momentum, and PIP pressure.
function hotelBlock(b: Business, h: HotelMetrics) {
  const pip = summarizePip(b.pipItems);
  return {
    brand: b.brand,
    rooms: b.rooms,
    occupancy: r2(h.monthOcc),
    occToday: r2(h.todayOcc),
    occVsExpected: r2(h.occVsExpected),
    adr: r0(h.monthAdr),
    revpar: r0(h.monthRevpar),
    revparToday: r0(h.todayRevpar),
    rgi: r0(h.monthRgi),
    compSetRevpar: r0(h.todayCompSetRevpar),
    gopMargin: r2(h.monthGopMargin),
    laborPct: r2(h.monthLaborPct),
    revparTrend7: r2(h.revparTrend7),
    occTrend7: r2(h.occTrend7),
    rgiTrend7: r2(h.rgiTrend7),
    ...(pip ? { pip } : {}),
  };
}

export function buildAgentContext(ctx: AskContext) {
  // capitalDeployed / roic / monthlyProfit are kept UN-rounded: the model's tools compute
  // reallocation math on them (amount × ΔROIC), and rounding ROIC to 2dp would throw the
  // per-year delta off by hundreds. Display-only fields stay rounded to keep the payload lean.
  const businesses = ctx.businesses.map((b) => {
    const m = ctx.metricsBy[b.id];
    return {
      id: b.id,
      name: b.name,
      type: b.type,
      location: b.location,
      currency: b.currency ?? (b.independent ? "CAD" : "USD"),
      capitalDeployed: b.capitalDeployed,
      netMargin: b.netMargin != null ? r2(b.netMargin) : undefined,
      roic: m ? m.roic : undefined,
      monthlyProfit: m ? m.monthlyProfit : undefined,
    };
  });
  const metricsBy: Record<string, unknown> = {};
  const goals: Record<string, unknown> = {};
  for (const b of ctx.businesses) {
    const m = ctx.metricsBy[b.id];
    if (!m) continue;
    if (m.isPortfolio) {
      metricsBy[b.id] = {
        marketValue: r0(m.marketValue),
        totalReturn: r2(m.totalReturn),
        dayChangeUsd: r0(m.dayChangeUsd),
        roic: m.roic, // exact — compare_roic / reallocate_what_if compute on it
        monthlyProfit: m.monthlyProfit,
      };
    } else {
      const fc = summarizeForecast(b.series, 30);
      const base: Record<string, unknown> = {
        today: r0(m.today),
        vsExpected: r2(m.vsExpected),
        expectedToday: r0(m.expectedToday),
        wow: r2(m.wow),
        weekToDate: r0(m.weekToDate),
        last30: r0(m.last30),
        roic: m.roic, // exact
        monthlyProfit: m.monthlyProfit, // exact
        transactionsToday: m.transactionsToday,
        avgTicket: r2(m.avgTicket),
        forecastNext30: fc ? r0(fc.total) : null,
      };
      // Hotels get a hospitality KPI layer alongside the generic operating metrics, so the COO
      // reasons in RevPAR/RGI/occupancy terms — not just "revenue". Independent motels get the
      // owner-operator layer instead (channels, OTA commission, season) under `.motel`.
      if (b.type === "hotel") {
        const h = hotelMetricsFor(b);
        if (h) {
          if (b.independent) base.motel = motelBlock(b, h);
          else base.hotel = hotelBlock(b, h);
        }
      }
      metricsBy[b.id] = base;
      const goal = goalFor(b.id);
      if (goal > 0) {
        const p = paceToGoal(b.series, goal);
        if (p) goals[b.id] = { goal: r0(p.goal), mtdActual: r0(p.mtdActual), projectedMonthEnd: r0(p.projectedMonthEnd), onTrack: p.onTrack };
      }
    }
  }
  // Cross-empire "what changed" — the σ-scored outliers, so the brain reasons over real
  // deviations (and can compare across businesses) rather than re-deriving them from raw series.
  const anomalies = empireAnomalies(ctx.businesses, { lookback: 21, z: 1.5 })
    .filter((a) => Math.abs(a.vsExpected) >= 0.08)
    .slice(0, 6)
    .map((a) => ({
      businessId: a.businessId,
      business: a.businessName,
      when: a.endDate,
      kind: a.kind,
      sigma: a.z, // exact — explain_anomaly reads these straight back
      vsExpected: a.vsExpected,
      actual: a.actual,
      expected: a.expected,
      runLength: a.runLength,
    }));

  const e = ctx.empire;
  return {
    businesses,
    metricsBy,
    empire: {
      revenueToday: r0(e.revenueToday),
      revenueDayChange: r2(e.revenueDayChange),
      weekToDate: r0(e.weekToDate),
      last30: r0(e.last30),
      netWorth: r0(e.netWorth),
      totalAssets: r0(e.totalAssets),
      liabilities: r0(e.liabilities),
      manualAssets: r0(e.manualAssets),
      investments: r0(e.investments),
      cash: r0(e.cash),
      businessEquity: r0(e.businessEquity),
      asOf: e.asOf,
    },
    idleCash: r0(ctx.idleCash),
    insights: ctx.insights.slice(0, 6).map((i) => ({
      kind: i.kind,
      title: i.title,
      detail: i.detail,
      priority: Math.round(i.priority),
    })),
    ...(Object.keys(goals).length ? { goals } : {}),
    ...(anomalies.length ? { anomalies } : {}),
  };
}

// ── Ask Helm — streamed answer with rule-engine fallback ───────────────────────
export async function askAgent(
  question: string,
  ctx: AskContext,
  onToken?: (textSoFar: string) => void,
): Promise<AgentAnswer> {
  const fallback = (): AgentAnswer => ({ ...answerQuestion(question, ctx), source: "rules" });
  try {
    const status = await agentStatus();
    if (!status.available) return fallback();

    const resp = await fetch(`${API}/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, context: buildAgentContext(ctx) }),
    });
    const ctype = resp.headers.get("content-type") || "";
    if (!resp.ok || !resp.body || ctype.includes("application/json")) return fallback();

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let text = "";
    let streamErr = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith("data:")) continue;
        let payload: { t?: string; error?: string; done?: boolean };
        try {
          payload = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        if (payload.t) {
          text += payload.t;
          onToken?.(text);
        } else if (payload.error) {
          streamErr = true;
        }
      }
    }
    if (streamErr || !text.trim()) return fallback();
    return { text: text.trim(), source: "claude" };
  } catch {
    return fallback();
  }
}

// ── Morning brief narrative ────────────────────────────────────────────────────
// Three-tier: real Claude when a key is configured → the baked COO read (computed from
// live signals) otherwise. Never null, so the "Helm's read" card always has something true
// to say even with no API key — the model only *upgrades* the narrative when present.
export async function generateBrief(ctx: AskContext): Promise<string | null> {
  const baked = () => {
    const t = bakedBrief(ctx);
    return t || null;
  };
  try {
    const status = await agentStatus();
    if (!status.available) return baked();
    const resp = await fetch(`${API}/brief`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ context: buildAgentContext(ctx) }),
    });
    if (!resp.ok) return baked();
    const j = await resp.json();
    if (j?.available && j.text && !j.error) return String(j.text).trim();
    return baked();
  } catch {
    return baked();
  }
}

// ── Draft an action artifact (null when Claude isn't available) ────────────────
export async function draftAction(
  action: string,
  insight: Insight | null,
  ctx: AskContext,
): Promise<string | null> {
  try {
    const status = await agentStatus();
    if (!status.available) return null;
    const resp = await fetch(`${API}/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        insight: insight ? { title: insight.title, detail: insight.detail } : null,
        context: buildAgentContext(ctx),
      }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    if (j?.available && j.text && !j.error) return String(j.text).trim();
    return null;
  } catch {
    return null;
  }
}

// Re-export the types callers need so they don't reach into ask.ts directly.
export type { AskContext, Metrics, EmpireSummary, Business };
