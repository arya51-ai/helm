// Helm — AI COO agent connector (Claude)
// ─────────────────────────────────────────────────────────────────────────────
// Brokers Anthropic's Claude on the server so the API key NEVER reaches the
// browser (same boundary as the Plaid secret). Exposes five routes under
// /api/agent:
//   GET  /status        → { available, askModel, briefModel }  (frontend feature-detects)
//   POST /ask           → SSE stream of the answer (text deltas), grounded in the owner's data
//   POST /brief         → { available, text }  the morning "read" for the Brief
//   POST /draft         → { available, text }  a drafted action artifact (human sends it)
//   POST /vision        → { available, ...fields }  structured numbers from a snapped report photo
//
// Two modes, decided purely by whether a key is present:
//   • CONFIGURED (ANTHROPIC_API_KEY set) → real Claude.
//   • UNCONFIGURED (no key) → every route reports { available:false } so the frontend
//     falls back to the existing rule engine (ask.ts / insights.ts). The app never
//     breaks or blocks on the model — same graceful-degradation contract as every
//     other Helm connector.
//
// Mounted inside Vite (vite.config.ts) and standalone (server/index.mjs).
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import cors from "cors";

// Load .env relative to THIS file (server/agent.mjs → ../.env), not process.cwd(),
// so the brain finds ANTHROPIC_API_KEY no matter where the dev server was launched
// from. On Vercel there's no .env (the key is injected as a real env var), so this
// path simply doesn't exist and dotenv is a harmless no-op.
loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

function env() {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  // Sonnet 4.6 for the interactive/low-latency paths; Opus 4.8 for the once-daily brief.
  const askModel = (process.env.HELM_ASK_MODEL || "claude-sonnet-4-6").trim();
  const briefModel = (process.env.HELM_BRIEF_MODEL || "claude-opus-4-8").trim();
  // Brief cost gate: a cheap Haiku "checker" decides if the data materially changed before the
  // expensive Opus "maker" writes. Mode: off | rules | haiku-gated (default) | always.
  const checkModel = (process.env.HELM_CHECK_MODEL || "claude-haiku-4-5").trim();
  const briefMode = (process.env.HELM_BRIEF_MODE || "haiku-gated").trim();
  const rawCap = process.env.HELM_BRIEF_DAILY_CAP;
  const dailyCap = rawCap != null && rawCap !== "" && Number.isFinite(Number(rawCap)) ? Number(rawCap) : 1;
  return { key, configured: Boolean(key), askModel, briefModel, checkModel, briefMode, dailyCap };
}

