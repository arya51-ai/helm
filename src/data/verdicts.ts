/**
 * Owner verdicts on insights — the "owner as judge" half of the Trust Layer. An owner can mark a
 * Brief card useful (confirm), not-useful, or dismiss it; we persist that here so the ranked feed
 * honors their judgment — confirmed cards float, not-useful cards sink, dismissed cards drop out
 * of the Brief — and so the AI context can tell Claude to stop resurfacing a read the owner already
 * rejected. This is what turns Helm from a feed that talks AT the owner into one that listens:
 * every verdict tunes what surfaces tomorrow, and over time the feedback loop is a moat a generic
 * wrapper can't copy.
 *
 * Same storage idiom as overrides.ts / actions.ts: a versioned key, JSON parse guarded, silent on
 * quota / private-mode failures. Verdicts key on the insight's STABLE id (e.g.
 * `motel-commission-<bizId>`, `deep-yoy-<bizId>`), so a verdict survives the daily series
 * roll-forward. Date-stamped anomaly ids (`anom-...-<date>`) are inherently day-scoped and won't
 * persist across days — acceptable, since an anomaly is a one-day event, not a standing judgment.
 */
import { readProfileId } from "./profiles";

// Namespaced per demo persona, so each persona's verdicts are its own world. Helm is a
// multi-persona demo tool (motel / shops / hotel group switch in place via Settings); without
// this, one owner's judgments would bleed into another's feed.
const keyFor = () => `helm:verdicts:v1:${readProfileId()}`;

export type Verdict = "confirmed" | "dismissed" | "not-useful";

export interface VerdictEntry {
  verdict: Verdict;
  /** When the owner set it (epoch ms) — kept for future "you dismissed this N days ago" copy. */
  at: number;
}

export function readVerdicts(): Record<string, VerdictEntry> {
  try {
    const raw = localStorage.getItem(keyFor());
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

export function setVerdict(id: string, verdict: Verdict): void {
  try {
    const all = readVerdicts();
    all[id] = { verdict, at: Date.now() };
    localStorage.setItem(keyFor(), JSON.stringify(all));
  } catch {
    /* ignore quota / private-mode */
  }
}

export function clearVerdict(id: string): void {
  try {
    const all = readVerdicts();
    delete all[id];
    localStorage.setItem(keyFor(), JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function clearVerdicts(): void {
  try {
    localStorage.removeItem(keyFor());
  } catch {
    /* ignore */
  }
}
