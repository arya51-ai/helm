import type { Currency } from "../types";

/**
 * User-set economics overrides, persisted in the browser. These let an owner correct
 * the prototype's placeholder `capitalDeployed` / `netMargin` to their real numbers so
 * return-on-capital and net worth become exact. Values are stored in the business's OWN
 * reporting currency (same basis as the raw data), then converted to USD at load like
 * everything else — so overrides are applied BEFORE `toDisplayCurrency`.
 */
const LS_KEY = "helm:overrides:v1";

export interface BizOverride {
  /** Display name, e.g. "Havana Smoke Shop". */
  name?: string;
  /** Compact label for tight rows, e.g. "Havana". */
  shortName?: string;
  /** Human location label, e.g. "Columbus, OH". */
  location?: string;
  /** Short tag shown on the card, e.g. "Tobacco & vape". */
  category?: string;
  /** Accent color (hex) used across the card + charts. */
  accent?: string;
  /** Cash deployed, in the business's reporting currency. */
  capitalDeployed?: number;
  /** Net profit margin as a fraction (0.085 = 8.5%). */
  netMargin?: number;
  /** Reporting currency of this business's figures. */
  currency?: Currency;
}

export function readOverrides(): Record<string, BizOverride> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

export function setOverride(id: string, patch: BizOverride): void {
  try {
    const all = readOverrides();
    all[id] = { ...all[id], ...patch };
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* ignore quota / private-mode */
  }
}

export function clearOverride(id: string): void {
  try {
    const all = readOverrides();
    delete all[id];
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function clearOverrides(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}
