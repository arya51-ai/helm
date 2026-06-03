/**
 * Stock quotes. Tries live data from Yahoo Finance (via a CORS proxy, since the
 * browser can't hit Yahoo directly), and falls back to a bundled reference
 * snapshot for common tickers so a demo never depends on the network. Every
 * result is tagged with its `source` so the UI can be honest about freshness.
 */
export type QuoteSource = "live" | "reference" | "none";

export interface Quote {
  ticker: string;
  name: string;
  price: number;
  /** Day change as a fraction (0.012 = +1.2%) */
  changePct: number;
  source: QuoteSource;
}

// Bundled reference snapshot (approx. prices, split-adjusted). Keeps the demo
// fully functional offline / when the proxy is unreachable.
const SNAPSHOT: Record<string, { name: string; price: number; changePct: number }> = {
  VOO: { name: "Vanguard S&P 500", price: 545.0, changePct: 0.006 },
  SPY: { name: "SPDR S&P 500", price: 593.2, changePct: 0.006 },
  QQQ: { name: "Invesco QQQ", price: 524.7, changePct: 0.009 },
  AAPL: { name: "Apple", price: 212.4, changePct: 0.009 },
  MSFT: { name: "Microsoft", price: 470.1, changePct: 0.006 },
  NVDA: { name: "NVIDIA", price: 158.2, changePct: 0.038 },
  TSLA: { name: "Tesla", price: 295.0, changePct: -0.014 },
  AMZN: { name: "Amazon", price: 215.0, changePct: 0.011 },
  GOOGL: { name: "Alphabet", price: 195.3, changePct: 0.008 },
  META: { name: "Meta Platforms", price: 602.5, changePct: 0.012 },
  "BRK.B": { name: "Berkshire Hathaway", price: 472.0, changePct: 0.003 },
  JPM: { name: "JPMorgan Chase", price: 252.1, changePct: 0.004 },
  V: { name: "Visa", price: 312.4, changePct: 0.005 },
  JNJ: { name: "Johnson & Johnson", price: 154.8, changePct: -0.002 },
  WMT: { name: "Walmart", price: 96.3, changePct: 0.007 },
  XOM: { name: "Exxon Mobil", price: 114.6, changePct: -0.006 },
  DIS: { name: "Disney", price: 111.2, changePct: 0.01 },
  NFLX: { name: "Netflix", price: 902.0, changePct: 0.015 },
  AMD: { name: "Advanced Micro Devices", price: 164.5, changePct: 0.026 },
  KO: { name: "Coca-Cola", price: 69.8, changePct: 0.001 },
  PG: { name: "Procter & Gamble", price: 169.4, changePct: -0.003 },
  HD: { name: "Home Depot", price: 411.0, changePct: 0.004 },
  COST: { name: "Costco", price: 951.0, changePct: 0.006 },
  PLTR: { name: "Palantir", price: 74.6, changePct: 0.031 },
  SOFI: { name: "SoFi Technologies", price: 15.3, changePct: 0.022 },
  F: { name: "Ford", price: 11.2, changePct: -0.004 },
  T: { name: "AT&T", price: 22.9, changePct: 0.002 },
  PFE: { name: "Pfizer", price: 26.1, changePct: -0.005 },
};

function clean(ticker: string): string {
  return ticker.trim().toUpperCase();
}

async function liveQuote(ticker: string, timeoutMs = 3500): Promise<Quote | null> {
  const yahoo = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
  const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(yahoo)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(proxied, { signal: ctrl.signal });
    if (!res.ok) return null;
    const j = await res.json();
    const meta = j?.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== "number") return null;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice;
    return {
      ticker,
      name: meta.shortName || meta.longName || ticker,
      price: meta.regularMarketPrice,
      changePct: prev ? meta.regularMarketPrice / prev - 1 : 0,
      source: "live",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Batched live quotes via the Helm connector's server-side Yahoo proxy
 * (/api/plaid/quotes) — the reliable path when the connector is running (no browser
 * CORS). Returns {} if the connector isn't there (static deploy), so callers fall back.
 */
async function connectorQuotes(tickers: string[], timeoutMs = 6000): Promise<Record<string, Quote>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`/api/plaid/quotes?symbols=${encodeURIComponent(tickers.join(","))}`, {
      signal: ctrl.signal,
    });
    if (!res.ok) return {};
    const d = await res.json();
    const out: Record<string, Quote> = {};
    for (const [ticker, q] of Object.entries<any>(d?.quotes ?? {})) {
      if (q && typeof q.price === "number" && q.price > 0) {
        out[ticker] = { ticker, name: q.name || ticker, price: q.price, changePct: q.changePct || 0, source: "live" };
      }
    }
    return out;
  } catch {
    return {};
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fetch quotes for many tickers. Order of preference per ticker:
 *   1. Helm connector (server-side Yahoo, reliable live)  → source "live"
 *   2. client-side Yahoo via CORS proxy                    → source "live"
 *   3. bundled reference snapshot                          → source "reference"
 *   4. nothing found                                       → source "none"
 * So it's truly live when the connector runs, and never breaks when it doesn't.
 */
export async function fetchQuotes(tickers: string[]): Promise<Record<string, Quote>> {
  const unique = [...new Set(tickers.map(clean).filter(Boolean))];
  const map: Record<string, Quote> = await connectorQuotes(unique);

  const missing = unique.filter((t) => !map[t]);
  if (missing.length) {
    const results = await Promise.all(
      missing.map(async (t) => {
        const live = await liveQuote(t);
        if (live) return live;
        const snap = SNAPSHOT[t];
        if (snap) return { ticker: t, name: snap.name, price: snap.price, changePct: snap.changePct, source: "reference" as const };
        return { ticker: t, name: t, price: 0, changePct: 0, source: "none" as const };
      }),
    );
    for (const q of results) map[q.ticker] = q;
  }
  return map;
}

export function knownName(ticker: string): string {
  return SNAPSHOT[clean(ticker)]?.name ?? clean(ticker);
}
