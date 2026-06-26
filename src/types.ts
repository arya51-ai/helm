export type BusinessType = "restaurant" | "retail" | "portfolio" | "hotel" | "fuel";

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
  /** Hotel-only: daily hospitality KPIs keyed by ISO date. */
  hotelSeries?: HotelDay[];
  /** Hotel-only: brand (Marriott, Hilton, IHG, etc.) */
  brand?: string;
  /** Hotel-only: total room count */
  rooms?: number;
  /** Hotel-only: star rating (1-5) */
  stars?: number;
  /** Hotel-only: online review aggregate */
  reviewScore?: number;
  /** Hotel-only: number of reviews */
  reviewCount?: number;
  /** Hotel-only: PIP (Property Improvement Plan) items */
  pipItems?: PipItem[];
  /** Hotel-only: true when comp-set / RGI was defaulted to fair share (no STR data) — render
   *  as an estimate, not a measured benchmark. */
  compEstimated?: boolean;
  /** Hotel-only: true when GOP & labor were estimated from default margins (no P&L) — render
   *  the margin/labor numbers as estimates, not measured costs. */
  costEstimated?: boolean;
  /** Independent property (a motel/inn, not a flagged chain): no brand PIP, no STR comp set.
   *  Flips the hospitality UI + AI from chain language (RevPAR Index, GOP, PIP) to the read an
   *  owner-operator actually lives in — occupancy, nightly rate, booking channels & OTA fees. */
  independent?: boolean;
  /** Independent-only: where the bookings come from + what each OTA charges — the data behind the
   *  commission-leakage read. */
  channelMix?: ChannelMix;
  /** Independent-only: true when `channelMix` is a modeled estimate (no commission feed — a daily
   *  PMS export carries occupancy/rate/revenue but not the per-channel split), so the UI labels the
   *  booking-mix read as an estimate rather than measured. */
  channelEstimated?: boolean;
  /** Hotel/motel: true when `hotelSeries` came from a real uploaded export (vs a modeled demo
   *  series). Flips the "Modeled on public profile" framing to "your real numbers". */
  dataReal?: boolean;
  /** Independent-only: the property the owner sends through a channel manager (e.g. Little
   *  Hotelier), shown as the live "synced from" source. */
  pms?: string;
  /** Persona owner's first name — greets them by name on the Brief ("Good evening, Sam"). */
  ownerName?: string;
  /** Fuel-only: daily fuel + c-store KPIs keyed by ISO date. */
  fuelSeries?: FuelDay[];
  /** Fuel-only: number of fueling positions (pumps). */
  pumps?: number;
}

/** One day of gas-station economics — the two-engine business: thin-margin fuel + fat-margin
 *  inside (c-store). Rides alongside the generic DayPoint, same as HotelDay. */
export interface FuelDay {
  date: string;
  /** Gallons of fuel sold */
  gallonsSold: number;
  /** Fuel revenue (gallons × pump price) */
  fuelRevenue: number;
  /** Gross margin dollars on fuel */
  fuelMargin: number;
  /** Cents-per-gallon margin (the number a fuel retailer lives by) */
  cpg: number;
  /** Inside / c-store sales */
  insideSales: number;
  /** Gross margin dollars on inside sales */
  insideMargin: number;
  /** Inside margin as a fraction (0-1) */
  insideMarginPct: number;
  /** Other revenue — car wash, lottery commission, food service */
  otherRevenue: number;
  /** Gross margin dollars on other revenue */
  otherMargin: number;
  /** Total revenue (fuel + inside + other) */
  totalRevenue: number;
  /** Total gross profit (fuelMargin + insideMargin + otherMargin) */
  grossProfit: number;
}

/** One day of hotel-specific KPIs — rides alongside the generic DayPoint. */
export interface HotelDay {
  date: string;
  /** Rooms sold */
  roomsSold: number;
  /** Total rooms available */
  roomsAvailable: number;
  /** Occupancy rate (0-1) */
  occupancy: number;
  /** Average Daily Rate ($) */
  adr: number;
  /** Revenue Per Available Room = occupancy × ADR */
  revpar: number;
  /** Total room revenue */
  roomRevenue: number;
  /** Food & Beverage revenue */
  fbRevenue: number;
  /** Other revenue (spa, parking, events) */
  otherRevenue: number;
  /** Total revenue (room + F&B + other) */
  totalRevenue: number;
  /** Gross Operating Profit */
  gop: number;
  /** GOP margin (0-1) */
  gopMargin: number;
  /** Labor cost */
  laborCost: number;
  /** Labor as % of revenue (0-1) */
  laborPct: number;
  /** Comp set RevPAR (STR benchmark) */
  compSetRevpar: number;
  /** RevPAR Index (RGI) = property RevPAR / comp set RevPAR × 100 */
  rgi: number;
}

/** Booking-source distribution for an independent property + the commission each paid channel
 *  charges. Shares are fractions of room revenue (direct + bookingCom + expedia + other ≈ 1);
 *  the *Rate fields are the OTA's cut. This is the data behind "Booking.com took CA$X". */
export interface ChannelMix {
  direct: number;
  bookingCom: number;
  expedia: number;
  other: number;
  bookingComRate: number;
  expediaRate: number;
  otherRate: number;
}

/** Property Improvement Plan item — brand-mandated renovations/upgrades. */
export interface PipItem {
  id: string;
  title: string;
  category: "rooms" | "lobby" | "exterior" | "FF&E" | "technology" | "safety";
  status: "complete" | "in-progress" | "upcoming" | "overdue";
  deadline: string;
  estimatedCost: number;
  actualCost?: number;
}

/** Aggregated hotel portfolio metrics. */
export interface HotelPortfolioMetrics {
  totalRooms: number;
  avgOccupancy: number;
  avgAdr: number;
  avgRevpar: number;
  totalRoomRevenue: number;
  totalRevenue: number;
  totalGop: number;
  avgGopMargin: number;
  avgRgi: number;
  avgLaborPct: number;
  avgReviewScore: number;
  totalReviewCount: number;
  /** Per-property summary for the command center */
  properties: HotelPropertySummary[];
}

export interface HotelPropertySummary {
  id: string;
  name: string;
  shortName: string;
  brand: string;
  location: string;
  rooms: number;
  accent: string;
  occupancy: number;
  adr: number;
  revpar: number;
  rgi: number;
  gopMargin: number;
  laborPct: number;
  reviewScore: number;
  revparTrend: number;
  occupancyTrend: number;
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
