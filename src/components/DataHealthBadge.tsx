import { ShieldCheck, BadgeCheck, FlaskConical } from "lucide-react";
import type { DayPoint } from "../types";
import { dataHealth } from "../lib/reconcile";
import { asOfLabel } from "../lib/format";
import { Card, cx } from "./ui";

// Static class maps — Tailwind only emits classes it can see literally (no `text-${x}`).
const COV_TONE: Record<"up" | "brass" | "down", { text: string; bg: string }> = {
  up: { text: "text-up", bg: "bg-up" },
  brass: { text: "text-brass", bg: "bg-brass" },
  down: { text: "text-down", bg: "bg-down" },
};

/**
 * The persistent trust badge. The full DataHealth panel (with the POS cross-check input) lives in
 * the upload-preview flow; this is its compact, read-only sibling that rides on every business
 * detail screen so the owner ALWAYS sees how complete and how fresh Helm's read is — and whether
 * it's running on their REAL uploaded numbers or a modeled baseline. It's the on-screen answer to
 * "how do I know this is right?", kept visible after onboarding instead of only at import.
 *
 * Coverage / freshness / gaps are currency-agnostic (no $ total here, so it's safe on the CAD
 * motel and the USD shops alike); the dollars + reconciliation cross-check stay in the full panel.
 */
export function DataHealthBadge({
  series,
  modeled,
  modeledLabel = "Modeled on this business's public profile",
  source,
}: {
  series: DayPoint[];
  /** Hotels/motels: true when running on a modeled demo series (vs a real uploaded export). */
  modeled?: boolean;
  /** Shown under the badge when `modeled` is true — how to make it real. */
  modeledLabel?: string;
  /** The live "synced from" source (e.g. a PMS name) shown on the real-data pill. */
  source?: string;
}) {
  const h = dataHealth(series);
  if (!h) return null;
  const covPct = Math.round(h.coverage * 100);
  const covTone: "up" | "brass" | "down" = h.coverage >= 0.98 ? "up" : h.coverage >= 0.9 ? "brass" : "down";

  return (
    <Card className="space-y-2.5 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-brass" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-brass">Data health</span>
        </div>
        {modeled ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/45">
            <FlaskConical size={10} /> Modeled
          </span>
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-up/12 px-2 py-0.5 text-[10px] font-semibold text-up">
            <BadgeCheck size={10} className="shrink-0" />
            <span className="truncate">Your real numbers{source ? ` · ${source}` : ""}</span>
          </span>
        )}
      </div>

      {/* Coverage bar */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] text-white/55">Coverage</span>
          <span className={cx("text-[12px] font-semibold tabular-nums", COV_TONE[covTone].text)}>
            {h.days}/{h.expectedDays} days · {covPct}%
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className={cx("h-full rounded-full", COV_TONE[covTone].bg)}
            style={{ width: `${Math.min(100, covPct)}%` }}
          />
        </div>
      </div>

      {/* Freshness + gaps */}
      <div className="flex items-center justify-between text-[11.5px]">
        <span className="text-white/45">{asOfLabel(h.rangeEnd)}</span>
        <span className={cx("font-medium", h.freshnessDays <= 2 ? "text-up" : "text-brass")}>
          {h.freshnessDays === 0 ? "current" : `${h.freshnessDays}d behind`}
          {h.missingCount > 0 ? ` · ${h.missingCount} gap${h.missingCount > 1 ? "s" : ""}` : ""}
        </span>
      </div>

      {modeled && <p className="text-[11px] leading-snug text-white/35">{modeledLabel}</p>}
    </Card>
  );
}
