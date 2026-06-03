import type { Business, Insight } from "../types";
import type { Metrics, EmpireSummary } from "./analytics";
import { answerQuestion, type AskContext, type AskAnswer } from "./ask";

/**
 * The Helm "brain" client. Talks to the server-side Claude connector (/api/agent),
 * with a strict three-tier graceful degradation:
 *   1. real Claude (when ANTHROPIC_API_KEY is configured server-side)  → source: "claude"
 *   2. the existing rule engine (ask.ts / insights.ts)                 → source: "rules"
 *   3. never throws to the caller — the app must never break on the model.
 *
 * Numbers always come from analytics.ts; Claude only prioritizes, explains, and drafts.
 * The owner-state we send is a compact, rounded projection of the same metrics the UI shows.
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

export function buildAgentContext(ctx: AskContext, extra?: Record<string, unknown>) {
  const businesses = ctx.businesses.map((b) => ({
    id: b.id,
    name: b.name,
    type: b.type,
    location: b.location,
    currency: b.currency ?? "USD",
    capitalDeployed: r0(b.capitalDeployed),
    netMargin: b.netMargin != null ? r2(b.netMargin) : undefined,
  }));
  const metricsBy: Record<string, unknown> = {};
  for (const b of ctx.businesses) {
    const m = ctx.metricsBy[b.id];
    if (!m) continue;
    metricsBy[b.id] = m.isPortfolio
      ? {
          marketValue: r0(m.marketValue),
          totalReturn: r2(m.totalReturn),
          dayChangeUsd: r0(m.dayChangeUsd),
          roic: r2(m.roic),
        }
      : {
          today: r0(m.today),
          vsExpected: r2(m.vsExpected),
          expectedToday: r0(m.expectedToday),
          wow: r2(m.wow),
          weekToDate: r0(m.weekToDate),
          last30: r0(m.last30),
          roic: r2(m.roic),
          monthlyProfit: r0(m.monthlyProfit),
          transactionsToday: m.transactionsToday,
          avgTicket: r2(m.avgTicket),
        };
  }
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
    ...(extra ?? {}),
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

// ── Morning brief narrative (null when Claude isn't available) ─────────────────
export async function generateBrief(ctx: AskContext): Promise<string | null> {
  try {
    const status = await agentStatus();
    if (!status.available) return null;
    const resp = await fetch(`${API}/brief`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ context: buildAgentContext(ctx) }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    if (j?.available && j.text && !j.error) return String(j.text).trim();
    return null;
  } catch {
    return null;
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
