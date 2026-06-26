---
name: helm-ai-brain
description: Use when working on any of Helm's Claude/AI features — the morning Brief, Ask Helm, Action drafts, Snap-a-report vision, model selection, prompt caching, or the brief cost gate. Anything touching server/agent.mjs, api/agent/*.js, or src/lib/agent.ts. Read this BEFORE adding a new model-backed feature.
---

# Helm — the AI brain (the "AI COO")

Helm's differentiator is one Claude that reads the owner's WHOLE empire (every business + investments) at once. Claude only **prioritizes, explains, and drafts** — it never invents numbers. All numbers come from `analytics.ts`.

## Architecture (the key boundary)
- The API key **never reaches the browser**. The server brokers Claude. Two deploy shapes share **one code path**:
  - `server/agent.mjs` — the real handlers (`handleStatus/handleAsk/handleBrief/handleDraft/handleVision`) + an Express app (mounted in Vite dev via `vite.config.ts`).
  - `api/agent/*.js` — thin Vercel serverless functions that import those same handlers.
- **Three-tier graceful degradation (never break this):** real Claude → offline rule engine (`src/lib/ask.ts`, `src/lib/bakedBrief.ts`) → never null / never throws. With **no key**, every route returns `{ available:false }` and the UI falls back. The app must never block or crash on the model.
- Client entry: `src/lib/agent.ts` — `agentStatus()` (cached feature-probe), `askAgent()` (SSE stream), `generateBrief()`, `draftAction()`. `buildAgentContext(ctx)` builds the compact `owner_state` the model reasons over.

## Models (set via env; aliases, no date suffix)
| Path | Default | Env | Why |
|---|---|---|---|
| Ask / Draft | `claude-sonnet-4-6` | `HELM_ASK_MODEL` | low-latency, interactive |
| Brief **maker** | `claude-opus-4-8` | `HELM_BRIEF_MODEL` | once-daily, adaptive thinking |
| Brief **checker** | `claude-haiku-4-5` | `HELM_CHECK_MODEL` | cheap material-change gate |
| Vision | `claude-sonnet-4-6` | (hardcoded) | report photo → JSON |

When adding/altering a model call, **invoke the `claude-api` skill first** — it has the authoritative model IDs and params. Opus 4.8 / Sonnet 4.6 use `thinking:{type:"adaptive"}` (+ `output_config.effort`); `budget_tokens`/`temperature` 400. Haiku 4.5 does **not** support `effort` — the checker runs `thinking:{type:"disabled"}`, tiny `max_tokens`, no tools.

## The owner_state contract
`buildAgentContext()` (src/lib/agent.ts) sends a compact projection. **Fields the tools compute on stay UN-rounded** (`capitalDeployed`, `roic`, `monthlyProfit`, anomaly σ/actual/expected) — rounding ROIC throws `reallocate_what_if` off by hundreds. Display-only fields are rounded. The `SYSTEM` prompt is kept **byte-stable** (no dates/ids interpolated) so it caches as a prefix (`cache_control:{type:"ephemeral"}`). The volatile owner_state goes in the user turn. Tools (`get_business`, `compare_roic`, `reallocate_what_if`, `explain_anomaly`, `pace_to_goal`, `hotel_kpis`) read EXACT numbers — never let the model eyeball rounded figures.

## ⚠️ COST DISCIPLINE — the $11.55 lesson (do not regress this)
The Brief is the priciest call in Helm: a tool loop **plus** a final turn, all on Opus with extended thinking (up to ~6 Opus calls). It used to fire on **every app open** (a `useEffect` in `App.tsx` with no cache and no gate) → it drained the budget. The fix is a layered gate; **never reintroduce an unconditional brief trigger.**

The gate (cheapest first), in `generateBrief()` (client) + `handleBrief()` (server):
1. **GATE 0 — free fingerprint cache** (`helm:brief:v1` in localStorage). Same brief-relevant data as last time → return cached text, zero network/model cost.
2. **GATE 1 — free rule check** (`hasMaterialSignal`): any σ-anomaly (already filtered to |vsExpected|≥0.08 in `buildAgentContext`) or `alert` insight? No → skip the model entirely.
3. **GATE 2 — cheap Haiku checker** (`briefCheck`): given owner_state + the previous brief, decide `{materialChange}`. Only `true` reaches the maker.
4. **MAKER — Opus** writes (bounded: `maxRounds:3`, capped `max_tokens`).
5. **BACKSTOP — hard daily cap** (`HELM_BRIEF_DAILY_CAP`, default 1) enforced durably on the client AND best-effort on the server.

`HELM_BRIEF_MODE`: `off | rules | haiku-gated (default) | always`.

**Rules to keep:**
- Keep adaptive thinking ON for the Opus maker — disabling it makes Opus 4.8 write verbose reasoning into the answer.
- The checker must stay cheap: no tools, no thinking, low `max_tokens`. If it errors/unparses, **fail toward the rule decision** (fire the maker) — it's still bounded by the daily cap and the baked brief is the floor.
- The **baked brief** (`bakedBrief.ts`) is always the floor — the card is never empty while the model stays quiet.
- The product North-star is **cost per accepted change**: if owners ignore most suggestions, you're spending tokens to be noise.
- The `/api/agent` relay is **unauthenticated** (billed to your key). The gate + a console spend cap are what keep it safe. Any cron/automation that regenerates the brief MUST go through gated `handleBrief`, never a raw Opus call.

## Gotchas
- `agentStatus()` caches the probe for the session — a key added at runtime won't show until reload.
- Vision/draft/ask each have their own degradation; don't assume one being live means all are.
- Structured outputs are supported on these models, but the codebase parses JSON tolerantly (see `handleVision`'s first-`{…}` regex + safe fallback) — match that style for new JSON-returning calls.
