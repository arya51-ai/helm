/**
 * Manual net-worth items — the assets, liabilities, and income streams Helm can't see
 * automatically (a house, a car, savings elsewhere, a mortgage, rental income, a salary).
 * Persisted in the browser; combined with Helm-tracked assets (businesses, portfolio, cash)
 * to produce a real balance sheet: Net worth = Total assets − Total liabilities.
 *
 * Everything is stored in USD (the app's display currency), same basis as the rest of the app.
 */

export type AssetKind = "real-estate" | "cash" | "investment" | "vehicle" | "crypto" | "valuable" | "business" | "other";
export type LiabilityKind = "mortgage" | "loan" | "credit-card" | "auto-loan" | "student-loan" | "other";

export interface ManualAsset {
  id: string;
  name: string;
  kind: AssetKind;
  value: number;
  /** Optional net monthly cash this asset throws off (e.g. rent). Feeds the cash-flow runway. */
  monthlyIncome?: number;
}

export interface ManualLiability {
  id: string;
  name: string;
  kind: LiabilityKind;
  balance: number;
  /** Optional monthly payment (outflow). Feeds the cash-flow runway. */
  monthlyPayment?: number;
  /** Optional APR, for display only. */
  apr?: number;
}

export interface IncomeStream {
  id: string;
  name: string;
  monthly: number;
}

export interface NetWorthStore {
  assets: ManualAsset[];
  liabilities: ManualLiability[];
  income: IncomeStream[];
}

export const ASSET_KINDS: { key: AssetKind; label: string }[] = [
  { key: "real-estate", label: "Real estate" },
  { key: "cash", label: "Cash & savings" },
  { key: "investment", label: "Investments" },
  { key: "vehicle", label: "Vehicle" },
  { key: "crypto", label: "Crypto" },
  { key: "valuable", label: "Valuables" },
  { key: "business", label: "Business / private" },
  { key: "other", label: "Other" },
];

export const LIABILITY_KINDS: { key: LiabilityKind; label: string }[] = [
  { key: "mortgage", label: "Mortgage" },
  { key: "loan", label: "Loan" },
  { key: "credit-card", label: "Credit card" },
  { key: "auto-loan", label: "Auto loan" },
  { key: "student-loan", label: "Student loan" },
  { key: "other", label: "Other" },
];

export const assetKindLabel = (k: AssetKind): string => ASSET_KINDS.find((x) => x.key === k)?.label ?? "Other";
export const liabilityKindLabel = (k: LiabilityKind): string => LIABILITY_KINDS.find((x) => x.key === k)?.label ?? "Other";

const LS_KEY = "helm:networth:v1";
const EMPTY: NetWorthStore = { assets: [], liabilities: [], income: [] };

export function readNetWorth(): NetWorthStore {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...EMPTY };
    const o = JSON.parse(raw);
    return {
      assets: Array.isArray(o.assets) ? o.assets : [],
      liabilities: Array.isArray(o.liabilities) ? o.liabilities : [],
      income: Array.isArray(o.income) ? o.income : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

function write(s: NetWorthStore): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota / private mode */
  }
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function upsert<T extends { id: string }>(arr: T[], item: T): T[] {
  const i = arr.findIndex((x) => x.id === item.id);
  if (i >= 0) {
    const c = [...arr];
    c[i] = item;
    return c;
  }
  return [...arr, item];
}

export function upsertAsset(a: ManualAsset): void {
  const s = readNetWorth();
  write({ ...s, assets: upsert(s.assets, a) });
}
export function removeAsset(id: string): void {
  const s = readNetWorth();
  write({ ...s, assets: s.assets.filter((x) => x.id !== id) });
}
export function upsertLiability(l: ManualLiability): void {
  const s = readNetWorth();
  write({ ...s, liabilities: upsert(s.liabilities, l) });
}
export function removeLiability(id: string): void {
  const s = readNetWorth();
  write({ ...s, liabilities: s.liabilities.filter((x) => x.id !== id) });
}
export function upsertIncome(i: IncomeStream): void {
  const s = readNetWorth();
  write({ ...s, income: upsert(s.income, i) });
}
export function removeIncome(id: string): void {
  const s = readNetWorth();
  write({ ...s, income: s.income.filter((x) => x.id !== id) });
}

export const manualAssetTotal = (s: NetWorthStore): number => s.assets.reduce((a, x) => a + (x.value || 0), 0);
export const manualLiabilityTotal = (s: NetWorthStore): number => s.liabilities.reduce((a, x) => a + (x.balance || 0), 0);

/** Extra monthly net cash flow from manual sources: income + asset income − liability payments. */
export function extraMonthlyNet(s: NetWorthStore): number {
  const inflow =
    s.income.reduce((a, x) => a + (x.monthly || 0), 0) + s.assets.reduce((a, x) => a + (x.monthlyIncome || 0), 0);
  const outflow = s.liabilities.reduce((a, x) => a + (x.monthlyPayment || 0), 0);
  return inflow - outflow;
}
