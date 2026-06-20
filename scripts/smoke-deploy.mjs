// Helm — live-brain smoke test for a DEPLOYED url.
// Proves the Claude COO is ACTUALLY live on a deployment — not silently degraded to the
// offline rule engine. Run after every deploy:  node scripts/smoke-deploy.mjs <base-url>
// (or set BASE_URL).  Exits 1 on ANY failure so it can gate CI / a release step.
//
// Why this exists: the app degrades gracefully by design — if /api/agent is missing or
// ANTHROPIC_API_KEY isn't set on the host, every surface FALLS BACK to rules and the UI
// still works. That's great for users and terrible for "is the brain on?" — a dead brain
// looks identical to a live one unless you check. This makes the silent fallback loud.
//
// Contract it asserts (matches server/agent.mjs exactly):
//   GET  /api/agent/status → { available:true, askModel, briefModel }   (false ⇒ brain off)
//   POST /api/agent/ask    → SSE: one+ `data:{"t":"…"}` text frames, then `data:{"done":true}`
//                            (a JSON `{available:false}` body ⇒ fell back to rules)
//   POST /api/agent/brief  → { available:true, text:"…" }               (non-empty narrative)
//
// Uses global fetch (Node 18+). No deps.

const base = (process.argv[2] || process.env.BASE_URL || "").trim().replace(/\/+$/, "");

if (!base) {
  console.error("FAIL  no base url. Usage: node scripts/smoke-deploy.mjs https://your-app.vercel.app");
  console.error("                  (or: BASE_URL=https://your-app.vercel.app npm run smoke)");
  process.exit(1);
}
if (!/^https?:\/\//.test(base)) {
  console.error(`FAIL  base url must start with http(s)://  — got "${base}"`);
  process.exit(1);
}

// A tiny but well-formed owner_state so the brain can actually answer. Mirrors the shape
// src/lib/agent.ts:buildAgentContext() sends (businesses + metricsBy + empire), trimmed down.
const context = {
  businesses: [
    { id: "sub", name: "Subway", type: "restaurant", location: "OH", currency: "USD", capitalDeployed: 120000, netMargin: 0.11, roic: 0.21, monthlyProfit: 4200 },
    { id: "smoke", name: "Riverside", type: "retail", location: "OH", currency: "USD", capitalDeployed: 90000, netMargin: 0.19, roic: 0.37, monthlyProfit: 5100 },
  ],
  metricsBy: {
    sub: { today: 1640, vsExpected: 0.02, wow: 0.01, weekToDate: 9100, last30: 41000, roic: 0.21, monthlyProfit: 4200, transactionsToday: 188, avgTicket: 8.7 },
    smoke: { today: 2980, vsExpected: -0.22, wow: -0.04, weekToDate: 14200, last30: 61000, roic: 0.37, monthlyProfit: 5100, transactionsToday: 142, avgTicket: 21.0 },
  },
  empire: { revenueToday: 4620, netWorth: 410000, investments: 88000, cash: 42000, businessEquity: 210000, asOf: "2026-06-19" },
  idleCash: 42000,
  insights: [{ kind: "alert", title: "Riverside running below a normal day", detail: "Today is ~22% under a typical same-weekday.", priority: 90 }],
};

const TIMEOUT_MS = 60000; // the brief runs Opus with extended thinking — give it room
let failed = false;

function pass(label, note = "") {
  console.log(`PASS  ${label}${note ? `  — ${note}` : ""}`);
}
function fail(label, note = "") {
  failed = true;
  console.error(`FAIL  ${label}${note ? `  — ${note}` : ""}`);
}

function withTimeout(ms) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  return { signal: ac.signal, done: () => clearTimeout(id) };
}

