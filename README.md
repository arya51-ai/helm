<p align="center">
  <img src="public/icon-512.png" alt="Helm" width="96" height="96" />
</p>

<h1 align="center">Helm</h1>

<p align="center"><b>An AI COO for owners with more than one thing going on.</b></p>

<p align="center">
  <img alt="status" src="https://img.shields.io/badge/status-prototype-7c6cf5" />
  <img alt="pwa" src="https://img.shields.io/badge/PWA-installable-2bb673" />
  <img alt="stack" src="https://img.shields.io/badge/React%2018%20·%20Vite%20·%20TypeScript-0a0b10" />
  <img alt="license" src="https://img.shields.io/badge/license-proprietary%20·%20all%20rights%20reserved-b3413a" />
</p>

> **Source-available, not open source.** This repository is published for reference and
> portfolio review only. © 2026 Arya Mehta. All rights reserved. No copying, reuse, modification,
> or redistribution without prior written permission. See [LICENSE](LICENSE).

---

Most small-business owners don't own just one thing. They own a franchise *and* a shop, or a
couple of locations *and* a brokerage account. No tool speaks all of those at once — so the
owner lives in five dashboards and a spreadsheet.

**Helm** puts every revenue source on one screen, normalizes them to the same yardstick
(return on capital, contribution to net worth), and every morning tells you the one or two
things worth your attention — and what to do about them. Think less "AI dashboard," more
*chief operating officer in your pocket.*

## What it does

- **🧭 Morning brief** — a ranked feed of what changed and what to do, written in plain English
  ("Riverside is down 22% today — staffing looks light for a Friday"). Not charts you have to
  interpret; conclusions you can act on.
- **💰 One net worth** — businesses *and* investments on a single capital yardstick, with cash
  on hand and a simple runway projection. Every figure converted to one display currency so the
  totals are honest (a Subway in Ontario rings up CAD; a shop in Ohio rings up USD).
- **🏪 Businesses** — each business as a card: today's revenue vs. a typical day, week/month
  trends, average ticket, profit, and return on capital. Tap in for detail and peer benchmarks.
- **💬 Ask Helm** — ask questions about your own numbers in natural language; answers come from
  your real metrics, never fabricated.
- **➕ Add anything** — link a bank or brokerage (Plaid), pull daily sales from accounting
  software (TallyPrime), or upload a CSV/Z-report. Adding a new business is just adding one
  normalized config — the UI renders any of them.

## How Helm uses Plaid

Helm uses **Plaid** so an owner can securely link their real bank and brokerage accounts and
see actual balances and holdings alongside their businesses — instead of typing numbers by hand.

| Plaid product | What Helm does with it |
| --- | --- |
| **Investments** (`/investments/holdings/get`) | Pulls real holdings (ticker, shares, cost basis, value) into the owner's portfolio so net worth reflects the market, not a stale spreadsheet. |
| **Balances** (`/accounts/balance/get`) | Reads available cash across depository accounts to show "idle cash" and a runway estimate on the net-worth screen. |

**Security model:** the Plaid `client_id` and secret live only in server-side environment
variables and are used only by the connector (`server/connector.mjs`). The browser never sees
them. Link runs through Plaid Link; the resulting `access_token` is exchanged and stored
server-side (`server/.tokens.json`, gitignored) — it never reaches the client. If the connector
isn't running, the app degrades gracefully to manual CSV / public price data, so a link is never
required to use Helm.

See **[PLAID_SETUP.md](PLAID_SETUP.md)** to run it (works in a no-keys demo mode out of the box,
and flips to live Plaid Sandbox the moment keys are present), and **[PRIVACY.md](PRIVACY.md)**
for how account data is handled.

## Privacy & security

- Account credentials are **never** entered into Helm — linking happens inside Plaid Link.
- Plaid secret and access tokens are **server-side only**; nothing sensitive is shipped to the browser.
- `.env` and link tokens are gitignored and never committed.
- Helm does not sell or share account data. Full detail in **[PRIVACY.md](PRIVACY.md)**.

## Tech

Vite · React 18 · TypeScript · Tailwind · Recharts · lucide-react, with a small Express
connector for the server-side Plaid / TallyPrime calls. Ships as an installable PWA.

## Getting started

```bash
npm install
npm run dev
```

Then open **[http://localhost:5173](http://localhost:5173)** — runs with bundled sample data, no setup needed.

Optional, to link real accounts:

```bash
cp .env.example .env # add your Plaid keys (Sandbox is free); see PLAID_SETUP.md
npm run dev          # the connector now talks to Plaid Sandbox
```

## Architecture

Every revenue source — a restaurant, a retail shop, a brokerage account — is reduced to one
normalized `Business` config (`src/types.ts`). The intelligence layer (`src/lib/analytics.ts`,
`src/lib/insights.ts`) computes metrics and the ranked brief from those configs, so the same UI
renders any business type and adding a new source is additive, not a rewrite.

```
src/
  data/        normalized business configs, layered loader (sample ← synced ← imported), overrides
  lib/         analytics, insights ("COO brain"), Plaid/Tally/quotes clients, currency, import
  components/  Brief · Net worth · Businesses · detail · editors · Ask
server/        Express connector — Plaid + TallyPrime (keys stay here, never in the browser)
```

---

<sub>© 2026 Helm. All rights reserved. Prototype — figures shown on sample data are illustrative.</sub>