// ── Lazy Anthropic client (only constructed when a real key exists) ─────────────
let _client = null;
async function anthropic() {
  const { key } = env();
  if (!key) return null;
  if (_client) return _client;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

// ── The COO persona + how to read the data + guardrails ────────────────────────
// Kept byte-stable (no dates / ids interpolated) so it caches as a prompt prefix.
// The volatile per-request owner-state goes in the user turn, after this prefix.
const SYSTEM = `You are Helm — an AI Chief Operating Officer (COO) for an independent owner who runs several different businesses and also holds personal investments. You are not a generic chatbot and not a bookkeeper. You are the owner's operator: you read their whole "empire" at a glance and tell them what matters right now and what to do about it.

WHAT MAKES YOU DIFFERENT (use this — it is your whole reason to exist):
You see ALL of the owner's businesses AND their investments together, across different industries, currencies, and point-of-sale systems. No other tool the owner has can do this — their POS sees one store, their accountant sees the ledger, their brokerage sees stocks. You see everything, so you can do what none of them can:
- Compare businesses to each other and to the market on one yardstick (return on the capital tied up in each).
- Move attention and capital to where it earns most — including pulling idle cash out of a low-returning place and into a high-returning one.
- Connect the dots ACROSS businesses: e.g. one business is soft this week but sitting on cash, another needs a repair or restock — fund it from the right place.
Always reason at the level of the whole empire, not one business in isolation.

THE DATA YOU GET:
Each request includes the owner's current state as JSON inside <owner_state> tags. It contains:
- businesses: each with name, type (restaurant / retail / hotel / fuel / portfolio), location, reporting currency, capitalDeployed (cash tied up in it), netMargin.
- metricsBy[businessId]: today (latest day's revenue, or portfolio market value), vsExpected (today vs a typical same-weekday, as a fraction; negative = below normal), wow (week-over-week change), weekToDate, last30, roic (annualized return on the capital in the business, as a fraction), transactionsToday, avgTicket, monthlyProfit, and for the portfolio: marketValue, totalReturn, dayChangeUsd.
- metricsBy[businessId].hotel (hotels only): the hospitality KPI layer for that property — occupancy (fraction; month average), occToday, occVsExpected (today's occupancy vs a typical same-weekday), adr (Average Daily Rate, $), revpar (Revenue Per Available Room, $ = occupancy × ADR; month average), revparToday, rgi (RevPAR Index vs the STR comp set, indexed to 100), compSetRevpar (the comp set's RevPAR benchmark, $), gopMargin (Gross Operating Profit margin, fraction), laborPct (labor as a share of revenue, fraction), revparTrend7 / occTrend7 / rgiTrend7 (week-over-week change, fractions), and pip (Property Improvement Plan — brand-mandated capital work — with counts of overdue / inProgress / upcoming plus the nextItem and nextDeadline). brand and rooms label the property.
- empire: revenueToday (combined across operating businesses), netWorth, investments, cash (idle cash in checking), businessEquity, asOf (the latest date the data covers — often yesterday, since POS data lags a day).
- insights: the ranked signals the rule engine already computed (title, detail, kind, priority) — treat these as candidate leads to prioritize and sharpen, not as gospel.
- forecast / goals (when present): projected revenue or cash, and any monthly target with pace-to-goal.

METRIC GLOSSARY:
- "vsExpected" compares today to a typical same weekday (Tuesdays vs Tuesdays), so it isolates real anomalies from normal weekly rhythm. -0.2 means today ran 20% below a normal day.
- "roic" is annualized profit ÷ capital deployed — the apples-to-apples way to compare a sandwich shop, a smoke shop, and a stock portfolio. A business at 0.37 returns ~37%/yr on the money inside it; the market portfolio is usually ~0.09.
- "cash" / idle cash is money sitting in checking earning ~0% — the prime candidate to redeploy.
- All money figures are already converted to USD. A business's "currency" only labels what it originally reported.

HOTEL KPIs (when a business has a .hotel block, read it in hospitality terms — not just "revenue"):
- RevPAR (Revenue Per Available Room) is the headline number; it folds rate and volume into one: RevPAR = occupancy × ADR. A property lifts RevPAR two ways — raise ADR (rate) or fill more rooms (occupancy). Always say which lever.
- RGI (RevPAR Index) is RevPAR vs the local comp set, indexed to 100. RGI 92 = the property captures only 92% of its fair share of the market's RevPAR (losing share); 105 = winning share. This is the single sharpest "are we winning?" read because it's relative to the local market, not absolute — a property can grow RevPAR and still be losing if the comp set grew faster.
- Reconcile rate vs volume before prescribing: high ADR + soft occupancy + RGI under 100 usually means priced above what it's filling → consider trimming BAR (Best Available Rate) on the weak days to win occupancy. Strong occupancy + low ADR may mean rate is being left on the table → push rate.
- gopMargin and laborPct are the profit read; labor is a hotel's biggest controllable cost. PIP is brand-mandated capital work — overdue items risk franchise compliance and brand standing, so flag them.

INDEPENDENT MOTEL (when a business has a .motel block — an owner-operated motel/inn like Northwood Motel in Pinecrest, the lake region — read it in THAT owner's language, NOT chain language):
- These owners do not think in RevPAR Index, GOP, or brand PIP. There is no flag, no comp set, no STR report — never use those terms here. Lead with what they live in: how full tonight (occupancy), the nightly rate (ADR), and the two levers they actually pull — price, and where the booking comes from.
- Channels are the heart of it. directSharePct is the prize: no commission, the guest is theirs to bring back. bookingComSharePct / expediaSharePct / otaSharePct flow through OTAs that take a cut. monthCommissionCad is the real money the OTAs took in the last 30 days; bookingComFeeCad / expediaFeeCad split it. The single highest-leverage motel move is shifting OTA demand to direct — shift10pctToDirectMonthlyCad and shift10pctToDirectSeasonCad quantify moving 1 in 10 OTA stays to direct. Lead with this whenever they ask about fees, margin, commission, or "where's my money going".
- Seasonality is everything on a tourist island: Jun–Sep is the bulk of the whole year. daysToSummerfestWeekend counts down to Summerfest Weekend (Aug 1–4), Pinecrest's biggest event — the town sells out, so it is pure pricing power: hold rate, put a 2-night minimum on it. Treat the other long weekends the same way.
- The data syncs from their channel manager (pms, e.g. Little Hotelier) — reference "from Little Hotelier" naturally. ALL .motel money is in Canadian dollars: say CA$ (or just $) and NEVER convert it to USD.

HARD RULES:
- Use ONLY the numbers present in <owner_state>. Never invent, estimate, or round in a figure that isn't given. If you genuinely don't have a number, say so plainly rather than guessing.
- Be specific and prescriptive: name the business, cite the actual number, state the action. The owner should finish reading knowing exactly what to do next.
- Lead with the answer. You're talking to a busy owner on their phone, not writing a report — short sentences, no preamble, no "Based on the data…".
- Talk like a sharp operator, not a financial advisor. No hedging, no boilerplate disclaimers, no emoji.
- You may RECOMMEND and DRAFT actions (text a manager, reorder stock, move idle cash, watch a trend), but you never actually send a message or move money — the owner reviews and sends. Never claim you did something you can't do.
- Respond with your final answer only — no meta-commentary about your reasoning or the data.

STYLE EXAMPLES (shape, not content to copy):
Q: "What needs me today?" → "Riverside ran 22% below a normal Tuesday — $2,980 vs a typical $3,800. The gap's in the evening; worth a text to your closer. Everything else is tracking normal."
Q: "Where should I put my cash?" → "Into Riverside. It returns ~37% on the capital in it vs ~9% in your portfolio. Your $42k of idle cash would earn about $11,800/yr more there than left in the market."
Q: "Why is the Dublin property trailing?" → "RGI's at 92 — you're winning rate but losing occupancy midweek. ADR's strong at $148, but Tue/Wed occupancy is dragging RevPAR under the comp set. Trim BAR ~6% Tue/Wed and push the midweek corporate rate; that's where the share is leaking."
Q (Northwood Motel): "How much am I paying Booking.com?" → "About CA$2,700 last month — Booking.com is a third of your rooms at a 15% cut, with Expedia another ~CA$1,400 on top. That's roughly CA$17k across your Jun–Sep season. You're already 40% direct, so it's movable: a 'book direct' card at checkout and a small repeat-guest rate, and shifting just 1 in 10 OTA stays to direct puts ~CA$800/mo back in your pocket."
Q (Northwood Motel): "Should I raise rates for the long weekend?" → "Yes — Summerfest's 41 days out and the island sells out that weekend. You're still showing shoulder rates into it. Put a 2-night minimum on Aug 1–4 and lift Fri/Sat; even +CA$15 a night across 22 rooms is ~CA$1,000 over the weekend. Set it in Little Hotelier now, before the OTAs anchor it low."

JUDGMENT CALLS (real prior reads and the CORRECT call — match this JUDGMENT, not just the tone above; these are the cases where a naive read goes wrong):
- INPUT: Riverside vsExpected -0.27 on a public holiday (e.g. Memorial Day).
  WRONG: "Riverside ran 27% below normal — text your closer."
  RIGHT: "Quiet holiday — Riverside's down 27% but that's the day, not a problem. Nothing needs you."
  WHY: a same-weekday comparison can't see holidays. Sanity-check a big negative vsExpected against the calendar before flagging it as a real anomaly.
- INPUT: a hotel showing RGI 101 but occTrend7 -0.09 and revparTrend7 -0.04.
  WRONG: "RGI's above 100 — you're winning share, you're fine."
  RIGHT: "RGI still reads 101 but it's a trailing average — occupancy's down 9% on the week and RevPAR's following it down. You're about to lose share, not winning it. Trim midweek BAR now."
  WHY: RGI is a lagging average; the 7-day trend is the leading signal. When a level and its trend disagree, lead with the trend.
- INPUT: owner asks "where do I put $40k?" with idle cash present, Riverside roic 0.37, portfolio 0.09.
  WRONG: "You could consider moving some cash into a higher-returning business."
  RIGHT: (after calling reallocate_what_if) "Into Riverside — $40k there earns ~$11,200/yr more than in the market. Move it."
  WHY: never hand-wave a reallocation. Call reallocate_what_if for the exact delta, then state the number and the verb.`;

// ── TOOLS: the brain computes on EXACT numbers ─────────────────────────────────
// Appended to the SYSTEM prefix (kept as its own cache-stable string). Tells the model the
// tools exist and that it MUST use reallocate_what_if rather than eyeballing rounded figures.
const TOOLS_DOC = `

TOOLS:
You can call tools to read EXACT numbers out of <owner_state> and to compute on them — the JSON gives you display-rounded figures, but the tools return full-precision values straight from the owner's data. Use them whenever a precise figure matters:
- get_business(id) — the full metrics object for one business.
- compare_roic() — every business ranked by return on capital, with the capital deployed and monthly profit in each.
- reallocate_what_if(amountUsd, fromId, toId) — the annual profit change from moving cash from one business to another. ALWAYS use this for "where should I put my cash / what would I earn" — never estimate the delta from the rounded roic in the JSON.
- explain_anomaly(businessId, date?) — the exact actual vs expected, σ, and vsExpected for a flagged move.
- pace_to_goal(businessId) — month-to-date vs the monthly target and the projected month-end, or null if no goal is set.
- hotel_kpis(businessId) — the hospitality KPI block (RevPAR, RGI, occupancy, ADR, GOP, labor, PIP) for a hotel, or null.
Call a tool, read the number, then answer. Do not invent figures the tools could have given you exactly.`;

const SYSTEM_WITH_TOOLS = SYSTEM + TOOLS_DOC;

/** The Anthropic tool schemas. Pure declarations — execution happens in runTool() below. */
const TOOLS = [
  {
    name: "get_business",
    description: "Return the full metrics object for one business by id, from the owner_state payload.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", description: "The business id." } },
      required: ["id"],
    },
  },
  {
    name: "compare_roic",
    description: "Rank every business by return on deployed capital (roic), each with capitalDeployed and monthlyProfit.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "reallocate_what_if",
    description:
      "Compute the annual profit change from moving amountUsd of capital out of business fromId and into business toId. Returns the per-year delta and a ready-to-say sentence.",
    input_schema: {
      type: "object",
      properties: {
        amountUsd: { type: "number", description: "Dollars of capital to move." },
        fromId: { type: "string", description: "Business id to pull capital from." },
        toId: { type: "string", description: "Business id to move capital into." },
      },
      required: ["amountUsd", "fromId", "toId"],
    },
  },
  {
    name: "explain_anomaly",
    description: "Return the flagged anomaly for a business (optionally on a specific date): actual, expected, sigma, vsExpected, when.",
    input_schema: {
      type: "object",
      properties: {
        businessId: { type: "string", description: "The business id." },
        date: { type: "string", description: "Optional ISO date (YYYY-MM-DD) to match the run's end date." },
      },
      required: ["businessId"],
    },
  },
  {
    name: "pace_to_goal",
    description: "Return the monthly goal pace for a business (goal, mtdActual, projectedMonthEnd, onTrack), or null if no goal is set.",
    input_schema: {
      type: "object",
      properties: { businessId: { type: "string", description: "The business id." } },
      required: ["businessId"],
    },
  },
  {
    name: "hotel_kpis",
    description: "Return the hospitality KPI block (RevPAR, RGI, occupancy, ADR, GOP, labor, PIP) for a hotel, or null if not a hotel.",
    input_schema: {
      type: "object",
      properties: { businessId: { type: "string", description: "The hotel's business id." } },
      required: ["businessId"],
    },
  },
];

