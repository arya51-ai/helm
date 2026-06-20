import { useState } from "react";
import { ChevronLeft, Trophy, ArrowDownRight } from "lucide-react";
import { usdCompact } from "../lib/format";
import { UNIT_METRICS, type UnitGroup, type UnitStat } from "../lib/unitBenchmark";
import { Card, cx } from "./ui";

// The bar selector offers every metric (incl. trend); the table shows the four headline
// ones so it fits a phone width without horizontal scroll.
const TABLE_METRICS = UNIT_METRICS.filter((m) => m.key !== "trend");

/**
 * Same-brand units head-to-head. Pick a metric and every unit lines up against it — the leader
 * crowned, the laggard flagged — then a full table and the leader→laggard gap as money on the
 * table. The multi-unit operator's "which of mine is winning, and what's the gap worth."
 */
export function CompareUnits({ group, onClose }: { group: UnitGroup; onClose: () => void }) {
  const [metric, setMetric] = useState(0);
  const def = UNIT_METRICS[metric];
  const vals = group.units.map((u) => u[def.key] as number);
  const maxAbs = Math.max(...vals.map((v) => Math.abs(v)), 0.0001);
  const bestVal = Math.max(...vals);
  const worstVal = Math.min(...vals);

  return (
    <div className="fixed inset-0 z-40 mx-auto flex max-w-[440px] flex-col bg-[#0a263e]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-5">
        <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.06] active:scale-90">
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[18px] font-bold tracking-tight text-white">Compare your {group.brand}s</h1>
          <p className="truncate text-[12px] text-white/45">
            {group.units.length} units · same brand, head-to-head
          </p>
        </div>
      </div>

      <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 pb-10 pt-1">
        {/* Metric selector */}
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
          {UNIT_METRICS.map((m, i) => (
            <button
              key={m.key}
              onClick={() => setMetric(i)}
              className={cx(
                "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition",
                metric === i ? "bg-white text-[#071e33]" : "bg-white/[0.05] text-white/50",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Bars for the selected metric */}
        <Card className="space-y-3 p-5">
          <p className="text-[12px] font-medium text-white/45">{def.label} · last 30 days</p>
          {group.units.map((u) => {
            const v = u[def.key] as number;
            const isBest = v === bestVal;
            const isWorst = v === worstVal && bestVal !== worstVal;
            const color = isBest ? "#34c79a" : isWorst ? "#e2685c" : u.accent;
            return (
              <div key={u.id}>
                <div className="mb-1 flex items-center justify-between text-[12.5px]">
                  <span className="flex items-center gap-1.5 text-white/80">
                    {isBest && <Trophy size={12} className="text-up" />}
                    {isWorst && <ArrowDownRight size={12} className="text-down" />}
                    {u.shortName}
                  </span>
                  <span className="font-semibold tabular-nums" style={{ color }}>
                    {def.fmt(v)}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.max(3, (Math.abs(v) / maxAbs) * 100)}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </Card>

        {/* Full table — the four headline metrics (trend lives in the bar selector above) */}
        <Card className="p-4">
          <p className="mb-2.5 text-[12px] font-medium text-white/45">All metrics</p>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-white/35">
                <th className="py-1 pr-1 text-left font-medium">Unit</th>
                {TABLE_METRICS.map((m) => (
                  <th key={m.key} className="px-1 py-1 text-right font-medium">
                    {m.label.replace(" / day", "/d").replace("Return on capital", "ROIC").replace("Avg ", "")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.units.map((u) => (
                <tr key={u.id} className="border-t border-white/[0.05]">
                  <td className="py-2 pr-1 font-semibold text-white">{u.shortName}</td>
                  {TABLE_METRICS.map((m) => {
                    const v = u[m.key] as number;
                    const colVals = group.units.map((x) => x[m.key] as number);
                    const best = v === Math.max(...colVals) && Math.max(...colVals) !== Math.min(...colVals);
                    return (
                      <td
                        key={m.key}
                        className={cx("px-1 py-2 text-right tabular-nums", best ? "font-bold text-up" : "text-white/70")}
                      >
                        {m.fmt(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* The gap */}
        <Card className="border-brass/20 bg-brass/[0.06] p-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-brass">The gap</p>
          <h3 className="mt-1.5 text-[16px] font-semibold leading-snug text-white">
            {group.laggard.shortName} trails {group.leader.shortName} by {usdCompact(group.monthlyGap)}/mo
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">
            Same brand, same menu, same prices — so the gap is execution, not the market. Closing half of it
            lifts the group by ~<span className="font-semibold text-white">{usdCompact(group.monthlyGap / 2)}/mo</span>.
            Start with what {group.leader.shortName} does on ticket and traffic, and run it at {group.laggard.shortName}.
          </p>
        </Card>
      </div>
    </div>
  );
}

export type { UnitStat };
