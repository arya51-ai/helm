// Helm — Plaid connector
// ─────────────────────────────────────────────────────────────────────────────
// A tiny Express app that brokers Plaid on the server (the Plaid secret must NEVER
// reach the browser). Exposes four routes under /api/plaid:
//   GET  /status                 → { configured, demo, env }   (frontend feature-detects)
//   POST /create_link_token      → { link_token } | { demo:true }
//   POST /exchange_public_token  → { item_id }
//   POST /holdings               → { holdings:[Helm shape], institution }
//
// Runs in two modes, decided purely by whether real keys are present in the env:
//   • CONFIGURED (PLAID_CLIENT_ID + PLAID_SECRET set) → real Plaid Sandbox/Dev/Prod flow.
//   • DEMO (no keys) → serves a realistic sandbox holdings set with NO Plaid call, so the
//     end-to-end UX is fully demoable today and flips to real the moment keys are added.
//
// Mounted both inside the Vite dev server (see vite.config.ts) and as a standalone
// service (server/index.mjs). Same code path either way.
import "dotenv/config";
import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TOKENS_PATH = fileURLToPath(new URL("./.tokens.json", import.meta.url));

function env() {
  const clientId = process.env.PLAID_CLIENT_ID?.trim();
  const secret = process.env.PLAID_SECRET?.trim();
  const name = (process.env.PLAID_ENV || "sandbox").trim();
  return { clientId, secret, name, configured: Boolean(clientId && secret) };
}

// ── Token store (item_id → access_token), persisted so a restart keeps the link ──
function loadTokens() {
  try {
    return JSON.parse(readFileSync(TOKENS_PATH, "utf8"));
  } catch {
    return {};
  }
}
function saveTokens(map) {
  try {
    writeFileSync(TOKENS_PATH, JSON.stringify(map, null, 2));
  } catch {
    /* best-effort; in-memory still works for the session */
  }
}

// ── A realistic demo portfolio (used only when no real keys are configured) ──────
// Shaped exactly like Helm's `Holding`, so the frontend treats it identically to a
// real Plaid pull. Mirrors the app's portfolio so net worth stays coherent in demos.
const DEMO_HOLDINGS = [
  { ticker: "VOO", name: "Vanguard S&P 500 ETF", shares: 80, price: 545.0, dayChangePct: 0.006, costBasis: 470 },
  { ticker: "AAPL", name: "Apple Inc.", shares: 120, price: 212.4, dayChangePct: 0.008, costBasis: 150 },
  { ticker: "MSFT", name: "Microsoft Corp.", shares: 45, price: 470.1, dayChangePct: 0.005, costBasis: 360 },
  { ticker: "NVDA", name: "NVIDIA Corp.", shares: 60, price: 158.2, dayChangePct: 0.021, costBasis: 95 },
  { ticker: "SCHD", name: "Schwab US Dividend Equity ETF", shares: 200, price: 27.4, dayChangePct: 0.003, costBasis: 24 },
  { ticker: "TSLA", name: "Tesla Inc.", shares: 50, price: 295.0, dayChangePct: -0.012, costBasis: 240 },
];

// ── Lazy Plaid client (only constructed when real keys exist) ───────────────────
let _client = null;
async function plaidClient() {
  const { clientId, secret, name } = env();
  if (!clientId || !secret) return null;
  if (_client) return _client;
  const { Configuration, PlaidApi, PlaidEnvironments } = await import("plaid");
  const config = new Configuration({
    basePath: PlaidEnvironments[name] ?? PlaidEnvironments.sandbox,
    baseOptions: { headers: { "PLAID-CLIENT-ID": clientId, "PLAID-SECRET": secret } },
  });
  _client = new PlaidApi(config);
  return _client;
}

/** Map Plaid's investmentsHoldingsGet payload → Helm `Holding[]`. */
function plaidToHelm(holdings = [], securities = []) {
  const byId = Object.fromEntries(securities.map((s) => [s.security_id, s]));
  return holdings
    .map((h) => {
      const s = byId[h.security_id] || {};
      const shares = Number(h.quantity) || 0;
      const price = Number(h.institution_price ?? s.close_price) || 0;
      const totalCost = h.cost_basis != null ? Number(h.cost_basis) : 0;
      const costBasis = shares > 0 && totalCost ? totalCost / shares : price;
      const ticker = String(s.ticker_symbol || s.name || "—").toUpperCase().slice(0, 10);
      return { ticker, name: s.name || s.ticker_symbol || "Security", shares, price, dayChangePct: 0, costBasis };
    })
    .filter((h) => h.shares > 0 && h.price > 0);
}

