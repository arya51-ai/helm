import type { Holding } from "../types";

/**
 * Frontend client for the Helm Plaid connector (server/connector.mjs, mounted at
 * /api/plaid). Every call is defensive: if the connector isn't running (e.g. a static
 * deploy with no backend), `plaidStatus()` reports `reachable:false` and the UI falls
 * back to the Yahoo/CSV paths — Plaid never crashes the app.
 */
export interface PlaidStatus {
  /** The connector responded at all (false on a static deploy with no /api). */
  reachable: boolean;
  /** Real Plaid keys are present → full Link flow. */
  configured: boolean;
  /** No keys → connector serves realistic sandbox holdings (demoable today). */
  demo: boolean;
  env: string;
}

export async function plaidStatus(): Promise<PlaidStatus> {
  try {
    const r = await fetch("/api/plaid/status");
    if (!r.ok) return { reachable: false, configured: false, demo: false, env: "" };
    const d = await r.json();
    return { reachable: true, configured: !!d.configured, demo: !!d.demo, env: d.env || "" };
  } catch {
    return { reachable: false, configured: false, demo: false, env: "" };
  }
}

export async function plaidCreateLinkToken(): Promise<string | null> {
  const r = await fetch("/api/plaid/create_link_token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Couldn't start Plaid.");
  return d.link_token ?? null;
}

export async function plaidExchange(publicToken: string): Promise<string | null> {
  const r = await fetch("/api/plaid/exchange_public_token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ public_token: publicToken }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Couldn't link that account.");
  return d.item_id ?? null;
}

export interface PlaidHoldingsResult {
  holdings: Holding[];
  institution: string;
}

/** Real cash on hand — sum of linked depository balances. null if the connector isn't reachable. */
export async function plaidBalances(): Promise<{ cash: number; demo: boolean } | null> {
  try {
    const r = await fetch("/api/plaid/balances", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || typeof d.cash !== "number") return null;
    return { cash: d.cash, demo: !!d.demo };
  } catch {
    return null;
  }
}

export async function plaidHoldings(itemId?: string): Promise<PlaidHoldingsResult> {
  const r = await fetch("/api/plaid/holdings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ item_id: itemId }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !Array.isArray(d.holdings)) throw new Error(d.error || "Couldn't fetch holdings from Plaid.");
  return { holdings: d.holdings as Holding[], institution: d.institution || "Your brokerage" };
}
