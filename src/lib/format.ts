const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function usd(n: number, cents = false): string {
  return (cents ? usd2 : usd0).format(n);
}

const moneyFmt: Record<string, Intl.NumberFormat> = {};
/** Format an amount in any ISO currency: money(3289,"CAD") → "CA$3,289", money(2401) → "$2,401". */
export function money(n: number, currency = "USD", cents = false): string {
  const key = `${currency}:${cents}`;
  moneyFmt[key] ??= new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  return moneyFmt[key].format(n);
}

/** The currency's symbol in en-US: "USD" → "$", "CAD" → "CA$". */
export function currencySymbol(currency = "USD"): string {
  return money(0, currency).replace(/[\d.,\s]/g, "");
}

/** Compact money: $1.2k, $128k, $1.4M */
export function usdCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${sign}$${Math.round(abs)}`;
}

export function pct(frac: number, digits = 1): string {
  return `${(frac * 100).toFixed(digits)}%`;
}

export function signedPct(frac: number, digits = 1): string {
  const s = frac >= 0 ? "+" : "";
  return `${s}${(frac * 100).toFixed(digits)}%`;
}

export function signedUsd(n: number, cents = false): string {
  const s = n >= 0 ? "+" : "−";
  return `${s}${usd(Math.abs(n), cents)}`;
}

/** Parse an ISO date as *local* midnight to avoid timezone off-by-one. */
function local(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

/** Today's *local* calendar date as an ISO string (YYYY-MM-DD). Unlike
 *  `new Date().toISOString().slice(0, 10)`, this doesn't roll to tomorrow in the evening for
 *  negative-UTC-offset timezones — the whole app treats ISO dates as local (see `local()`). */
export function isoToday(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function weekday(dateStr: string, long = false): string {
  return local(dateStr).toLocaleDateString("en-US", { weekday: long ? "long" : "short" });
}

export function shortDate(dateStr: string): string {
  return local(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function longDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/** Whole days between an ISO date and the real calendar today (0 = today, 1 = yesterday). */
export function daysAgo(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - local(dateStr).getTime()) / 86_400_000);
}

/**
 * Honest label for a data point's recency. POS data typically lags a day, so the
 * "latest" figure is usually the previous completed close, not literally today.
 */
export function asOfLabel(dateStr: string, noun = ""): string {
  const n = daysAgo(dateStr);
  const suffix = noun ? ` ${noun}` : "";
  if (n <= 0) return `Today${suffix}`;
  if (n === 1) return `Yesterday${suffix}`;
  return `${weekday(dateStr)} ${shortDate(dateStr)}${suffix}`;
}
