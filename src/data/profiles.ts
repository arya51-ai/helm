/**
 * Demo personas. Helm adapts to who's holding it — an independent shop owner, an
 * operator with a couple of motels, or a multi-property hotel group. A persona only
 * decides which *sample* businesses seed the demo; real imports always merge on top,
 * and the hospitality surfaces light up automatically whenever a hotel is present.
 *
 * This is also the live-demo switch: flip personas in Settings to walk a Subway owner
 * and an AAHOA hotelier through the exact same app, each seeing only what's theirs.
 */

export type ProfileId = "blank" | "independent" | "mixed" | "group" | "aahoa" | "fuel" | "multi" | "northwood";

export interface DemoProfile {
  id: ProfileId;
  label: string;
  sub: string;
  blurb: string;
  /** First name Helm greets in this persona (defaults to the app owner). */
  owner?: string;
  /** Sample operating/portfolio business ids to include, or "all". */
  businesses: "all" | string[];
  /** Sample hotel ids to include, "all", or [] for none. */
  hotels: "all" | string[];
  /** Sample fuel-station ids to include, "all", or [] for none. */
  fuel: "all" | string[];
  /** Sample multi-unit shop ids (Dev's Dayton Subways + liquor), "all", or [] for none. */
  units: "all" | string[];
}

export const PROFILES: DemoProfile[] = [
  {
    id: "northwood",
    label: "Sam · Northwood Motel",
    sub: "Independent motel · Pinecrest, ON",
    owner: "Sam",
    blurb:
      "A 21-room independent motel on the lake region, run off a phone through Little Hotelier. Helm drops the chain dialect (RevPAR Index, GOP, brand PIP) and reads the business an owner-operator actually lives in: how full tonight, the nightly rate, where the bookings come from, and what Booking.com & Expedia are taking. The brief leads with commission leakage and the Summerfest Weekend pricing window. The design-partner demo.",
    businesses: [],
    hotels: ["northwood-motel"],
    fuel: [],
    units: [],
  },
  {
    id: "blank",
    label: "Blank slate",
    sub: "Start empty — upload your own",
    blurb:
      "Nothing pre-loaded. Bring in real numbers by uploading a POS export (LiveIQ, Retailz, Square — anything). The fastest way to show an owner their own business.",
    businesses: [],
    hotels: [],
    fuel: [],
    units: [],
  },
  {
    id: "independent",
    label: "Independent operator",
    sub: "Shops + investments",
    blurb: "A Subway, a smoke shop, and a brokerage account. No hospitality clutter.",
    businesses: "all",
    hotels: [],
    fuel: [],
    units: [],
  },
  {
    id: "mixed",
    label: "Operator + properties",
    sub: "Shops, investments & 2 hotels",
    blurb: "Runs a couple of stores and owns two motels — hospitality switches on automatically.",
    businesses: "all",
    hotels: ["fairfield-inn-grove-city", "hampton-inn-airport"],
    fuel: [],
    units: [],
  },
  {
    id: "group",
    label: "Hotel group",
    sub: "5 properties + investments",
    blurb: "A five-property portfolio with the full command center — the $1,000/mo customer.",
    businesses: ["portfolio"],
    hotels: ["marriott-downtown-col", "hilton-garden-easton", "hampton-inn-airport", "ihg-holiday-inn-dublin", "fairfield-inn-grove-city"],
    fuel: [],
    units: [],
  },
  {
    id: "aahoa",
    label: "AAHOA showcase",
    sub: "12 properties across 6 states",
    blurb:
      "An AAHOA-scale portfolio — a dozen hotels from Clearwater to Phoenix across every brand tier. The command center triages the whole book and the morning Brief surfaces the four properties that actually need the owner: a share-losing RGI laggard, a labor-hot full-service, a PIP past deadline, a slipping review score — and the RevPAR star carrying the month. The Rushi / 20k-owner pitch.",
    businesses: ["portfolio"],
    hotels: "all",
    fuel: [],
    units: [],
  },
  {
    id: "fuel",
    label: "Fuel retailer",
    sub: "3 gas stations + investments",
    blurb: "Three branded stations — fuel volume, cents-per-gallon, and c-store attach across all of them. The Dillip demo.",
    businesses: ["portfolio"],
    hotels: [],
    fuel: "all",
    units: [],
  },
  {
    id: "multi",
    label: "Multi-unit operator",
    sub: "3 Subways + a liquor store",
    blurb: "Three Subways near Dayton plus a liquor store — same-brand benchmarking compares the units head-to-head. The Dev demo.",
    businesses: ["portfolio"],
    hotels: [],
    fuel: [],
    units: "all",
  },
];

export const profileById = (id: ProfileId): DemoProfile =>
  PROFILES.find((p) => p.id === id) ?? PROFILES[0];

const LS_KEY = "helm:profile:v1";

export function readProfileId(): ProfileId {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === "blank" || v === "independent" || v === "mixed" || v === "group" || v === "aahoa" || v === "fuel" || v === "multi" || v === "northwood") return v;
  } catch {
    /* ignore */
  }
  return "independent";
}

export function writeProfileId(id: ProfileId): void {
  try {
    localStorage.setItem(LS_KEY, id);
  } catch {
    /* ignore */
  }
}

/** Apply a persona's include-lists to the freshly-built sample sets. */
export function selectSamples<T extends { id: string }>(all: T[], pick: "all" | string[]): T[] {
  if (pick === "all") return all;
  const want = new Set(pick);
  return all.filter((b) => want.has(b.id));
}
