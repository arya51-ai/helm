# Helm prompt evals

A small regression net for the AI layer. Save real `owner_state` snapshots as fixtures,
assert what a good answer must (and must not) say, and re-run after any change to
`SYSTEM` or a route in `server/agent.mjs`. The point: change a prompt and **know** you
didn't regress a known judgment call — instead of discovering it live in a demo.

This is dev-only tooling. It is not imported by the app or the serverless functions.

## Run

```bash
# Free — loads & validates every fixture, then exits (AI is off, nothing is called):
npm run eval

# Real — exercises the live model. This SPENDS tokens (a few cents per full pass):
ANTHROPIC_API_KEY=sk-... npm run eval
```

A pass prints `PASS/FAIL` per fixture and exits non-zero if any fail (CI-friendly later).
The per-day Opus backstop is lifted for the run, so multiple brief fixtures can fire.

## What a fixture looks like

One JSON file per scenario in `fixtures/`:

```jsonc
{
  "name": "short label",
  "why": "what failure mode this guards",
  "kind": "ask" | "brief" | "draft",
  "question": "...",          // ask only
  "action": "...",            // draft only
  "briefMode": "always",      // brief only — force the maker; omit to test the cost gate
  "context": { /* owner_state, exactly as buildAgentContext() in src/lib/agent.ts emits it */ },
  "expect": {
    "mustMention":    ["riverside"],          // case-insensitive substring, all required
    "mustNotMention": ["could consider"],  // none may appear
    "mustMatch":      ["11[,.]?2", "/yr"],  // regex (case-insensitive), all required
    "mustNotMatch":   ["winning share"],
    "gate":           { "skipped": true }   // brief only — assert on the raw result object
  }
}
```

Assertions are intentionally **lenient** (substring / loose regex) so the first live pass
doesn't flake on phrasing. Tighten them as the wording stabilizes.

## The feedback loop (this is the whole point)

When a demo — or your own testing — produces a **wrong-but-plausible** read:

1. Copy that exact `owner_state` into a new `fixtures/*.json`.
2. Write the `expect` for what the answer *should* have said.
3. Add the same case to the `JUDGMENT CALLS` block in `SYSTEM` (server/agent.mjs).
4. Re-run `npm run eval` until it's green.

That turns every miss into a permanent guardrail — the empirical loop that makes Helm's
judgment a moat a generic wrapper can't copy.

## Current fixtures

| File | Guards |
|---|---|
| `ask-reallocation.json` | Cash-move answers call `reallocate_what_if` and quote the exact $/yr delta, not a hand-wave. |
| `ask-rgi-trend.json` | A healthy RGI **level** doesn't mask a falling **trend** — lead with the trend, prescribe a rate move. |
| `ask-motel-cad.json` | Independent-motel money stays in CA$ (never USD), and the answer leads with the direct-booking lever. |
| `brief-anomaly.json` | The brief leads with the real σ-anomaly and cites the actual number (briefMode `always`). |
| `brief-quiet-day.json` | The cost gate skips a quiet day before any model call — the guard against the Opus re-fire drain. |

## Known gap (surfaced by building this)

The `JUDGMENT CALLS` "holiday ≠ anomaly" example isn't fully testable yet: `owner_state`
carries no holiday signal, so the model can only catch it if `empire.asOf` happens to land
on a date it recognizes. If holiday-awareness matters, add an `isHoliday` / `dayNote` field
in `buildAgentContext` (src/lib/agent.ts) and a fixture to lock it in.
