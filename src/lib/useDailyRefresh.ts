import { useEffect, useRef } from "react";

/** A stable per-day key in LOCAL time, e.g. "2026-5-3". */
function localDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Milliseconds until just after the next local midnight (+5s cushion). */
function msUntilNextMidnight(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 5, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

/**
 * Rolls the app's data forward at local midnight — and when the tab regains focus on a
 * new calendar day (handles the laptop-asleep-overnight case). Calls `onRefresh`, which
 * is the same loadBusinesses() pipeline the manual Refresh button uses, so "today"
 * advances without the owner reopening the app. This is the client half of Helm's
 * "your COO worked the night shift" refresh; the server cron is the other half.
 */
export function useDailyRefresh(onRefresh: () => void): void {
  const lastDate = useRef(localDateKey());
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    let timer = 0;
    const fire = () => {
      lastDate.current = localDateKey();
      cb.current();
    };
    const schedule = () => {
      timer = window.setTimeout(() => {
        fire();
        schedule();
      }, msUntilNextMidnight());
    };
    schedule();

    // Fire only when the local calendar day has actually changed since the last load —
    // that date check is the real gate (a refresh on any wake is otherwise harmless).
    const onWake = () => {
      if (localDateKey() !== lastDate.current) fire();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, []);
}
