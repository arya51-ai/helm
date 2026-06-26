import type { Business } from "../types";
import { buildSampleBusinesses } from "./businesses";
import { buildSampleHotels } from "./hotels";
import { buildNorthwoodMotel } from "./northwood";
import { buildSampleStations } from "./fuel";
import { buildDevUnits } from "./multiUnit";
import { extendSeriesToToday } from "./rng";
import { toDisplayCurrency } from "../lib/currency";
import { readOverrides, clearOverride } from "./overrides";
import { readRemoved, addRemoved, restoreRemoved } from "./removed";
import { readProfileId, profileById, selectSamples } from "./profiles";

export type DataSource = "real" | "mock";

const LS_KEY = "helm:imported:v1";

function isValidBusiness(b: unknown): b is Business {
  if (!b || typeof b !== "object") return false;
  const x = b as Record<string, unknown>;
  return (
    typeof x.id === "string" &&
    Array.isArray(x.series) &&
    x.series.length > 0 &&
    x.series.every(
      (p) =>
        p &&
        typeof (p as Record<string, unknown>).date === "string" &&
        typeof (p as Record<string, unknown>).revenue === "number",
    )
  );
}

function normalizeSeries(b: Business): Business {
  return {
    ...b,
    series: [...b.series]
      .map((p) => ({
        date: p.date,
        revenue: Number(p.revenue) || 0,
        transactions: Number(p.transactions) || 0,
      }))
      .sort((a, c) => a.date.localeCompare(c.date)),
  };
}

// ─── Locally-imported businesses (CSV/XLSX uploads), persisted in the browser ──
export function readImported(): Business[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(isValidBusiness).map(normalizeSeries) : [];
  } catch {
    return [];
  }
}

export function upsertImported(b: Business): void {
  try {
    const list = readImported();
    const i = list.findIndex((x) => x.id === b.id);
    if (i >= 0) list[i] = b;
    else list.push(b);
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function clearImported(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Drop the locally-imported copy for ONE id, leaving its seed layer intact — so an uploaded
 * business reverts to its modeled sample baseline (unlike `removeBusiness`, which hides it for
 * good). Used by "reset to sample data": lets an owner re-run the upload or recover from a bad file.
 */
export function removeImported(id: string): void {
  try {
    const list = readImported().filter((b) => b.id !== id);
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/**
 * Remove a business from the owner's view. Drops any locally-imported copy, clears its
 * economics/profile override, and records the id in the removed set — so a sample- or
 * file-sourced business stays gone on reload too. Reversible via `restoreBusiness`.
 */
export function removeBusiness(id: string): void {
  try {
    const list = readImported().filter((b) => b.id !== id);
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  clearOverride(id);
  addRemoved(id);
}

/** Un-remove a business (drops it from the removed set; its source layer reappears). */
export function restoreBusiness(id: string): void {
  restoreRemoved(id);
}

/**
 * Layered load: sample data ← `/data.json` (real scrape/sync) ← local imports.
 * Each layer overrides the previous by business `id`, and may add new businesses.
 * So you can go live one source at a time, and an in-app upload wins over the file.
 */
export async function loadBusinesses(): Promise<{ businesses: Business[]; source: DataSource }> {
  let fileBusinesses: Business[] = [];
  try {
    const res = await fetch("/data.json", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const incoming: unknown[] = Array.isArray(data) ? data : data?.businesses;
      if (Array.isArray(incoming)) {
        const validated = incoming.filter(isValidBusiness).map(normalizeSeries);
        // Scraped POS data always lags by a few days. Rather than dropping real history to
        // mock the moment it ages (which made the scrape useless after a day), carry each
        // real series forward to today so the owner's actual numbers stay current between
        // scrapes. A fresh scrape simply replaces the projected tail with real days.
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        fileBusinesses = validated.map((b, i) => ({
          ...b,
          series: extendSeriesToToday(b.series, today, i + 1),
        }));
      }
    }
  } catch {
    /* offline / missing → sample only */
  }

  const imported = readImported();
  const hasReal = fileBusinesses.length > 0 || imported.length > 0;

  // Rebuild the sample each load so the demo series re-anchors to the current day
  // (this is what makes the daily refresh actually roll "today" forward). The active
  // persona decides which sample shops + hotels seed the demo; a hotel anywhere in the
  // set is what flips on the hospitality surfaces downstream.
  const profile = profileById(readProfileId());
  const sampleBiz = buildSampleBusinesses();
  // Northwood rides alongside the seeded chain hotels in the sample set; the persona's include-list
  // (`hotels: ["northwood-motel"]`) is what actually surfaces it.
  const sampleHotels = [...buildSampleHotels(), buildNorthwoodMotel()];
  const sampleStations = buildSampleStations();
  const sampleUnits = buildDevUnits();
  const MOCK = [
    ...selectSamples(sampleBiz, profile.businesses),
    ...selectSamples(sampleHotels, profile.hotels),
    ...selectSamples(sampleStations, profile.fuel),
    ...selectSamples(sampleUnits, profile.units),
  ];
  // The persona gates demo-seed businesses everywhere — including ones re-supplied by the
  // /data.json "real scrape" layer — so a hotel-group demo never has a stray Subway leak in.
  // Genuinely user-imported businesses (ids outside the seed universe) always pass through.
  const allSeedIds = new Set([...sampleBiz, ...sampleHotels, ...sampleStations, ...sampleUnits].map((b) => b.id));
  const allowedSeedIds = new Set(MOCK.map((b) => b.id));
  const blockedBySeed = (id: string) => allSeedIds.has(id) && !allowedSeedIds.has(id);
  // Merge by id, preserving order: sample → new-from-file → new-from-import
  const byId = new Map<string, Business>(MOCK.map((b) => [b.id, b]));
  const order = MOCK.map((b) => b.id);
  for (const layer of [fileBusinesses, imported]) {
    for (const b of layer) {
      if (!byId.has(b.id)) order.push(b.id);
      byId.set(b.id, { ...byId.get(b.id), ...b } as Business);
    }
  }

  // Apply the owner's overrides (economics + profile, in native currency), drop any
  // removed businesses, then convert every business to the display currency once — so
  // all downstream sums stay honest.
  const overrides = readOverrides();
  const removed = new Set(readRemoved());
  const merged = toDisplayCurrency(
    order
      .filter((id) => !removed.has(id) && !blockedBySeed(id))
      .map((id) => {
        const b = byId.get(id)!;
        const o = overrides[id];
        return o ? { ...b, ...o } : b;
      }),
  );
  return { businesses: merged, source: hasReal ? "real" : "mock" };
}