// ── 1) status: the brain must report itself live ───────────────────────────────
async function checkStatus() {
  const t = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/agent/status`, { signal: t.signal });
    if (!res.ok) return fail("status", `HTTP ${res.status} from /api/agent/status (is /api routed on this host?)`);
    let body;
    try {
      body = await res.json();
    } catch {
      return fail("status", "response was not JSON (the /api/agent functions may not be deployed)");
    }
    if (body && body.available === true) {
      pass("status  available:true", `ask=${body.askModel || "?"} brief=${body.briefModel || "?"}`);
    } else {
      fail("status  available:false", "rule-engine fallback — brain NOT live. Set ANTHROPIC_API_KEY on the host.");
    }
  } catch (e) {
    fail("status", `request failed: ${e?.message || e}`);
  } finally {
    t.done();
  }
}

// ── 2) ask: must STREAM SSE text frames + a final {done:true}, NOT a JSON fallback ─
async function checkAsk() {
  const t = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/agent/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "What needs me today?", context }),
      signal: t.signal,
    });
    if (!res.ok) return fail("ask", `HTTP ${res.status} from /api/agent/ask`);

    const ctype = res.headers.get("content-type") || "";
    // The dead-giveaway of a silent fallback: the route answers with a JSON {available:false}
    // body instead of an event-stream. Catch it explicitly so the failure is unambiguous.
    if (ctype.includes("application/json")) {
      let body = null;
      try {
        body = await res.json();
      } catch {
        /* ignore */
      }
      if (body && body.available === false) {
        return fail("ask  streamed SSE", "got JSON {available:false} — brain NOT live, fell back to rules");
      }
      return fail("ask  streamed SSE", `expected text/event-stream, got JSON: ${JSON.stringify(body).slice(0, 200)}`);
    }
    if (!res.body) return fail("ask  streamed SSE", "no response body to stream");

    // Parse the SSE frames exactly like src/lib/agent.ts does: split on blank lines, read `data:`.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let text = "";
    let sawDone = false;
    let sawError = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith("data:")) continue;
        let payload;
        try {
          payload = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        if (payload.t) text += payload.t;
        else if (payload.done) sawDone = true;
        else if (payload.error) sawError = payload.error;
      }
    }

    if (sawError) return fail("ask  streamed SSE", `stream emitted an error frame: ${String(sawError).slice(0, 160)}`);
    if (!text.trim()) return fail("ask  streamed SSE", "no `data:{t}` text frames received");
    if (!sawDone) return fail("ask  streamed SSE", "never received the terminal `data:{done:true}` frame");
    pass("ask  streamed SSE", `${text.trim().length} chars, {done:true} seen — "${text.trim().slice(0, 60).replace(/\s+/g, " ")}…"`);
  } catch (e) {
    fail("ask  streamed SSE", `request failed: ${e?.message || e}`);
  } finally {
    t.done();
  }
}

// ── 3) brief: must return a non-empty narrative ────────────────────────────────
async function checkBrief() {
  const t = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/agent/brief`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ context }),
      signal: t.signal,
    });
    if (!res.ok) return fail("brief", `HTTP ${res.status} from /api/agent/brief`);
    let body;
    try {
      body = await res.json();
    } catch {
      return fail("brief", "response was not JSON");
    }
    if (body && body.available === false) {
      return fail("brief  non-empty text", "got {available:false} — brain NOT live, fell back to baked brief");
    }
    if (body && body.error) {
      return fail("brief  non-empty text", `brain errored: ${String(body.error).slice(0, 160)}`);
    }
    const text = String(body?.text || "").trim();
    if (!text) return fail("brief  non-empty text", "empty text in response");
    pass("brief  non-empty text", `${text.length} chars — "${text.slice(0, 60).replace(/\s+/g, " ")}…"`);
  } catch (e) {
    fail("brief  non-empty text", `request failed: ${e?.message || e}`);
  } finally {
    t.done();
  }
}

console.log(`\nHelm live-brain smoke test → ${base}\n`);
await checkStatus();
await checkAsk();
await checkBrief();

console.log("");
if (failed) {
  console.error("✗ SMOKE FAILED — the live Claude brain is NOT fully working on this deploy.");
  console.error("  Likely causes: ANTHROPIC_API_KEY not set on the host · /api/agent functions not deployed · spend cap hit.");
  process.exit(1);
} else {
  console.log("✓ SMOKE PASSED — status available, ask streams SSE, brief returns text. The brain is live.");
  process.exit(0);
}