export async function createConnectorApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Feature-detection for the frontend.
  app.get("/status", (_req, res) => {
    const e = env();
    res.json({ configured: e.configured, demo: !e.configured, env: e.name });
  });

  // 1) Link token — opens Plaid Link in the browser. Demo mode returns demo:true.
  app.post("/create_link_token", async (_req, res) => {
    const e = env();
    if (!e.configured) return res.json({ demo: true, link_token: null });
    try {
      const client = await plaidClient();
      const { Products, CountryCode } = await import("plaid");
      const r = await client.linkTokenCreate({
        user: { client_user_id: "helm-owner" },
        client_name: "Helm",
        products: [Products.Investments],
        country_codes: [CountryCode.Us],
        language: "en",
      });
      res.json({ link_token: r.data.link_token, expiration: r.data.expiration });
    } catch (err) {
      res.status(500).json({ error: plaidErr(err) });
    }
  });

  // 2) Exchange the public token from Link for a durable access token (kept server-side).
  app.post("/exchange_public_token", async (req, res) => {
    const e = env();
    if (!e.configured) return res.json({ demo: true });
    const publicToken = req.body?.public_token;
    if (!publicToken) return res.status(400).json({ error: "Missing public_token" });
    try {
      const client = await plaidClient();
      const r = await client.itemPublicTokenExchange({ public_token: publicToken });
      const tokens = loadTokens();
      tokens[r.data.item_id] = r.data.access_token;
      tokens.__last = r.data.item_id;
      saveTokens(tokens);
      res.json({ item_id: r.data.item_id });
    } catch (err) {
      res.status(500).json({ error: plaidErr(err) });
    }
  });

  // 3) Fetch investment holdings → normalized to Helm's shape.
  app.post("/holdings", async (req, res) => {
    const e = env();
    if (!e.configured) {
      return res.json({ demo: true, institution: "Sandbox", holdings: DEMO_HOLDINGS });
    }
    try {
      const client = await plaidClient();
      const tokens = loadTokens();
      const itemId = req.body?.item_id || tokens.__last;
      const accessToken = itemId ? tokens[itemId] : null;
      if (!accessToken) return res.status(400).json({ error: "No linked account yet. Connect first." });
      const r = await client.investmentsHoldingsGet({ access_token: accessToken });
      const holdings = plaidToHelm(r.data.holdings, r.data.securities);
      const institution = r.data.item?.institution_id || "Your brokerage";
      if (!holdings.length) return res.status(422).json({ error: "No investment holdings found on that account." });
      res.json({ holdings, institution });
    } catch (err) {
      res.status(500).json({ error: plaidErr(err) });
    }
  });

  // 3b) Cash balances — sums depository (checking/savings) available balances so Helm's
  //    "cash on hand" is real, not assumed. Demo mode returns a realistic figure.
  app.post("/balances", async (_req, res) => {
    const e = env();
    if (!e.configured) return res.json({ demo: true, cash: 38450, accounts: 1 });
    try {
      const client = await plaidClient();
      const tokens = loadTokens();
      const itemId = tokens.__last;
      const accessToken = itemId ? tokens[itemId] : null;
      if (!accessToken) return res.status(400).json({ error: "No linked account yet. Connect first." });
      const r = await client.accountsBalanceGet({ access_token: accessToken });
      const depository = (r.data.accounts || []).filter((a) => a.type === "depository");
      const cash = depository.reduce((sum, a) => sum + Number(a.balances?.available ?? a.balances?.current ?? 0), 0);
      res.json({ cash: Math.round(cash), accounts: depository.length });
    } catch (err) {
      res.status(500).json({ error: plaidErr(err) });
    }
  });

  // 4) Market quotes — server-side Yahoo Finance proxy. The browser can't call Yahoo
  //    directly (CORS), so the connector fetches it. Powers "link your Yahoo portfolio":
  //    enter tickers and get live prices. No API key needed. Reachable at /api/plaid/quotes.
  app.get("/quotes", async (req, res) => {
    const symbols = String(req.query.symbols || "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 60);
    if (!symbols.length) return res.json({ quotes: {} });
    const quotes = {};
    await Promise.allSettled(
      symbols.map(async (sym) => {
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`;
          const r = await fetch(url, {
            signal: AbortSignal.timeout(4500),
            headers: { "User-Agent": "Mozilla/5.0 (Helm)" },
          });
          if (!r.ok) return;
          const j = await r.json();
          const meta = j?.chart?.result?.[0]?.meta;
          if (!meta || typeof meta.regularMarketPrice !== "number") return;
          const prev = meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice;
          quotes[sym] = {
            ticker: sym,
            name: meta.shortName || meta.longName || sym,
            price: meta.regularMarketPrice,
            changePct: prev ? meta.regularMarketPrice / prev - 1 : 0,
          };
        } catch {
          /* skip this symbol; client falls back to reference */
        }
      }),
    );
    res.json({ quotes, source: "yahoo" });
  });

  return app;
}

function plaidErr(err) {
  const d = err?.response?.data;
  if (d?.error_message) return `${d.error_code}: ${d.error_message}`;
  return err?.message || "Plaid request failed";
}
