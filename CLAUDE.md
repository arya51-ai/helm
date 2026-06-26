# Helm — project guide for Claude Code

Loaded every session. Encodes the stable facts so they aren't re-derived, and the footguns so they aren't re-triggered. Read it before touching `server/agent.mjs`.

## What Helm is

Helm is an "AI COO in your pocket" for an owner who runs several different businesses (restaurant / retail / hotel / fuel) AND holds personal investments. It puts every revenue source plus the portfolio on one screen, normalizes them to a single yardstick (return on the capital deployed in each), reads the whole "empire," and says what matters right now and what to do about it. React + Vite + TypeScript frontend; an Express / Vercel-serverless backend that brokers Claude so the API key never reaches the browser. Data is plug-and-play: it runs on bundled mock data out of the box and flips to real (Plaid / TallyPrime / CSV / Z-report) the moment connectors are configured.

## Architecture & file map

- Frontend lives in `src/` — `components/` (Brief, Net worth, Businesses, detail, editors, Ask), `lib/` (the intelligence layer), `data/` (normalized `Business` configs, layered loader).
- Every revenue source reduces to one normalized `Business` config (`src/types.ts`); the same UI renders any type, so adding a source is additive.
- The AI brain: `api/agent/*.js` are thin Vercel serverless wrappers that delegate to shared handlers exported from `server/agent.mjs`. The client calls them via `src/lib/agent.ts`.
- The same handlers mount into Vite dev (`vite.config.ts`, under `/api/agent`) and the standalone Express app (`server/agent.mjs` `createAgentApp()`, run by `server/index.mjs`), so dev and prod share ONE code path.
- Routes: `GET /status`, `POST /ask` (SSE stream), `POST /brief`, `POST /draft`, `POST /vision`.
- Rule-engine fallbacks (used whenever the model is unavailable) live in `src/lib/ask.ts` and `src/lib/insights.ts`. The baked brief floor is `src/lib/bakedBrief.ts`. Owner-state is assembled by `buildAgentContext()` in `src/lib/agent.ts`.
- Other connectors: `server/connector.mjs` (Plaid), `server/tally.mjs` (TallyPrime).

## AI / COST CONTRACT (CRITICAL — read before touching `server/agent.mjs`)

These are hard rules, not preferences.

- **Graceful degradation, always.** No `ANTHROPIC_API_KEY` → `env().configured` is false → every route returns `{ available: false }` and the frontend falls back to the rule engine (`source: "rules"`). The app must NEVER block or break on the model. Any client call that errors also falls back; never throws to the caller. Preserve this in every change.
- **The AI is intentionally OFF by default** (no key in `.env`) because a runaway auto-firing Opus brief once drained the budget (~$11.55 in one sitting). Turn it on only for live demos. Before deploying, verify the host (Vercel) has no stray `ANTHROPIC_API_KEY` unless intended — the `/api/agent` relay is unauthenticated and billed to whatever key is set.
- **The Brief is the single most expensive call** (Opus + extended thinking + a tool loop). It is protected by a 3-tier gate in `handleBrief`: (0/1) free σ-anomaly + alert rule gate (`hasMaterialSignal`) → (2) cheap Haiku "checker" (`briefCheck`, returns material-change yes/no) → (3) Opus "maker" writes, plus a hard per-day cap (`briefBudgetOk` server-side, `DAILY_OPUS_CAP` + fingerprint cache client-side). NEVER remove or weaken this gate. Any NEW expensive call needs a similar gate.
- **Prompt caching is load-bearing.** The `SYSTEM` constant in `server/agent.mjs` MUST stay byte-stable — never interpolate dates, ids, or per-request data into it, or you break the `cache_control: { type: "ephemeral" }` prefix cache and costs jump. `SYSTEM_WITH_TOOLS` (= `SYSTEM` + `TOOLS_DOC`) is the cached prefix sent as the `system` block. Per-request data goes ONLY in the user turn, inside `<owner_state>` tags (via `userContent()`).
- **Models are env-configurable** (see `env()`):
  - `HELM_ASK_MODEL` — default `claude-sonnet-4-6`. Interactive paths: `/ask`, `/draft`. Vision (`/vision`) is pinned to Sonnet.
  - `HELM_BRIEF_MODEL` — default `claude-opus-4-8`. The once-daily brief maker.
  - `HELM_CHECK_MODEL` — default `claude-haiku-4-5`. The cheap material-change gate.
  - `HELM_BRIEF_MODE` — `off` | `rules` | `haiku-gated` (default) | `always`.
  - `HELM_BRIEF_DAILY_CAP` — hard backstop, max Opus briefs/day (default `1`).