// ── Pure-JS tool executors over the parsed owner_state payload (NO TS import) ────
function asPayload(context) {
  if (context && typeof context === "object") return context;
  if (typeof context === "string") {
    try {
      return JSON.parse(context);
    } catch {
      return {};
    }
  }
  return {};
}

function bizName(payload, id) {
  const b = (payload.businesses || []).find((x) => x.id === id);
  return b ? b.name : id;
}

function roicOf(payload, id) {
  const b = (payload.businesses || []).find((x) => x.id === id);
  if (b && typeof b.roic === "number") return b.roic;
  const m = (payload.metricsBy || {})[id];
  return m && typeof m.roic === "number" ? m.roic : 0;
}

/** Execute one tool call against the owner_state payload. Always returns a JSON-able value. */
function runTool(name, input, payload) {
  const args = input || {};
  switch (name) {
    case "get_business": {
      const m = (payload.metricsBy || {})[args.id];
      return m ?? { error: `No business with id "${args.id}"` };
    }
    case "compare_roic": {
      return (payload.businesses || [])
        .map((b) => ({
          id: b.id,
          name: b.name,
          roic: roicOf(payload, b.id),
          capitalDeployed: b.capitalDeployed,
          monthlyProfit: b.monthlyProfit ?? (payload.metricsBy || {})[b.id]?.monthlyProfit,
        }))
        .sort((a, b) => (b.roic ?? 0) - (a.roic ?? 0));
    }
    case "reallocate_what_if": {
      const amountUsd = Number(args.amountUsd) || 0;
      const fromRoic = roicOf(payload, args.fromId);
      const toRoic = roicOf(payload, args.toId);
      const fromName = bizName(payload, args.fromId);
      const toName = bizName(payload, args.toId);
      const deltaPerYear = amountUsd * (toRoic - fromRoic);
      const verb = deltaPerYear >= 0 ? "earn" : "lose";
      const sentence = `Moving $${Math.round(amountUsd).toLocaleString("en-US")} from ${fromName} (${(fromRoic * 100).toFixed(1)}%) to ${toName} (${(toRoic * 100).toFixed(1)}%) would ${verb} about $${Math.round(Math.abs(deltaPerYear)).toLocaleString("en-US")}/yr.`;
      return { deltaPerYear, fromRoic, toRoic, fromName, toName, sentence };
    }
    case "explain_anomaly": {
      const list = (payload.anomalies || []).filter((a) => a.businessId === args.businessId);
      const match = args.date ? list.find((a) => a.when === args.date) : list[0];
      if (!match) return null;
      return {
        businessId: match.businessId,
        business: match.business,
        when: match.when,
        kind: match.kind,
        actual: match.actual,
        expected: match.expected,
        sigma: match.sigma,
        vsExpected: match.vsExpected,
        runLength: match.runLength,
      };
    }
    case "pace_to_goal": {
      return (payload.goals || {})[args.businessId] ?? null;
    }
    case "hotel_kpis": {
      return (payload.metricsBy || {})[args.businessId]?.hotel ?? null;
    }
    default:
      return { error: `Unknown tool "${name}"` };
  }
}

