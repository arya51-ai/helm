// Helm prompt-regression evals
// ─────────────────────────────────────────────────────────────────────────────
// Runs saved owner_state fixtures through the REAL exported handlers in
// server/agent.mjs and checks lightweight assertions on the output. This is the
// safety net for prompt changes: edit SYSTEM / a route, re-run, and know you
// didn't regress a known judgment call — instead of finding out live in a demo.
//
// Two truths to keep in mind:
//   • These exercise the live model, so they DO spend tokens. No key → it loads
//     the fixtures (validating them) and exits clean without calling anything.
//   • The daily Opus backstop is deliberately lifted for the run (HELM_BRIEF_DAILY_CAP),
//     and brief fixtures can force the maker with "briefMode": "always". A quiet-day
//     fixture instead asserts the cost GATE skips (≈free — it returns before the model).
//
// Run free (no model, just validates fixtures):   npm run eval
// Run for real (spends a few cents):               ANTHROPIC_API_KEY=sk-... npm run eval
//
// Add a fixture whenever a demo produces a wrong-but-plausible read — that case
// becomes a permanent regression test. See evals/README.md.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { handleStatus, handleAsk, handleBrief, handleDraft } from "../server/agent.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, "fixtures");

// Eval runs deliberately spend tokens — defeat the per-day Opus backstop for the run.
process.env.HELM_BRIEF_DAILY_CAP = "999";

function loadFixtures() {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      let fx;
      try {
        fx = JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf8"));
      } catch (e) {
        throw new Error(`Invalid JSON in fixture ${f}: ${e.message}`);
      }
      fx._file = f;
      return fx;
    });
}

// A minimal Express-compatible `res` that collects the SSE frames handleAsk writes.
function makeMockRes() {
  const writes = [];
  return {
    setHeader() {},
    flushHeaders() {},
    status() {
      return this;
    },
    json(obj) {
      writes.push({ json: obj });
    },
    write(s) {
      writes.push({ raw: s });
    },
    end() {},
    _writes: writes,
  };
}

function parseSSE(writes) {
  let text = "";
  let error = null;
  let availableFalse = false;
  for (const w of writes) {
    if (w.json) {
      if (w.json.available === false) availableFalse = true;
      continue;
    }
    const line = String(w.raw).trim();
    if (!line.startsWith("data:")) continue;
    try {
      const p = JSON.parse(line.slice(5).trim());
      if (p.t) text += p.t;
      else if (p.error) error = p.error;
    } catch {
      /* ignore non-JSON frames */
    }
  }
  return { text: text.trim(), error, availableFalse };
}

async function runFixture(fx) {
  if (fx.kind === "ask") {
    const res = makeMockRes();
    await handleAsk({ question: fx.question, context: fx.context }, res);
    const { text, error } = parseSSE(res._writes);
    return { text, error, raw: null };
  }
  if (fx.kind === "brief") {
    process.env.HELM_BRIEF_MODE = fx.briefMode || "haiku-gated";
    const r = await handleBrief({ context: fx.context, previousBrief: fx.previousBrief ?? null });
    return { text: String(r.text || "").trim(), error: r.error || null, raw: r };
  }
  if (fx.kind === "draft") {
    const r = await handleDraft({ action: fx.action, insight: fx.insight ?? null, context: fx.context });
    return { text: String(r.text || "").trim(), error: r.error || null, raw: r };
  }
  throw new Error(`unknown fixture kind: ${fx.kind}`);
}

function checkExpect(expect = {}, out) {
  const fails = [];
  const text = out.text || "";
  const hay = text.toLowerCase();

  if (expect.gate) {
    for (const [k, v] of Object.entries(expect.gate)) {
      const got = out.raw ? out.raw[k] : undefined;
      if (got !== v) fails.push(`gate.${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(got)}`);
    }
  }
  for (const s of expect.mustMention || []) {
    if (!hay.includes(String(s).toLowerCase())) fails.push(`missing mention: "${s}"`);
  }
  for (const s of expect.mustNotMention || []) {
    if (hay.includes(String(s).toLowerCase())) fails.push(`should not mention: "${s}"`);
  }
  for (const rx of expect.mustMatch || []) {
    if (!new RegExp(rx, "i").test(text)) fails.push(`no match: /${rx}/i`);
  }
  for (const rx of expect.mustNotMatch || []) {
    if (new RegExp(rx, "i").test(text)) fails.push(`should not match: /${rx}/i`);
  }
  if (out.error) fails.push(`route error: ${out.error}`);
  return fails;
}

async function main() {
  const fixtures = loadFixtures(); // validates every fixture's JSON up front

  const status = handleStatus();
  if (!status.available) {
    console.log(`\n  ${fixtures.length} fixtures loaded and valid.`);
    console.log("  AI is OFF (no ANTHROPIC_API_KEY) — these evals exercise the live model and DO spend tokens.");
    console.log("  Run a real pass with:  ANTHROPIC_API_KEY=sk-... npm run eval\n");
    process.exit(0);
  }

  console.log(`\nHelm prompt evals — ${fixtures.length} fixtures · live model (ask=${status.askModel} brief=${status.briefModel})\n`);
  let passed = 0;
  for (const fx of fixtures) {
    let out;
    let fails;
    try {
      out = await runFixture(fx);
      fails = checkExpect(fx.expect, out);
    } catch (e) {
      out = { text: "", error: String(e?.message || e), raw: null };
      fails = [`threw: ${out.error}`];
    }
    const ok = fails.length === 0;
    if (ok) passed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${fx._file}${fx.name ? "  — " + fx.name : ""}`);
    if (!ok) {
      for (const f of fails) console.log(`        ✗ ${f}`);
      const snip = (out.text || "(no text returned)").replace(/\s+/g, " ").slice(0, 180);
      console.log(`        ↳ output: ${snip}`);
    }
  }
  console.log(`\n${passed}/${fixtures.length} passed\n`);
  process.exit(passed === fixtures.length ? 0 : 1);
}

main().catch((e) => {
  console.error(`\neval runner error: ${e?.stack || e?.message || e}\n`);
  process.exit(2);
});
