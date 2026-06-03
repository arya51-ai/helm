# Helm connector

A tiny server that brokers **Plaid** and proxies **live Yahoo quotes** — both must run
server-side (the Plaid secret can never reach the browser; Yahoo blocks browser CORS).

## How it runs
- **Dev:** mounted automatically inside `npm run dev` at `/api/plaid` (see `vite.config.ts`).
  No second process, no CORS. If it fails to mount, Plaid is simply disabled and the app
  falls back to Yahoo/CSV — it can never break the dev server.
- **Production / static host:** run standalone with `npm run server` (default port 8787) and
  have the static frontend proxy `/api` to it.

## Endpoints (under `/api/plaid`)
| Route | Purpose |
|---|---|
| `GET  /status` | feature detection → `{ configured, demo, env }` |
| `POST /create_link_token` | start Plaid Link |
| `POST /exchange_public_token` | durable access token (kept server-side in `.tokens.json`) |
| `POST /holdings` | investment holdings → Helm shape |
| `POST /balances` | cash on hand — sums linked depository (checking/savings) balances |
| `GET  /quotes?symbols=AAPL,MSFT` | live Yahoo quotes (no key, no browser CORS) |

## Setup (real Plaid)
1. Get free sandbox keys: https://dashboard.plaid.com/signup → Keys.
2. `cp .env.example .env` (repo root) and fill `PLAID_CLIENT_ID` / `PLAID_SECRET`.
3. `npm run dev` → **Connect with Plaid** runs the real Link flow. Sandbox login:
   `user_good` / `pass_good`.

## Demo mode (no keys)
With no keys set, `/holdings` returns a realistic sandbox portfolio so the whole "connect →
holdings → save" flow is demoable today, and flips to real linking the moment keys are added.
**Yahoo `/quotes` works regardless** (no key needed). Secrets and `.tokens.json` are git-ignored.

## Tally (`/api/tally`)
TallyPrime is India's dominant SMB accounting system. This connector pulls a daily sales
series from Tally's local HTTP-XML gateway.
| Route | Purpose |
|---|---|
| `GET  /status` | `{ configured, demo }` |
| `POST /sync` `{ days }` | daily sales series (INR), normalized to Helm's shape |

Turn on Tally's gateway (in Tally: **F1 → Settings → Connectivity → enable XML/HTTP**, usually
port 9000) and set `TALLY_URL=http://localhost:9000` in `.env`. With no URL it serves a
realistic **INR demo pharmacy**, so the connect flow is demoable today. The XML/Day-Book parse
is best-effort (Tally's shape varies by version) and falls back to demo on any error.
