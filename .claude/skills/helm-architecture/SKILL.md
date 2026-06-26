---
name: helm-architecture
description: Use when working on Helm's data flow, app structure, state, or any integration (Plaid, FX, connectors) — especially when adding a data source or a feature that could fail. Covers the layered loader, the analytics backbone, and the graceful-degradation contract that every integration must follow.
---

# Helm — architecture & the degradation contract

Helm is a React + Vite + TypeScript PWA. Logic is pure functions in `src/lib/`; data seeds + storage in `src/data/`; UI in `src/components/`. A Node/Express connector layer (`server/*.mjs`) is mounted inside Vite dev (`vite.config.ts`) and also runs standalone (`server/index.mjs`).

## The layered data loader (`src/data/source.ts` → `loadBusinesses()`)
Data is merged **by business `id`**, each layer overriding the last, then converted to one display currency (USD) **once at the end**:
1. **Sample** seeds (`src/data/businesses.ts`, `hotels.ts`, `fuel.ts`, `multiUnit.ts`) — gated by the active **persona** (`src/data/profiles.ts`: independent / mixed / group / aahoa / fuel / multi / northwood / blank).
2. **Real** `/data.json` (scraped/real data) merges over sample.
3. **Imported** uploads — localStorage `helm:imported:v1` (`upsertImported`).
4. **Overrides** — localStorage `helm:overrides:v1` (per-business name/capital/margin/currency).
5. **Removed** — localStorage `helm:removed:v1` filters ids out.

Persona gating happens **after** merge, so real/imported businesses always pass through; only sample businesses are filtered by persona. `extendSeriesToToday()` (`src/data/rng.ts`) carries lagging POS series forward with seeded noise so "today" stays current between scrapes; a real scrape just replaces the tail.

## The analytics backbone (single source of truth)
- `src/lib/analytics.ts` — `Metrics` per business + `EmpireSummary`. Everything (UI cards, insights, forecast, the AI owner_state) reads from here. **Numbers live here; the AI never invents them.**
- `src/lib/insights.ts` — builds + ranks insights by `priority` (anomalies, deep patterns, capital allocation, momentum). `src/lib/deepInsights.ts` + `patterns.ts` = the rule judgments (YoY, weekday shape, seasonality). `src/lib/anomalies.ts` = σ-scored cross-empire "what changed".
- `src/lib/bakedBrief.ts` + `src/lib/ask.ts` = the **offline rule engine** — first-class and production-ready, not stubs. Claude only upgrades them.

## ⚠️ The graceful-degradation contract (the load-bearing invariant)
**Every optional integration is feature-detected and falls back; nothing throws to the caller; the app never blocks on an external thing.**
- Status probes return a shape like `{ available | reachable, configured, demo }` (`agentStatus`, `plaidStatus`, `tallyStatus`).
- No key / unreachable → fall back to the rule engine / CSV / manual entry; no error modals, no spinners-of-death.
- All `localStorage` access is wrapped in try/catch (see `overrides.ts`, `removed.ts`) — quota/private-mode safe.
- FX (`fxFeed.ts`) fails silently to cached `RATES_TO_USD` (`currency.ts`).
- The Vite connector plugins each wrap mount in try/catch so one dead connector doesn't break dev.

**When you add an integration, it MUST follow this contract.** A new feature that can throw on a missing key/network is a bug.

## Conventions
- camelCase functions/vars; PascalCase components/types; `/** */` on exported fns/types.
- No `any`; prefer union types. Pure logic in `lib/`; derived state via `useMemo`; effects in `useEffect`.
- Series are always oldest→newest, ISO dates (`"2026-06-02"`), money in USD after conversion (native currency only labels the source — except independent-motel CAD, which is never converted; see [[helm-domain-verticals]]).

## Gotchas
- Display rounding vs exact fields: keep `roic`/`capitalDeployed`/`monthlyProfit` un-rounded where the AI tools compute on them (see [[helm-ai-brain]]).
- Imports arrive in their native currency — convert **before** merging into USD state (`mergeBusiness` in `App.tsx`), or empire totals skew until the next full load. See [[helm-data-imports]].
- Don't interpolate volatile values (dates, ids) into cached AI prompts — it silently kills prompt caching.
