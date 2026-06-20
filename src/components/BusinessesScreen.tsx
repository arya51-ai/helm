import { Plus, MapPin, ChevronRight } from "lucide-react";
import type { Business } from "../types";
import type { Metrics } from "../lib/analytics";
import { usd, usdCompact, signedPct } from "../lib/format";
import { Card, Delta, Sparkline, cx } from "./ui";

export function BusinessesScreen({
  businesses,
  metricsBy,
  onOpenBusiness,
  onAdd,
}: {
  businesses: Business[];
  metricsBy: Record<string, Metrics>;
  onOpenBusiness: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="animate-fade-up space-y-4 px-4 pb-6 pt-2">
      <header className="flex items-center justify-between px-1 pt-1">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-white">Businesses</h1>
          <p className="text-[13px] text-white/45">{businesses.length} connected · live</p>
        </div>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[13px] font-semibold text-black active:scale-95"
        >
          <Plus size={16} strokeWidth={2.6} /> Add
        </button>
      </header>

      <div className="space-y-3">
        {businesses.map((b) => {
          const m = metricsBy[b.id];
          const spark = b.series.slice(-21).map((p) => p.revenue);
          const isPort = b.type === "portfolio";
          return (
            <Card key={b.id} className="p-4" onClick={() => onOpenBusiness(b.id)}>
              <div className="flex items-center gap-3">
                <div
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-[17px] font-bold"
                  style={{ background: `${b.accent}22`, color: b.accent }}
                >
                  {b.name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-white">{b.name}</p>
                  <p className="flex items-center gap-1 text-[12px] text-white/40">
                    <MapPin size={11} /> {b.location} · {b.category}
                  </p>
                </div>
                <ChevronRight size={18} className="text-white/25" />
              </div>

              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-[11px] text-white/40">{isPort ? "Market value" : "Today"}</p>
                  <p className="text-[22px] font-bold text-white tabular-nums">
                    {isPort ? usd(m.marketValue) : usd(m.today)}
                  </p>
                  <Delta
                    value={isPort ? m.dayChange : m.vsExpected}
                    text={
                      isPort
                        ? signedPct(m.dayChange)
                        : `${signedPct(m.vsExpected)} vs usual`
                    }
                    className="mt-1"
                  />
                </div>
                <Sparkline data={spark} color={b.accent} width={120} height={48} />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3">
                {isPort ? (
                  <>
                    <Mini label="Total gain" value={usdCompact(m.totalGain)} accent="text-up" />
                    <Mini label="Return" value={signedPct(m.totalReturn)} />
                    <Mini label="Positions" value={String(b.holdings?.length ?? 0)} />
                  </>
                ) : (
                  <>
                    <Mini label="This month" value={usdCompact(m.last30)} />
                    <Mini label="Profit/mo" value={usdCompact(m.monthlyProfit)} />
                    <Mini label="Avg ticket" value={usd(m.avgTicket, true)} />
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Add-a-business affordance */}
      <button
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-2 rounded-3xl border border-dashed border-white/15 py-5 text-[14px] font-medium text-white/50 active:scale-[0.99]"
      >
        <Plus size={18} /> Add a business — snap a daily close
      </button>
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="text-[11px] text-white/40">{label}</p>
      <p className={cx("mt-0.5 text-[14px] font-semibold tabular-nums", accent ?? "text-white")}>
        {value}
      </p>
    </div>
  );
}
