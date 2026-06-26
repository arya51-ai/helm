---
name: helm-dev-deploy
description: Use when running Helm locally, building, deploying, configuring env vars, or wiring the connectors/cron. Covers the two-half deploy (stateless brain on Vercel + stateful Plaid host), the smoke test, and the cost-safety env switches.
---

# Helm — run, deploy & ops

## Run locally
- `npm run dev` — Vite serves the app AND mounts the connectors at `/api/plaid`, `/api/tally`, `/api/agent` (via plugins in `vite.config.ts`, each try/catch-wrapped). This is all you need for local dev.
- `npm run server` — the standalone Node connector (`server/index.mjs`) for when the frontend is hosted separately.
- `npm run build` — `tsc --noEmit && vite build` (type-check then bundle to `dist/`). Run this before claiming a change compiles.
- `npm run smoke <url>` — `scripts/smoke-deploy.mjs`: proves the live brain isn't silently degraded (asserts `/status` available, `/ask` streams SSE, `/brief` is live — note: post-gate, `/brief` may legitimately return `{skipped:true}`, which the smoke test treats as live).

## Deploy — two halves
The app degrades to fully-offline with no backend, so you can ship in stages.
1. **Stateless brain → Vercel serverless.** `api/agent/*.js` import the handlers from `server/agent.mjs` (one code path, dev ≡ prod). Set `ANTHROPIC_API_KEY` in Vercel env **+ a console spend cap**. No separate host needed for the brain.
2. **Stateful Plaid/Tally → a persistent host** (Railway/Render) running `npm run server` (writes link tokens to disk). Wire it via `rewrites` in `vercel.json` so the frontend's relative `/api/...` hits it.
Config in `DEPLOY.md`, `vercel.json` (build + PWA cache headers), `.vercelignore` (excludes `.env`, internal docs).

## Env vars (`.env`, see `.env.example`)
- AI: `ANTHROPIC_API_KEY` (blank ⇒ fully offline, **zero** model spend), `HELM_ASK_MODEL`, `HELM_BRIEF_MODEL`, `HELM_CHECK_MODEL`, `HELM_BRIEF_MODE` (`off|rules|haiku-gated|always`), `HELM_BRIEF_DAILY_CAP`.
- Plaid: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`. Tally: `TALLY_URL`. Cron: `HELM_CRON=1`. Standalone port: `PORT`.

## Cost safety (don't skip)
- AI is **off by default** (blank key) — and that is a safe state: no key → baked brief, no Opus calls. To confirm a host is off, check its env has no `ANTHROPIC_API_KEY`.
- The `/api/agent` relay is **unauthenticated** (billed to your key). Keep the brief cost gate (see [[helm-ai-brain]]) and a console spend cap.
- **Cron caution:** `server/cron.mjs` `startNightlyRefresh` is opt-in (`HELM_CRON=1`) and its `onRun` is a placeholder. If you wire brief regeneration there, it MUST go through gated `handleBrief` (never a raw Opus call) — a nightly raw brief is exactly the drain pattern the gate exists to prevent.

## Gotchas
- Vercel functions are stateless — the server-side daily-brief counter resets per cold start; the durable cap lives on the client (localStorage). See [[helm-ai-brain]].
- Re-running `npm run smoke` against a long-lived server twice in one day can hit the daily cap on the 2nd run (returns `{skipped}` — still a pass under the updated smoke test). On Vercel (stateless) this doesn't happen.
- `npm run build` runs `tsc --noEmit` first — a type error fails the build before bundling.
