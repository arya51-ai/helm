/**
 * Per-business monthly revenue goals, persisted in the browser. Stored in the app's
 * DISPLAY currency (USD) — the same basis as the loaded series — so pace-to-goal is a
 * direct comparison with no conversion. Set/cleared from the business detail.
 */
const LS_KEY = "helm:goals:v1";

export function readGoals(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

export function goalFor(id: string): number {
  const g = readGoals()[id];
  return typeof g === "number" && g > 0 ? g : 0;
}

export function setGoal(id: string, monthlyUsd: number): void {
  try {
    const all = readGoals();
    if (monthlyUsd > 0) all[id] = Math.round(monthlyUsd);
    else delete all[id];
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* ignore quota / private-mode */
  }
}