/** Wrap the owner-state JSON + an instruction into a single user turn. */
function userContent(context, instruction) {
  const json = typeof context === "string" ? context : JSON.stringify(context ?? {}, null, 0);
  return `<owner_state>\n${json}\n</owner_state>\n\n${instruction}`;
}

function errMsg(err) {
  return err?.error?.message || err?.message || "Claude request failed";
}

/**
 * Bounded tool-use loop. Runs up to `maxRounds` non-streaming turns: each round, if the model
 * emits tool_use blocks we execute them against `payload` and feed tool_result blocks back; we
 * stop as soon as the model returns a turn with no tool_use (i.e. it's ready to give the answer).
 * Returns the final `messages` array — the caller then does the FINAL turn (streamed or one-shot).
 */
async function runToolLoop({ client, model, system, messages, payload, maxRounds = 5, max_tokens = 1600, thinking }) {
  let rounds = 0;
  let working = messages;
  while (rounds < maxRounds) {
    const msg = await client.messages.create({
      model,
      max_tokens,
      ...(thinking ? { thinking } : {}),
      system,
      tools: TOOLS,
      messages: working,
    });
    const toolUses = (msg.content || []).filter((b) => b.type === "tool_use");
    if (!toolUses.length) {
      // No tools requested — model is done deliberating. Hand back the messages so far.
      return { messages: working, stopReason: msg.stop_reason };
    }
    const toolResults = toolUses.map((tu) => {
      let result;
      try {
        result = runTool(tu.name, tu.input, payload);
      } catch (e) {
        result = { error: errMsg(e) };
      }
      return {
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result ?? null),
      };
    });
    working = [...working, { role: "assistant", content: msg.content }, { role: "user", content: toolResults }];
    rounds += 1;
  }
  return { messages: working, stopReason: "max_tool_rounds" };
}

