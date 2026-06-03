export type BusinessType = "restaurant" | "retail" | "portfolio";

/** Reporting currency for a business's raw figures. */
export type Currency = "USD" | "CAD" | "INR";

/** One day of normalized performance for any revenue-generating business. */
export interface DayPoint {
  /** ISO date string, e.g. "2026-06-02" */
  date: string;
  /** Total revenue for the day (or account value, for a portfolio), in USD */
  revenue: number;
  /** Number of sales / transactions for the day */
  transactions: number;
}

export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  /** Current price per share */
  price: number;
  /** Day change as a fraction, e.g. 0.042 = +4.2% */
  dayChangePct: number;
  /** Average cost basis per share */
  costBasis: number;
}

/**
 * A normalized business. Every revenue source — a restaurant, a shop, a
 * brokerage account — is reduced to this same shape so the dashboard can
 * render any of them. Adding a new business is just adding one of these.
 */
export interface Business {
  id: string;
  name: string;
  /** Compact label for tight rows, e.g. "Riverside" */
  shortName?: string;
  type: BusinessType;
  /** Reporting currency of this business's raw figures (default "USD"). On load, all
   *  amounts are converted to the app's display currency; this records the original. */
  currency?: Currency;
  /** Human location label, e.g. "Española, ON" */
  location: string;
  /** Short tag shown on the card, e.g. "Sandwich franchise" */
  category: string;
  /** Accent color (hex) used across the card + charts */
  accent: string;
  /** Daily time series, oldest → newest. ~90 days. */
  series: DayPoint[];
  /** Cash currently tied up in the business (buildout, inventory, cost basis) */
  capitalDeployed: number;
  /** Net profit margin as a fraction (operating businesses only) */
  netMargin?: number;
  /** Portfolio-only: stable annualized return used for the capital comparison */
  annualReturn?: number;
  /** Portfolio-only: individual positions */
  holdings?: Holding[];
}

export type InsightKind = "alert" | "opportunity" | "win" | "capital" | "info";

export interface InsightAction {
  label: string;
  /** Toast shown when tapped (prototype feedback) */
  done: string;
}

export interface Insight {
  id: string;
  businessId?: string;
  kind: InsightKind;
  title: string;
  detail: string;
  /** Numeric severity for ranking; higher = surfaced first */
  priority: number;
  /** Short metric chip, e.g. "-22%" */
  metric?: string;
  metricUp?: boolean;
  action?: InsightAction;
}
