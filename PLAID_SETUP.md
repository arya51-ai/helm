# Plaid Setup (real bank/brokerage linking)

Helm links investment accounts through **Plaid** — the same rails Venmo, SoFi, and Robinhood
use. The Plaid secret must live on a server, never in the browser, so Helm ships a tiny
connector (`server/connector.mjs`) that's mounted inside the Vite dev server automatically.

## It already works in demo mode (no setup)

Run `npm run dev` and go to **Portfolio → Sync → Bank or brokerage (Plaid)** → *Connect Plaid
Sandbox*. With no keys, the connector returns a realistic sandbox portfolio so you can see the
full link → holdings → net-worth flow today. This is what shows in a demo.

## Go live with real linking (free, ~3 minutes)

1. Create a free Plaid account → https://dashboard.plaid.com/signup
2. In the dashboard: **Developers → Keys**. Copy your **client_id** and your **Sandbox secret**.
3. In the project root: `cp .env.example .env`, then paste the values:
   ```
   PLAID_CLIENT_ID=your_client_id
   PLAID_SECRET=your_sandbox_secret
   PLAID_ENV=sandbox
   ```
4. Restart `npm run dev`. The connector now reports `configured: true`.
5. Portfolio → Sync → **Connect with Plaid** → Plaid Link opens. Use the Sandbox test login:
   - username **`user_good`**, password **`pass_good`** (any institution, e.g. "Vanguard")
   - It links a sandbox investment account and pulls **real Plaid-shaped holdings** into Helm.

To link *actual* personal accounts, request Production access in the Plaid dashboard and set
`PLAID_ENV=production` (Plaid reviews the app first — a launch step, not needed for the pitch).

## How it's wired

- `GET /api/plaid/status` → `{ configured, demo, env }` (the UI feature-detects).
- `POST /api/plaid/create_link_token` → opens Plaid Link.
- `POST /api/plaid/exchange_public_token` → swaps Link's public token for a durable access
  token, kept server-side in `server/.tokens.json` (gitignored).
- `POST /api/plaid/holdings` → `investmentsHoldingsGet`, normalized to Helm's holding shape.

The frontend (`src/lib/plaid.ts` + the Plaid view in `InvestmentsSheet.tsx`) degrades
gracefully: connector down → falls back to Yahoo Finance / CSV upload, which always work.

## Production deploy note

For a static frontend (Vercel/Netlify) the in-Vite connector isn't present, so run the
standalone connector (`npm run server`, port 8787) behind the same origin (or set a proxy /
rewrite for `/api/plaid/*`). The frontend already calls relative `/api/plaid/*` paths.