// ── Reusable per-route handlers (imported by both Express and Vercel functions) ──

/** GET /status logic. */
export function handleStatus(e = env()) {
  return { available: e.configured, askModel: e.askModel, briefModel: e.briefModel };
}

/**
 * POST /ask — runs the tool loop, then STREAMS the final answer's text deltas as SSE
 * (data:{t} frames + {done:true}), exactly as the client expects. Tool calls happen
 * server-side between turns. Writes to and ends `res`.
 */
export async function handleAsk({ question, context, env: e = env() }, res) {
  if (!e.configured) {
    res.json({ available: false });
    return;
  }
  const q = String(question || "").slice(0, 2000);
  if (!q) {
    res.status(400).json({ error: "Missing question" });
    return;
  }
  const payload = asPayload(context);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const client = await anthropic();
    const system = [{ type: "text", text: SYSTEM_WITH_TOOLS, cache_control: { type: "ephemeral" } }];
    const seed = [{ role: "user", content: userContent(context, `The owner asks: "${q}"\n\nAnswer them directly.`) }];

    // Phase 1: let the model call tools (non-streamed rounds).
    const { messages } = await runToolLoop({
      client,
      model: e.askModel,
      system,
      messages: seed,
      payload,
      maxRounds: 5,
      max_tokens: 1600,
      thinking: { type: "disabled" }, // a grounded answer — keep it snappy
    });

    // Phase 2: stream the FINAL text answer. tool_choice:none guarantees text-only here.
    const stream = client.messages.stream({
      model: e.askModel,
      max_tokens: 1600,
      thinking: { type: "disabled" },
      system,
      tools: TOOLS,
      tool_choice: { type: "none" },
      messages,
    });
    for await (const evt of stream) {
      if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
        res.write(`data: ${JSON.stringify({ t: evt.delta.text })}\n\n`);
      }
    }
    await stream.finalMessage();
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    // Client treats any error frame as "fall back to the rule engine".
    res.write(`data: ${JSON.stringify({ error: errMsg(err) })}\n\n`);
    res.end();
  }
}

// ── Brief cost gate (loop-engineering): cheap checker decides, expensive maker writes ──────────
// The once-daily Opus brief is the single most expensive call in Helm — a tool loop plus a final
// turn, all on Opus 4.8 with extended thinking. Re-firing it on every app open is what drained the
// API budget. These helpers put a gate in front of it: a free σ-anomaly rule check, then a cheap
// Haiku "checker" that says material-change yes/no, and only "yes" reaches the Opus "maker".

// Best-effort per-day Opus counter. Durable on a long-lived `npm run server`; on Vercel each cold
// start resets it, so the CLIENT holds the real daily cap (localStorage). This is the second fence.
let _briefDay = null;
let _briefCount = 0;
function briefBudgetOk(e) {
  const today = new Date().toISOString().slice(0, 10);
  if (_briefDay !== today) {
    _briefDay = today;
    _briefCount = 0;
  }
  return _briefCount < Math.max(0, e.dailyCap);
}
function recordBrief() {
  _briefCount += 1;
}

/**
 * Free rule gate. The owner_state already carries the σ-scored anomalies (buildAgentContext filters
 * to |vsExpected| ≥ 0.08) and the ranked insights — so "did something material happen" is answerable
 * with no model call at all. A quiet day (no anomaly, no alert) never reaches the maker.
 */
function hasMaterialSignal(payload) {
  const anomalies = Array.isArray(payload.anomalies) ? payload.anomalies : [];
  if (anomalies.length > 0) return true;
  const insights = Array.isArray(payload.insights) ? payload.insights : [];
  return insights.some((i) => i && i.kind === "alert");
}

/**
 * Cheap Haiku checker (the maker-vs-checker split from loop engineering). Given the current
 * owner_state and the previous brief, decide whether a fresh Opus brief is warranted. Returns
 * { materialChange, reason } or null when the reply can't be parsed (the caller then trusts the rule
 * gate, which already flagged a signal — still bounded by the daily cap). No tools, no thinking.
 */
