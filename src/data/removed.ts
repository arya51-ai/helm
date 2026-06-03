/**
 * Businesses the owner has removed from their view. A small id set persisted in the
 * browser and applied as the final layer in `loadBusinesses`, so a removed business
 * stays gone across reloads — even a sample- or file-sourced one that can't be deleted
 * at its source. Reversible (`restoreRemoved`), so removal is never destructive.
 */
const LS_KEY = "helm:removed:v1";

export function readRemoved(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function addRemoved(id: string): void {
  try {
    const set = new Set(readRemoved());
    set.add(id);
    localStorage.setItem(LS_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore quota / private-mode */
  }
}

export function restoreRemoved(id: string): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(readRemoved().filter((x) => x !== id)));
  } catch {
    /* ignore */
  }
}

export function clearRemoved(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}
