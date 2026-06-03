// Helm — AI COO agent connector (Claude)
// ─────────────────────────────────────────────────────────────────────────────
// Brokers Anthropic's Claude on the server so the API key NEVER reaches the
// browser (same boundary as the Plaid secret). Exposes three routes under
// /api/agent:
//   GET  /status        → { available, askModel, briefModel }  (frontend feature-detects)
//   POST /ask           → SSE stream of the answer (text deltas), grounded in the owner's data
//   POST /brief         → { available, text }  the morning "read" for the Brief
//   POST /draft         → { available, text }  a drafted action artifact (human sends it)
//
// Two modes, decided purely by whether a key is present:
//   • CONFIGURED (ANTHROPIC_API_KEY set) → real Claude.
//   • UNCONFIGURED (no key) → every route reports { available:false } so the frontend
//     falls back to the existing rule engine (ask.ts / insights.ts). The app never
//     breaks or blocks on the model — same graceful-degradation contract as every
//     other Helm connector.
//
// Mounted inside Vite (vite.config.ts) and standalone (server/index.mjs).
import "dotenv/config";
import express from "express";
import cors from "cors";

function env() {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  // Sonnet 4.6 for the interactive/low-latency paths; Opus 4.8 for the once-daily brief.
  const askModel = (process.env.HELM_ASK_MODEL || "claude-sonnet-4-6").trim();
  const briefModel = (process.env.HELM_BRIEF_MODEL || "claude-opus-4-8").trim();
  return { key, configured: Boolean(key), askModel, briefModel };
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
- businesses: each with name, type (restaurant / retail / portfolio), location, reporting currency, capitalDeployed (cash tied up in it), netMargin.
- metricsBy[businessId]: today (latest day's revenue, or portfolio market value), vsExpected (today vs a typical same-weekday, as a fraction; negative = below normal), wow (week-over-week change), weekToDate, last30, roic (annualized return on the capital in the business, as a fraction), transactionsToday, avgTicket, monthlyProfit, and for the portfolio: marketValue, totalReturn, dayChangeUsd.
- empire: revenueToday (combined across operating businesses), netWorth, investments, cash (idle cash in checking), businessEquity, asOf (the latest date the data covers — often yesterday, since POS data lags a day).
- insights: the ranked signals the rule engine already computed (title, detail, kind, priority) — treat these as candidate leads to prioritize and sharpen, not as gospel.
- forecast / goals (when present): projected revenue or cash, and any monthly target with pace-to-goal.

METRIC GLOSSARY:
- "vsExpected" compares today to a typical same weekday (Tuesdays vs Tuesdays), so it isolates real anomalies from normal weekly rhythm. -0.2 means today ran 20% below a normal day.
- "roic" is annualized profit ÷ capital deployed — the apples-to-apples way to compare a sandwich shop, a smoke shop, and a stock portfolio. A business at 0.37 returns ~37%/yr on the money inside it; the market portfolio is usually ~0.09.
- "cash" / idle cash is money sitting in checking earning ~0% — the prime candidate to redeploy.
- All money figures are already converted to USD. A business's "currency" only labels what it originally reported.

HARD RULES:
- Use ONLY the numbers present in <owner_state>. Never invent, estimate, or round in a figure that isn't given. If you genuinely don't have a number, say so plainly rather than guessing.
- Be specific and prescriptive: name the business, cite the actual number, state the action. The owner should finish reading knowing exactly what to do next.
- Lead with the answer. You're talking to a busy owner on their phone, not writing a report — short sentences, no preamble, no "Based on the data…".
- Talk like a sharp operator, not a financial advisor. No hedging, no boilerplate disclaimers, no emoji.
- You may RECOMMEND and DRAFT actions (text a manager, reorder stock, move idle cash, watch a trend), but you never actually send a message or move money — the owner reviews and sends. Never claim you did something you can't do.
- Respond with your final answer only — no meta-commentary about your reasoning or the data.

STYLE EXAMPLES (shape, not content to copy):
Q: "What needs me today?" → "Riverside ran 22% below a normal Tuesday — $2,980 vs a typical $3,800. The gap's in the evening; worth a text to your closer. Everything else is tracking normal."
Q: "Where should I put my cash?" → "Into Riverside. It returns ~37% on the capital in it vs ~9% in your portfolio. Your $42k of idle cash would earn about $11,800/yr more there than left in the market."`;

/** Wrap the owner-state JSON + an instruction into a single user turn. */
function userContent(context, instruction) {
  const json = typeof context === "string" ? context : JSON.stringify(context ?? {}, null, 0);
  return `<owner_state>\n${json}\n</owner_state>\n\n${instruction}`;
}

function errMsg(err) {
  return err?.error?.message || err?.message || "Claude request failed";
}

export async function createAgentApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // Feature-detection: the frontend calls this once and falls back to rules if unavailable.
  app.get("/status", (_req, res) => {
    const e = env();
    res.json({ available: e.configured, askModel: e.askModel, briefModel: e.briefModel });
  });

  // 1) Ask Helm — streamed answer (SSE). Grounded strictly in the supplied owner-state.
  app.post("/ask", async (req, res) => {
    const e = env();
    if (!e.configured) return res.json({ available: false });
    const question = String(req.body?.question || "").slice(0, 2000);
    const context = req.body?.context ?? {};
    if (!question) return res.status(400).json({ error: "Missing question" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    try {
      const client = await anthropic();
      const stream = client.messages.stream({
        model: e.askModel,
        max_tokens: 1600,
        thinking: { type: "disabled" }, // a grounded answer — keep it snappy
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userContent(context, `The owner asks: "${question}"\n\nAnswer them directly.`) }],
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
  });

  // 2) Morning Brief — a short, prioritized "read" shown atop the rule-engine insight cards.
  app.post("/brief", async (req, res) => {
    const e = env();
    if (!e.configured) return res.json({ available: false });
    const context = req.body?.context ?? {};
    try {
      const client = await anthropic();
      const msg = await client.messages.create({
        model: e.briefModel,
        max_tokens: 1200,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: userContent(
              context,
              `Write this morning's brief for the owner: 2–4 short sentences. Open by greeting them by name and orienting on the empire (combined revenue and how it's tracking). Then call out the single most important thing that needs them today and what to do about it. If something's genuinely good, you can note it in one clause. Prioritize across ALL businesses and the portfolio — lead with whatever matters most. No lists, no headers, just the read.`,
            ),
          },
        ],
      });
      const text = (msg.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      res.json({ available: true, text });
    } catch (err) {
      res.status(200).json({ available: true, error: errMsg(err) });
    }
  });

  // 3) Draft an action — the artifact the owner reviews and sends (we never send it).
  app.post("/draft", async (req, res) => {
    const e = env();
    if (!e.configured) return res.json({ available: false });
    const context = req.body?.context ?? {};
    const action = String(req.body?.action || "").slice(0, 400);
    const insight = req.body?.insight ?? null;
    try {
      const client = await anthropic();
      const lead = insight
        ? `Context for the action — a signal Helm surfaced:\nTitle: ${String(insight.title || "").slice(0, 200)}\nDetail: ${String(insight.detail || "").slice(0, 600)}`
        : "";
      const msg = await client.messages.create({
        model: e.askModel,
        max_tokens: 700,
        thinking: { type: "disabled" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: userContent(
              context,
              `${lead}\n\nDraft this action for the owner to review and send themselves: "${action}". Write ONLY the artifact itself — e.g. the text message to the manager, the reorder note to the supplier, or a 2–3 sentence rationale for moving cash. Keep it short, concrete, and ready to send. Reference the real numbers. Do not add commentary before or after the draft.`,
            ),
          },
        ],
      });
      const text = (msg.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      res.json({ available: true, text });
    } catch (err) {
      res.status(200).json({ available: true, error: errMsg(err) });
    }
  });

  return app;
}
