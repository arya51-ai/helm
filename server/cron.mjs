// Helm — nightly refresh scheduler (standalone connector service).
// ─────────────────────────────────────────────────────────────────────────────
// The server half of "your COO worked the night shift": each night just after local
// midnight, re-pull whatever connectors are configured so the morning's numbers are
// fresh, then regenerate + cache the morning Brief and queue a push. Pure setTimeout
// loop — no extra dependencies. Opt-in via HELM_CRON=1 (see server/index.mjs).
import "dotenv/config";

function msUntil(hour, min) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, min, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return Math.max(1000, next.getTime() - now.getTime());
}

/**
 * Start the nightly job. `onRun` is where a deployment wires the real work — re-pulling
 * Plaid balances / Tally / quotes, regenerating the Brief via the agent connector, and
 * dispatching the morning push. Left as a hook so the scheduler stays dependency-free
 * and the data side is pluggable.
 */
export function startNightlyRefresh(onRun = async () => {}) {
  const run = async () => {
    try {
      console.log(`[helm-cron] nightly refresh @ ${new Date().toISOString()}`);
      await onRun();
    } catch (e) {
      console.warn(`[helm-cron] run failed: ${e?.message ?? e}`);
    } finally {
      setTimeout(run, msUntil(0, 5));
    }
  };
  setTimeout(run, msUntil(0, 5));
  console.log(`[helm-cron] scheduled — next run in ~${Math.round(msUntil(0, 5) / 60000)} min`);
}
