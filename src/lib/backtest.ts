import type { Insight, InsightKind, Business } from "../types";
import type { Metrics } from "./analytics";
import { isoToday, daysAgo, signedPct } from "./format";
import { readProfileId } from "../data/profiles";

/**
 * Backtest receipts — Helm's track record, made checkable. Every day we snapshot the top of the
 * ranked Brief to localStorage; once a week or so of history accrues, the Brief can show "Helm
 * flagged this N days ago — here's where it stands now," joining the old call to the business's
 * trajectory since. This is the most persuasive trust artifact for a skeptical operator: not a
 * confident number, but a receipt he can check against what actually happened.
 *
 * Same storage idiom as actions.ts / overrides.ts: a versioned key, JSON guarded, silent on
 * quota / private-mode. The snapshot is idempotent per LOCAL calendar day (mirrors the brief's
 * once-a-day cadence), so reopening the app many times in a day never double-logs. The "improved /
 * worsened" read is deliberately a hedged trajectory (week-over-week), never a causal claim.
 */
// Namespaced per demo persona so each persona accumulates its own daily snapshots. Helm switches
// personas in place (no reload); a single global key + per-day idempotency would let the first
// persona loaded that day own the snapshot, and receipts would never appear for the others.
const keyFor = () => `helm:backtest:v1:${readProfileId()}`;
const MAX_DAYS = 60;

export interface BacktestSnapshot {
  /** Local calendar day, YYYY-MM-DD (same scheme as isoToday). */
  day: string;
  at: number;
  insights: {
    id: string;
    businessId?: string;
    kind: InsightKind;
    title: string;
    metric?: string;
    priority: number;
  }[];
}

export interface BacktestReceipt {
  id: string;
  title: string;
  kind: InsightKind;
  daysAgo: number;
  businessName?: string;
  /** Week-over-week trajectory of the business since the call — a hedged read, not causation. */
  moveLabel: string;
  improved: boolean;
}

function read(): BacktestSnapshot[] {
  try {
    const raw = localStorage.getItem(keyFor());
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as BacktestSnapshot[]) : [];
  } catch {
    return [];
  }
}

function writeAll(snaps: BacktestSnapshot[]): void {
  try {
    localStorage.setItem(keyFor(), JSON.stringify(snaps.slice(-MAX_DAYS)));
  } catch {
    /* ignore quota / private-mode */
  }
}

export function readBacktest(): BacktestSnapshot[] {
  return read();
}

/** Wipe the current persona's snapshots (used by the Settings "start fresh" reset). */
export function clearBacktest(): void {
  try {
    localStorage.removeItem(keyFor());
  } catch {
    /* ignore */
  }
}

/** Snapshot today's top insights — idempotent per local day. Call once on a populated app load. */
export function snapshotToday(insights: Insight[]): void {
  if (!insights.length) return;
  const day = isoToday();
  const snaps = read();
  if (snaps.some((s) => s.day === day)) return; // already captured today
  snaps.push({
    day,
    at: Date.now(),
    insights: insights.slice(0, 5).map((i) => ({
      id: i.id,
      businessId: i.businessId,
      kind: i.kind,
      title: i.title,
      metric: i.metric,
      priority: i.priority,
    })),
  });
  writeAll(snaps);
}

/**
 * Join aged snapshots to current outcomes. Takes the newest snapshot at least `minAgeDays` old
 * (i.e. "what Helm said about a week ago") and reports each business-tied call against where that
 * business is trending now. Returns [] until enough history exists — so the receipt card stays
 * invisible until it has something real to show, then lights up with use.
 */
export function agedReceipts(
  businesses: Business[],
  metricsBy: Record<string, Metrics>,
  minAgeDays = 7,
): BacktestReceipt[] {
  const snaps = read();
  if (!snaps.length) return [];
  // Newest snapshot that is at least minAgeDays old — "the Brief from about a week ago".
  const aged = [...snaps].reverse().find((s) => daysAgo(s.day) >= minAgeDays);
  if (!aged) return [];

  const out: BacktestReceipt[] = [];
  for (const ins of aged.insights) {
    if (!ins.businessId) continue; // empire-level calls have no single-business outcome to show
    const m = metricsBy[ins.businessId];
    const b = businesses.find((x) => x.id === ins.businessId);
    if (!m || !b) continue; // business gone or no metrics → no honest outcome
    out.push({
      id: ins.id,
      title: ins.title,
      kind: ins.kind,
      daysAgo: daysAgo(aged.day),
      businessName: b.shortName ?? b.name,
      moveLabel: `${signedPct(m.wow, 0)} week over week`,
      improved: m.wow >= 0,
    });
    if (out.length >= 4) break;
  }
  return out;
}