- **Owner-facing prompts must obey the HARD RULES already in `SYSTEM`:** use ONLY numbers present in `<owner_state>`; never invent, estimate, or round in a figure that isn't given; be specific and prescriptive (name the business, cite the number, state the action); lead with the answer; no hedging, no boilerplate disclaimers, no emoji. The model may RECOMMEND and DRAFT actions but never sends a message or moves money. Vision/extraction returns `null` for anything not clearly visible — never guessed.
- **Tools.** `/ask` and `/brief` run a bounded tool loop (`runToolLoop`, max 5 / 3 rounds) over executors in `runTool` (`get_business`, `compare_roic`, `reallocate_what_if`, `explain_anomaly`, `pace_to_goal`, `hotel_kpis`). The final answer turn uses `tool_choice: { type: "none" }`. Tools read full-precision numbers from the owner_state payload — `reallocate_what_if` must be used for cash-move math, never eyeballed from rounded ROIC.

## Conventions

- TypeScript + React function components. The `api/` wrappers stay thin — logic lives in the shared handlers in `server/agent.mjs`.
- Every connector follows the same pattern: feature-detect availability → fall back gracefully if unavailable. Mirror it for anything new.
- Match the repo's house style: a long explanatory header comment at the top of each `lib/`/`server/` file explaining what it does and why, plus inline "why" comments on the non-obvious bits. Keep it.
- **Currency: money is USD everywhere EXCEPT `.motel` data, which is Canadian dollars (CA$) and must NOT be converted to USD.** Hotel (chain) figures are normalized to USD; the independent-motel block (`motelBlock` in `src/lib/agent.ts`, Northwood Motel) stays in CAD and the prompt says CA$ / never convert. Chain hotels read in RevPAR/RGI/GOP/PIP terms; independent motels read in occupancy / nightly rate / booking channel / OTA commission / season terms (never RevPAR Index, GOP, comp set, or PIP).

## Commands

From `package.json` (`"type": "module"`):

- `npm run dev` — Vite dev server (http://localhost:5173). Mounts all connectors (`/api/plaid`, `/api/tally`, `/api/agent`) inside Vite; no second process needed.
- `npm run build` — `tsc --noEmit && vite build`.
- `npm run preview` — preview the production build.
- `npm run server` — `node server/index.mjs`, the STANDALONE connector server (uses `PORT`, default 8787).
- `npm run smoke` — `node scripts/smoke-deploy.mjs`.

Verification: browser-observable changes can be checked via the dev server. **AI-route changes cost real API calls, so verify them sparingly (on demos only).** After editing `server/agent.mjs`, run `node --check server/agent.mjs` for a free syntax check before anything else.

## Gotchas

- `.env` is git-ignored; `.env.example` documents the full contract (Plaid, Tally, `PORT`, and the Claude/Brief vars). Copy it to `.env` to configure.
- `api/agent/*.js` are ESM (`package.json` has `"type": "module"`). `server/*` files use the `.mjs` extension.
- Never put secrets in client code — the entire reason Claude (and Plaid) are brokered server-side. The key is loaded from `../.env` relative to `server/agent.mjs` (not `process.cwd()`); on Vercel it's a real injected env var and dotenv is a harmless no-op.
- The client also has its own brief defenses in `src/lib/agent.ts`: a localStorage fingerprint cache (`BRIEF_CACHE_KEY`) and `DAILY_OPUS_CAP` that mirror the server gate. Keep the two caps in sync if you change one.
- `buildAgentContext` keeps `capitalDeployed` / `roic` / `monthlyProfit` UN-rounded on purpose (reallocation math); display-only fields are rounded. Don't round the exact ones.