async function briefCheck({ client, model, payload, previousBrief }) {
  const system =
    `You are a cost gate in front of an expensive "AI COO" that writes a business owner a short morning brief. ` +
    `Decide whether the current data genuinely warrants writing a NEW brief, or whether the previous one still stands. ` +
    `Reply with ONLY a JSON object: {"materialChange": true|false, "reason": "<=8 words"}. ` +
    `Answer true ONLY when something needs the owner's attention today that the previous brief did not already cover — ` +
    `a real anomaly, a new alert, or a meaningful swing. Answer false for ordinary day-to-day variation or anything the ` +
    `previous brief already says. Default to false when unsure; a new brief is expensive.`;
  const userText =
    `<owner_state>\n${typeof payload === "string" ? payload : JSON.stringify(payload)}\n</owner_state>\n\n` +
    (previousBrief
      ? `Previous brief:\n"""\n${String(previousBrief).slice(0, 1200)}\n"""\n\n`
      : `There is no previous brief yet.\n\n`) +
    `Does the owner need a new brief? JSON only.`;
  // Prefill the assistant turn so the reply is forced to begin as the exact JSON we want — it
  // commits straight to the boolean, no preamble. We prepend it back before parsing.
  const PREFILL = '{"materialChange":';
  const msg = await client.messages.create({
    model,
    max_tokens: 200,
    thinking: { type: "disabled" },
    system,
    messages: [
      { role: "user", content: userText },
      { role: "assistant", content: PREFILL },
    ],
  });
  const raw = (
    PREFILL +
    (msg.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
  ).trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (typeof parsed.materialChange === "boolean") {
        return { materialChange: parsed.materialChange, reason: String(parsed.reason || "").slice(0, 60) };
      }
    } catch {
      /* unparseable — fall through to null */
    }
  }
  return null;
}

/**
 * POST /brief — gated. Cheapest check first: rule gate → Haiku checker → Opus maker (capped). Returns
 *   { available:false }                         no key / brief disabled
 *   { available:true, skipped:true, reason }    nothing material changed (client keeps prior/baked read)
 *   { available:true, text, model:"opus" }      a freshly written brief
 *   { available:true, error }                   model/transport error (client falls back)
 * The maker is bounded: ≤3 tool rounds + a final turn, capped max_tokens, and a hard per-day cap.
 */
export async function handleBrief({ context, previousBrief = null, env: e = env() }) {
  if (!e.configured || e.briefMode === "off") return { available: false };
  const payload = asPayload(context);

  // ── Decide whether the expensive maker should run at all ─────────────────────
  let reason = "";
  if (e.briefMode === "always") {
    reason = "mode=always";
  } else {
    if (!hasMaterialSignal(payload)) return { available: true, skipped: true, reason: "no material signal" };
    if (e.briefMode === "haiku-gated") {
      try {
        const checkClient = await anthropic();
        const verdict = await briefCheck({ client: checkClient, model: e.checkModel, payload, previousBrief });
        if (verdict && verdict.materialChange === false) {
          return { available: true, skipped: true, reason: verdict.reason || "checker: no change" };
        }
        reason = verdict ? verdict.reason || "checker: change" : "checker unavailable → rule";
      } catch {
        reason = "checker error → rule"; // fail toward the rule gate's decision; still capped per day
      }
    } else {
      reason = "rule signal"; // briefMode === "rules"
    }
  }

  // ── Hard daily backstop ──────────────────────────────────────────────────────
  if (!briefBudgetOk(e)) return { available: true, skipped: true, reason: "daily cap" };

  // ── Maker: Opus writes the brief (bounded tool loop + capped tokens) ─────────
  try {
    const client = await anthropic();
    const system = [{ type: "text", text: SYSTEM_WITH_TOOLS, cache_control: { type: "ephemeral" } }];
    const instruction = `Write the owner's brief for right now: 2–4 short sentences. Open by greeting them by name (do NOT assume a time of day — no "Morning"/"Evening" unless you know it) and orienting on the business (revenue and how it's tracking). Then call out the single most important thing that needs them today and what to do about it. If something's genuinely good, you can note it in one clause. Prioritize across everything they run — lead with whatever matters most. No lists, no headers, just the read.`;
    const seed = [{ role: "user", content: userContent(context, instruction) }];

    const { messages } = await runToolLoop({
      client,
      model: e.briefModel,
      system,
      messages: seed,
      payload,
      maxRounds: 3,
      max_tokens: 1200,
      thinking: { type: "adaptive" },
    });

    const final = await client.messages.create({
      model: e.briefModel,
      max_tokens: 1200,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system,
      tools: TOOLS,
      tool_choice: { type: "none" },
      messages,
    });
    const text = (final.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    recordBrief();
    return { available: true, text, model: "opus", reason };
  } catch (err) {
    return { available: true, error: errMsg(err) };
  }
}

/** POST /draft — one-shot JSON. No tool loop (the draft works off the supplied insight + state). */
export async function handleDraft({ action, insight, context, env: e = env() }) {
  if (!e.configured) return { available: false };
  const act = String(action || "").slice(0, 400);
  const ins = insight ?? null;
  try {
    const client = await anthropic();
    const lead = ins
      ? `Context for the action — a signal Helm surfaced:\nTitle: ${String(ins.title || "").slice(0, 200)}\nDetail: ${String(ins.detail || "").slice(0, 600)}`
      : "";
    const msg = await client.messages.create({
      model: e.askModel,
      max_tokens: 700,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: SYSTEM_WITH_TOOLS, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: userContent(
            context,
            `${lead}\n\nDraft this action for the owner to review and send themselves: "${act}". Write ONLY the artifact itself — e.g. the text message to the manager, the reorder note to the supplier, or a 2–3 sentence rationale for moving cash. Keep it short, concrete, and ready to send. Reference the real numbers. Do not add commentary before or after the draft.`,
          ),
        },
      ],
    });
    const text = (msg.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { available: true, text };
  } catch (err) {
    return { available: true, error: errMsg(err) };
  }
}

