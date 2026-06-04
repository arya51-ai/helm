/**
 * Live FX feed — fetches current exchange rates on app start.
 * Falls back gracefully to cached/default rates if the API is unreachable.
 */

import { RATES_TO_USD, setRateToUSD } from "./currency";

const FX_TIMESTAMP_KEY = "helm:fx-timestamp:v1";

export function getFxTimestamp(): number {
  try {
    return Number(localStorage.getItem(FX_TIMESTAMP_KEY)) || 0;
  } catch {
    return 0;
  }
}

function setFxTimestamp(ts: number): void {
  try {
    localStorage.setItem(FX_TIMESTAMP_KEY, String(ts));
  } catch {
    /* ignore */
  }
}

/**
 * Fetch live FX rates from exchangerate.host API (free, no key).
 * Updates CAD and INR rates; USD stays 1. Timestamps the update.
 * Fails silently if unreachable — the app keeps using cached/default rates.
 */
export async function updateFxRates(): Promise<boolean> {
  try {
    const resp = await fetch("https://api.exchangerate.host/latest?base=USD", {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return false;

    const data = (await resp.json()) as { rates?: Record<string, number> };
    if (!data.rates) return false;

    // Apply CAD and INR if available
    if (typeof data.rates.CAD === "number" && data.rates.CAD > 0) {
      setRateToUSD("CAD", data.rates.CAD);
    }
    if (typeof data.rates.INR === "number" && data.rates.INR > 0) {
      setRateToUSD("INR", data.rates.INR);
    }

    setFxTimestamp(Date.now());
    return true;
  } catch {
    // Network error, timeout, or parse failure — silently continue with cached rates
    return false;
  }
}
