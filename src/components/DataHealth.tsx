import { useState } from "react";
import { ShieldCheck, AlertTriangle, CheckCircle2, CircleSlash } from "lucide-react";
import type { DayPoint } from "../types";
import { dataHealth, reconcile, type ReconcileStatus } from "../lib/reconcile";
import { money, shortDate } from "../lib/format";
import { Card, cx } from "./ui";

// Static class maps — Tailwind only generates classes it can see literally, so no `text-${tone}`.
const TONE: Record<"up" | "brass" | "down", { text: string; bg: string }> = {
  up: { text: "text-up", bg: "bg-up" },
  brass: { text: "text-brass", bg: "bg-brass" },
  down: { text: "text-down", bg: "bg-down" },
};
const STATUS_TEXT: Record<ReconcileStatus, string> = { match: "text-up", close: "text-brass", off: "text-down" };

/**
 * The trust panel. Shows coverage / freshness / gaps for an imported series, and lets the
 * owner type the total from their own POS report to confirm Helm's numbers line up. This is
 * the on-screen answer to "how do I know it's showing everything correctly?"
 */
export function DataHealth({
  series,
  currency = "USD",
  title = "Data health",
}: {
  series: DayPoint[];
  currency?: string;
  title?: string;
}) {
  const h = dataHealth(series);
  const [reported, setReported] = useState("");
  const [showGaps, setShowGaps] = useState(false);
  if (!h) return null;

  const covPct = Math.round(h.coverage * 100);
  const covTone: "up" | "brass" | "down" = h.coverage >= 0.98 ? "up" : h.coverage >= 0.9 ? "brass" : "down";
  const reportedNum = parseFloat(reported.replace(/[^0-9.]/g, ""));
  const rec = reconcile(h.totalRevenue, reportedNum);

  return (
    <Card className="space-y-3.5 p-4">
      <div className="flex items-center gap-1.5">
        <ShieldCheck size={15} className="text-brass" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-brass">{title}</span>
      </div>

      {/* Coverage */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-white/60">Coverage</span>
          <span className={cx("text-[13px] font-semibold tabular-nums", TONE[covTone].text)}>
            {h.days} of {h.expectedDays} days · {covPct}%
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
          <div className={cx("h-full rounded-full", TONE[covTone].bg)} style={{ width: `${Math.min(100, covPct)}%` }} />
        </div>
      </div>

      {/* Range + freshness */}
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-white/45 tabular-nums">
          {shortDate(h.rangeStart)} → {shortDate(h.rangeEnd)}
        </span>
        <span className={cx("font-medium", h.freshnessDays <= 2 ? "text-up" : "text-brass")}>
          {h.freshnessDays === 0 ? "current" : `${h.freshnessDays}d behind`}
        </span>
      </div>

      {/* Gaps */}
      {h.missingCount > 0 && (
        <div className="text-[12px]">
          <button
            onClick={() => setShowGaps((v) => !v)}
            className="flex items-center gap-1.5 font-medium text-down"
          >
            <AlertTriangle size={13} />
            {h.missingCount} missing day{h.missingCount > 1 ? "s" : ""} in range
            <span className="text-white/35">· {showGaps ? "hide" : "show"}</span>
          </button>
          {showGaps && (
            <div className="mt-2 flex flex-wrap gap-1">
              {h.missing.map((d) => (
                <span key={d} className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[11px] tabular-nums text-white/55">
                  {shortDate(d)}
                </span>
              ))}
              {h.missingCount > h.missing.length && (
                <span className="px-1 py-0.5 text-[11px] text-white/35">+{h.missingCount - h.missing.length} more</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cross-check / reconciliation */}
      <div className="border-t border-white/[0.06] pt-3">
        <label className="text-[12px] text-white/60">Cross-check — what total does your POS report for this range?</label>
        <input
          value={reported}
          onChange={(e) => setReported(e.target.value)}
          inputMode="decimal"
          placeholder="e.g. 154,100"
          className="mt-1.5 w-full min-w-0 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[14px] font-semibold text-white outline-none placeholder:text-white/25 focus:border-brass/40"
        />
        {rec && (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            {rec.status === "match" ? (
              <CheckCircle2 size={15} className="text-up" />
            ) : rec.status === "close" ? (
              <AlertTriangle size={15} className="text-brass" />
            ) : (
              <CircleSlash size={15} className="text-down" />
            )}
            <span className={cx("text-[13px] font-semibold tabular-nums", STATUS_TEXT[rec.status])}>
              {(rec.matchPct * 100).toFixed(1)}% match
            </span>
            <span className="text-[12px] text-white/45">
              {rec.status === "match"
                ? "numbers line up ✓"
                : `${rec.diff >= 0 ? "+" : "−"}${money(Math.abs(rec.diff), currency)} vs your total`}
            </span>
          </div>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-white/35">
          Helm read <b className="text-white/55">{money(h.totalRevenue, currency)}</b> across {h.days} days. Compare it to
          the total on your POS's own report — if they match, the data is trustworthy.
        </p>
      </div>
    </Card>
  );
}