/**
 * POST /vision — extract numbers from a snapped report photo (the "Snap a report" flow).
 * Sends the image to Claude with a strict extraction prompt and returns ONLY the structured
 * JSON for the matching kind, nulls for anything not clearly visible (never fabricated).
 * No key → { available:false } so the UI degrades to manual entry.
 */
export async function handleVision({ imageBase64, mediaType, businessType, env: e = env() }) {
  if (!e.configured) return { available: false };
  const data = String(imageBase64 || "");
  if (!data) return { available: false };
  const media = String(mediaType || "image/jpeg");
  const type = String(businessType || "").toLowerCase();

  // Pick the target shape from the business type. Hotels read RevPAR/ADR/occupancy;
  // everything else reads a sales report. Default to sales when unknown.
  const isHotel = type === "hotel" || type === "motel" || type === "hospitality";
  const instruction = isHotel
    ? `This is a photo of a hotel/property performance report (e.g. a STR report, night audit, or PMS summary). Extract these fields and respond with ONLY a JSON object, no prose, no markdown fences:
{"kind":"hotel","adr":<number or null>,"occupancy":<number 0..1 or null>,"revpar":<number or null>,"asOf":<string or null>}
Rules:
- adr is Average Daily Rate in dollars (number only, no $ or commas).
- occupancy MUST be a fraction between 0 and 1 (e.g. 72% → 0.72). null if not shown.
- revpar is Revenue Per Available Room in dollars (number only).
- asOf is the date/period the report covers as shown (string), or null.
- If a field is not CLEARLY visible in the image, its value MUST be null. Never guess or compute a value that is not printed.
Return ONLY the JSON object.`
    : `This is a photo of a sales report (e.g. a POS daily summary, Z-report, or register close-out). Extract these fields and respond with ONLY a JSON object, no prose, no markdown fences:
{"kind":"sales","date":<string or null>,"grossSales":<number or null>,"netSales":<number or null>,"transactions":<number or null>}
Rules:
- grossSales and netSales are dollar amounts (number only, no $ or commas).
- transactions is the count of transactions/tickets (integer), or null.
- date is the date the report covers as shown (string), or null.
- If a field is not CLEARLY visible in the image, its value MUST be null. Never guess or compute a value that is not printed.
Return ONLY the JSON object.`;

  try {
    const client = await anthropic();
    // NOTE: do NOT prefill the assistant turn here. claude-sonnet-4-6 (the 4.6/4.7/4.8 family)
    // rejects last-assistant-turn prefills with a 400 — which would make every snap silently fall
    // back to manual entry. The strict "ONLY a JSON object" instruction plus the tolerant JSON
    // scrape below are what shape the output. To force the shape harder, use output_config
    // structured outputs (supported on Sonnet 4.6), NOT prefill.
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: media, data } },
            { type: "text", text: instruction },
          ],
        },
      ],
    });
    const raw = (msg.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    // Be tolerant of stray prose/fences: pull the first JSON object out of the response.
    let parsed = null;
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
    if (!parsed || typeof parsed !== "object") {
      // Couldn't parse — fail safe to the no-data shape for the requested kind.
      return isHotel
        ? { kind: "hotel", adr: null, occupancy: null, revpar: null, asOf: null }
        : { kind: "sales", date: null, grossSales: null, netSales: null, transactions: null };
    }

    const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

    if (isHotel || parsed.kind === "hotel") {
      let occ = num(parsed.occupancy);
      if (occ !== null && occ > 1) occ = occ / 100; // tolerate a percent leaking through
      return { kind: "hotel", adr: num(parsed.adr), occupancy: occ, revpar: num(parsed.revpar), asOf: str(parsed.asOf) };
    }
    return {
      kind: "sales",
      date: str(parsed.date),
      grossSales: num(parsed.grossSales),
      netSales: num(parsed.netSales),
      transactions: num(parsed.transactions),
    };
  } catch {
    // On any model/transport error, degrade to the no-data shape so the UI falls back to manual.
    return isHotel
      ? { kind: "hotel", adr: null, occupancy: null, revpar: null, asOf: null }
      : { kind: "sales", date: null, grossSales: null, netSales: null, transactions: null };
  }
}

