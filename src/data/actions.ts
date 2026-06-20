/**
 * Tracked actions, persisted in the browser. This is what turns Helm from an advisor
 * into a COO that closes loops: when the owner sends a Claude-drafted action (the message
 * to a manager, the reorder note, the cash-move rationale), we record it here so the brief
 * can surface the open loop and let them mark it done. We never send or move money — this
 * just tracks the human-in-the-loop artifact through drafted → sent → done.
 *
 * Same storage idiom as overrides.ts / goals.ts: a versioned key, JSON parse guarded,
 * silent on quota / private-mode failures.
 */
const LS_KEY = "helm:actions:v1";

export type ActionKind = "message" | "reorder" | "capital" | "task";
export type ActionStatus = "drafted" | "sent" | "done";

export interface TrackedAction {
  id: string;
  /** Business this action belongs to, when it came from a unit-scoped insight. */
  businessId?: string;
  /** The insight headline that prompted it, for context in the open-loops list. */
  insightTitle?: string;
  /** The drafted artifact — the actual text the owner reviewed and sent. */
  draftText: string;
  kind: ActionKind;
  status: ActionStatus;
  createdAt: number;
  sentAt?: number;
  doneAt?: number;
}

export function list(): TrackedAction[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as TrackedAction[]) : [];
  } catch {
    return [];
  }
}

function writeAll(actions: TrackedAction[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(actions));
  } catch {
    /* ignore quota / private-mode */
  }
}

function makeId(): string {
  // Crypto when available, otherwise good enough for a local log.
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Append a new tracked action. Pass the fields you know; id/createdAt are filled in.
 * Newest is stored last but `list()` consumers can sort however they like.
 */
export function add(
  input: Omit<TrackedAction, "id" | "createdAt" | "status"> & { status?: ActionStatus },
): TrackedAction {
  const now = Date.now();
  const action: TrackedAction = {
    id: makeId(),
    createdAt: now,
    status: input.status ?? "drafted",
    businessId: input.businessId,
    insightTitle: input.insightTitle,
    draftText: input.draftText,
    kind: input.kind,
    sentAt: input.status === "sent" ? now : input.sentAt,
    doneAt: input.status === "done" ? now : input.doneAt,
  };
  const all = list();
  all.push(action);
  writeAll(all);
  return action;
}

/** Move an action to a new status, stamping sentAt / doneAt as it crosses each line. */
export function setStatus(id: string, status: ActionStatus): void {
  const now = Date.now();
  const all = list().map((a) => {
    if (a.id !== id) return a;
    return {
      ...a,
      status,
      sentAt: status === "sent" && !a.sentAt ? now : a.sentAt,
      doneAt: status === "done" ? now : a.doneAt,
    };
  });
  writeAll(all);
}

export function remove(id: string): void {
  writeAll(list().filter((a) => a.id !== id));
}
