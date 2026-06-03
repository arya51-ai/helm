import type { Business, Currency } from "../types";

/**
 * Multi-currency support. A business reports in its own currency (a Subway in
 * Ontario rings up CAD; an Ohio shop and a US brokerage are USD). To make any
 * cross-business total — combined revenue, net worth, business equity — honest,
 * every monetary figure is converted to ONE display currency before it's summed.
 *
 * The invariant: after `toDisplayCurrency()` runs at load, every amount in a
 * `Business` (`series[].revenue`, `capitalDeployed`) is in `DISPLAY_CURRENCY`.
 * The `currency` field is preserved only to LABEL the original reporting currency.
 * Conversion happens exactly once, at the app-state boundary — nothing else converts.
 */
export const DISPLAY_CURRENCY: Currency = "USD";

/**
 * FX: 1 unit of `currency` expressed in USD. Seeded from a default, overridable by
 * the owner in Settings (persisted), and ready to be swapped for a live daily feed —
 * the rest of the app reads this table and is otherwise rate-agnostic.
 */
const FX_KEY = "helm:fx:v1";
const DEFAULT_RATES: Record<Currency, number> = { USD: 1, CAD: 0.73, INR: 0.012 };

export const RATES_TO_USD: Record<Currency, number> = (() => {
  const rates = { ...DEFAULT_RATES };
  try {
    const saved = JSON.parse(localStorage.getItem(FX_KEY) || "{}");
    for (const k of Object.keys(rates) as Currency[]) {
      if (typeof saved[k] === "number" && saved[k] > 0) rates[k] = saved[k];
    }
  } catch {
    /* ignore */
  }
  return rates;
})();

/** Update a currency's USD rate (Settings → editable FX). Persists; mutates in place
 *  so already-rendered reads pick it up after the next load. */
export function setRateToUSD(c: Currency, rate: number): void {
  if (!(rate > 0)) return;
  RATES_TO_USD[c] = rate;
  try {
    localStorage.setItem(FX_KEY, JSON.stringify(RATES_TO_USD));
  } catch {
    /* ignore */
  }
}

export function resetRates(): void {
  for (const k of Object.keys(DEFAULT_RATES) as Currency[]) RATES_TO_USD[k] = DEFAULT_RATES[k];
  try {
    localStorage.removeItem(FX_KEY);
  } catch {
    /* ignore */
  }
}

/** Convert a native amount into USD. */
export function toUSD(amount: number, from: Currency = "USD"): number {
  return amount * (RATES_TO_USD[from] ?? 1);
}

/** Recover the native amount from a USD amount (for showing "as reported"). */
export function fromUSD(amountUSD: number, to: Currency = "USD"): number {
  return amountUSD / (RATES_TO_USD[to] ?? 1);
}

/** e.g. "1 CAD = $0.73" — for transparency notes. */
export function fxNote(from: Currency): string {
  return `1 ${from} = $${(RATES_TO_USD[from] ?? 1).toFixed(2)}`;
}

/**
 * Convert every business's monetary fields into `DISPLAY_CURRENCY`. Idempotent for
 * USD businesses (returned untouched). Counts (`transactions`), ratios (`netMargin`,
 * `annualReturn`) and already-USD portfolio holdings are never scaled.
 */
export function toDisplayCurrency(businesses: Business[]): Business[] {
  return businesses.map((b) => {
    const from = b.currency ?? "USD";
    if (from === DISPLAY_CURRENCY) return b;
    const rate = RATES_TO_USD[from] ?? 1;
    return {
      ...b,
      series: b.series.map((p) => ({ ...p, revenue: p.revenue * rate })),
      capitalDeployed: Math.round(b.capitalDeployed * rate),
    };
  });
}