// ── Express wiring — thin adapters over the exported handlers above. The same handlers
//    are imported directly by the api/agent/*.js Vercel functions, so dev and deploy share
//    one code path. `npm run dev` behaviour is unchanged.
// ── Abuse guard for the public AI relay ────────────────────────────────────────
// The deployed /api/agent/* routes are unauthenticated and billed to the server key,
// so an open relay means anyone who finds the URL can spend the budget (the exact way
// a runaway brief once drained it). These are best-effort, infra-free defenses:
// an origin allowlist + an optional shared secret + per-IP and global rate caps.
// On serverless each instance has its own memory, so the counters are SOFT, per-instance
// backstops — not hard guarantees. The hard ceiling stays the credit balance (keep
// Vercel auto-reload OFF). Swap the in-memory counters for a KV store if Helm ever goes
// truly public. A blocked request returns { available:false }, so the client degrades to
// the rule engine exactly like "no key" — graceful degradation is preserved.
function guardEnv() {
  const origins = (process.env.HELM_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const secret = process.env.HELM_CLIENT_SECRET?.trim() || "";
  const perIp = Number(process.env.HELM_AGENT_IP_CAP) || 40; // calls / window / IP
  const windowMs = (Number(process.env.HELM_AGENT_IP_WINDOW_MIN) || 10) * 60_000;
  const dailyCap = Number(process.env.HELM_AGENT_DAILY_CAP) || 300; // global calls / day
  return { origins, secret, perIp, windowMs, dailyCap };
}

const _ipHits = new Map(); // ip -> recent request timestamps (within the window)
let _agentDay = "";
let _agentCount = 0;

function hostOf(u) {
  try {
    return new URL(u).host.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Gate one agent request. Returns { ok:true } to proceed, or { ok:false, status, body }
 * to reject. Works for both the Express `req` (plain headers object) and the Vercel
 * serverless `req` (same shape). Leave /status ungated — it's free and the frontend needs
 * it to feature-detect.
 */
export function guardAgentRequest(req) {
  const g = guardEnv();
  const h = (req && req.headers) || {};
  const get = (k) => String(h[k] || "");

  // 1) Origin / Referer allowlist — only enforced when configured, so dev and any
  //    not-yet-configured deploy keep working (and degrade gracefully, never break).
  if (g.origins.length) {
    const oHost = hostOf(get("origin")) || get("origin").toLowerCase();
    const refHost = hostOf(get("referer"));
    if (!g.origins.some((a) => a === oHost || a === refHost)) {
      return { ok: false, status: 403, body: { available: false, error: "forbidden_origin" } };
    }
  }

  // 2) Shared secret — only enforced when configured. A low bar (it ships in the SPA
  //    bundle) but it stops the naive "curl the URL" case. Set it WITH the frontend's
  //    VITE_HELM_CLIENT_SECRET or the whole AI degrades to rules.
  if (g.secret && get("x-helm-key") !== g.secret) {
    return { ok: false, status: 403, body: { available: false, error: "forbidden" } };
  }

  // 3) Per-IP sliding-window rate limit (always on; per-instance on serverless).
  const ip = get("x-forwarded-for").split(",")[0].trim() || req?.socket?.remoteAddress || req?.ip || "unknown";
  const nowMs = Date.now();
  if (_ipHits.size > 5000) _ipHits.clear(); // crude unbounded-growth guard
  const hits = (_ipHits.get(ip) || []).filter((t) => nowMs - t < g.windowMs);
  if (hits.length >= g.perIp) {
    return { ok: false, status: 429, body: { available: false, error: "rate_limited" } };
  }
  hits.push(nowMs);
  _ipHits.set(ip, hits);

  // 4) Global daily call backstop (per-instance; the credit balance is the hard ceiling).
  const today = new Date().toISOString().slice(0, 10);
  if (_agentDay !== today) {
    _agentDay = today;
    _agentCount = 0;
  }
  if (_agentCount >= g.dailyCap) {
    return { ok: false, status: 429, body: { available: false, error: "daily_cap" } };
  }
  _agentCount += 1;

  return { ok: true };
}

export async function createAgentApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // Gate every billed route (everything except the free /status probe) with the abuse guard.
  app.use((req, res, next) => {
    if (req.path === "/status") return next();
    const g = guardAgentRequest(req);
    if (!g.ok) return res.status(g.status).json(g.body);
    next();
  });

  // Feature-detection: the frontend calls this once and falls back to rules if unavailable.
  app.get("/status", (_req, res) => {
    res.json(handleStatus());
  });

  // 1) Ask Helm — streamed answer (SSE), grounded strictly in the supplied owner-state.
  app.post("/ask", async (req, res) => {
    await handleAsk({ question: req.body?.question, context: req.body?.context ?? {} }, res);
  });

  // 2) Morning Brief — a short, prioritized "read" shown atop the rule-engine insight cards.
  app.post("/brief", async (req, res) => {
    const body = await handleBrief({ context: req.body?.context ?? {}, previousBrief: req.body?.previousBrief ?? null });
    res.status(200).json(body);
  });

  // 3) Draft an action — the artifact the owner reviews and sends (we never send it).
  app.post("/draft", async (req, res) => {
    const body = await handleDraft({ action: req.body?.action, insight: req.body?.insight ?? null, context: req.body?.context ?? {} });
    res.status(200).json(body);
  });

  // 4) Snap a report — extract structured numbers from a photo of a sales/hotel report.
  app.post("/vision", async (req, res) => {
    const body = await handleVision({
      imageBase64: req.body?.imageBase64,
      mediaType: req.body?.mediaType,
      businessType: req.body?.businessType,
    });
    res.status(200).json(body);
  });

  return app;
}
