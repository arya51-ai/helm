import { useState } from "react";
import {
  ChevronLeft,
  MapPin,
  BedDouble,
  Star,
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  BarChart3,
  Percent,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from "lucide-react";
import type { Business, HotelDay } from "../types";
import { hotelMetricsFor, type HotelMetrics } from "../lib/hotelAnalytics";
import { usd, usdCompact, pct, signedPct, shortDate, weekday } from "../lib/format";
import { Card, Delta, Sparkline, cx } from "./ui";
import { AreaTrend } from "./charts";

const RANGES = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
];

type KpiMode = "revpar" | "occupancy" | "adr" | "gop";

export function HotelDetail({
  business,
  onClose,
}: {
  business: Business;
  onClose: () => void;
}) {
  const [range, setRange] = useState(1);
  const [kpiMode, setKpiMode] = useState<KpiMode>("revpar");
  const m = hotelMetricsFor(business);
  if (!m || !business.hotelSeries) return null;

  const hs = business.hotelSeries;
  const days = RANGES[range].days;
  const slice = hs.slice(-days);

  const chartData = slice.map((d) => ({
    date: d.date,
    revenue:
      kpiMode === "revpar" ? d.revpar :
      kpiMode === "occupancy" ? d.occupancy * 100 :
      kpiMode === "adr" ? d.adr :
      d.gop,
  }));

  const compData = slice.map((d) => ({
    date: d.date,
    yours: d.revpar,
    compSet: d.compSetRevpar,
  }));

  return (
    <div className="fixed inset-0 z-40 mx-auto flex max-w-[440px] flex-col bg-[#0a263e]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.06] active:scale-90"
          >
            <ChevronLeft size={20} className="text-white" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[16px] font-bold leading-tight text-white">{business.name}</h1>
            <p className="flex items-center gap-1 text-[11px] text-white/40">
              <MapPin size={10} /> {business.location} · {business.brand} · {business.rooms} rooms
            </p>
          </div>
        </div>
        {business.reviewScore && (
          <div className="flex items-center gap-1 rounded-full bg-brass/12 px-2.5 py-1.5">
            <Star size={12} className="text-brass" fill="#e0ae49" />
            <span className="text-[12px] font-bold text-brass">{business.reviewScore.toFixed(1)}</span>
          </div>
        )}
      </div>

      <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-4 pb-10">
        {/* Hero KPI */}
        <div className="px-1">
          <p className="text-[12px] font-medium text-white/45">Today's RevPAR</p>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="text-[38px] font-bold tracking-tight text-white tabular-nums">
              ${m.todayRevpar.toFixed(0)}
            </span>
            <Delta value={m.occVsExpected} />
          </div>
          <p className="mt-1 text-[13px] text-white/45">
            {pct(m.todayOcc, 0)} occupancy · ${m.todayAdr.toFixed(0)} ADR
          </p>
        </div>

        {/* KPI switcher */}
        <div className="flex gap-1.5 rounded-full bg-white/[0.05] p-1">
          {(["revpar", "occupancy", "adr", "gop"] as KpiMode[]).map((k) => (
            <button
              key={k}
              onClick={() => setKpiMode(k)}
              className={cx(
                "flex-1 rounded-full py-1.5 text-[11px] font-semibold uppercase transition",
                kpiMode === k ? "bg-white text-black" : "text-white/50",
              )}
            >
              {k === "gop" ? "GOP" : k}
            </button>
          ))}
        </div>

        {/* Range selector */}
        <div className="flex gap-1.5 rounded-full bg-white/[0.05] p-1">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRange(i)}
              className={cx(
                "flex-1 rounded-full py-1.5 text-[12px] font-semibold transition",
                i === range ? "bg-white text-black" : "text-white/50",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Trend chart */}
        <Card className="p-3 pt-4">
          <AreaTrend data={chartData} color={business.accent} height={180} showAxis />
        </Card>

        {/* Core hotel KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Occupancy" value={pct(m.monthOcc, 0)} trend={m.occTrend7} />
          <Kpi label="ADR" value={`$${m.monthAdr.toFixed(0)}`} trend={m.adrTrend7} />
          <Kpi label="RevPAR" value={`$${m.monthRevpar.toFixed(0)}`} trend={m.revparTrend7} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Kpi label="GOP" value={usdCompact(m.monthGop)} trend={m.gopTrend7} />
          <Kpi label="GOP Margin" value={pct(m.monthGopMargin, 1)} accent={m.monthGopMargin >= 0.38 ? "text-up" : "text-brass"} est={business.costEstimated} />
          <Kpi label="Labor %" value={pct(m.monthLaborPct, 1)} accent={m.monthLaborPct > 0.33 ? "text-down" : "text-up"} est={business.costEstimated} />
          <Kpi label="RGI" value={m.monthRgi.toFixed(1)} accent={m.monthRgi >= 100 ? "text-up" : "text-down"} est={business.compEstimated} />
        </div>

        {business.costEstimated && (
          <p className="-mt-2.5 flex items-center gap-1.5 px-1 text-[11px] text-white/35">
            <EstChip /> GOP & labor estimated from typical margins — add a P&amp;L for exact figures.
          </p>
        )}

        {/* Revenue breakdown */}
        <Section title="Revenue Mix" hint="today">
          <Card className="p-5">
            <RevBar label="Rooms" amount={m.todayRoomRevenue} total={m.todayTotalRevenue} color={business.accent} />
            <RevBar label="F&B" amount={m.todayFbRevenue} total={m.todayTotalRevenue} color="#e0ae49" />
            <RevBar label="Other" amount={m.todayOtherRevenue} total={m.todayTotalRevenue} color="#e0ae49" />
            <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3">
              <span className="text-[13px] font-medium text-white/60">Total revenue</span>
              <span className="text-[15px] font-bold text-white tabular-nums">{usd(m.todayTotalRevenue)}</span>
            </div>
          </Card>
        </Section>

        {/* Comp set comparison */}
        <Section title="vs Comp Set" hint="STR benchmark">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] text-white/45">Your RevPAR</p>
                <p className="text-[24px] font-bold text-white tabular-nums">${m.todayRevpar.toFixed(0)}</p>
              </div>
              <div className="text-right">
                <p className="text-[12px] text-white/45">Comp Set</p>
                <p className="text-[24px] font-bold text-white/60 tabular-nums">${m.todayCompSetRevpar.toFixed(0)}</p>
              </div>
            </div>
            <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${Math.min(100, (m.monthRgi / 130) * 100)}%`,
                  background: m.monthRgi >= 100 ? business.accent : "#e2685c",
                }}
              />
              <div className="absolute inset-y-0 w-0.5 bg-white/60" style={{ left: `${(100 / 130) * 100}%` }} />
            </div>
            <p className="mt-2 text-[12px] text-white/45">
              RGI of {m.monthRgi.toFixed(1)} —{" "}
              {m.monthRgi >= 100
                ? `capturing ${(m.monthRgi - 100).toFixed(1)} points above fair share`
                : `${(100 - m.monthRgi).toFixed(1)} points below fair share`}
            </p>
            {business.compEstimated && (
              <p className="mt-2 flex items-center gap-1.5 border-t border-white/[0.06] pt-2.5 text-[11px] text-white/35">
                <EstChip /> Estimated at fair share — add your STR report for exact benchmarking.
              </p>
            )}
          </Card>
        </Section>

        {/* Occupancy by day of week */}
        <Section title="Occupancy Pattern" hint="by weekday">
          <Card className="p-5">
            <DowOccupancy series={hs} rooms={business.rooms ?? 100} color={business.accent} />
          </Card>
        </Section>

        {/* Recent days */}
        <Section title="Recent Days" hint="last 7">
          <Card className="divide-y divide-white/[0.05]">
            {hs.slice(-7).reverse().map((d) => (
              <div key={d.date} className="flex items-center gap-3 p-3.5">
                <div className="w-12 shrink-0">
                  <p className="text-[13px] font-semibold text-white">{weekday(d.date)}</p>
                  <p className="text-[11px] text-white/40">{shortDate(d.date)}</p>
                </div>
                <div className="flex-1 text-center">
                  <p className="text-[12px] font-semibold text-white tabular-nums">{pct(d.occupancy, 0)}</p>
                  <p className="text-[9px] text-white/30">OCC</p>
                </div>
                <div className="flex-1 text-center">
                  <p className="text-[12px] font-semibold text-white tabular-nums">${d.adr.toFixed(0)}</p>
                  <p className="text-[9px] text-white/30">ADR</p>
                </div>
                <div className="flex-1 text-center">
                  <p className="text-[12px] font-semibold text-white tabular-nums">${d.revpar.toFixed(0)}</p>
                  <p className="text-[9px] text-white/30">RevPAR</p>
                </div>
                <RgiDot rgi={d.rgi} />
              </div>
            ))}
          </Card>
        </Section>

        {/* PIP items */}
        {business.pipItems && business.pipItems.length > 0 && (
          <Section title="PIP Compliance" hint={`${business.pipItems.length} items`}>
            <Card className="divide-y divide-white/[0.05]">
              {business.pipItems.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3.5">
                  {p.status === "overdue" && <AlertTriangle size={16} className="shrink-0 text-down" />}
                  {p.status === "in-progress" && <Clock size={16} className="shrink-0 text-brass" />}
                  {p.status === "complete" && <CheckCircle2 size={16} className="shrink-0 text-up" />}
                  {p.status === "upcoming" && <Clock size={16} className="shrink-0 text-white/30" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-white">{p.title}</p>
                    <p className="text-[11px] text-white/40">
                      {p.category} · Due {p.deadline}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[12px] font-semibold text-white tabular-nums">{usdCompact(p.estimatedCost)}</p>
                    <p className={cx(
                      "text-[10px] font-medium capitalize",
                      p.status === "overdue" ? "text-down" :
                      p.status === "complete" ? "text-up" :
                      p.status === "in-progress" ? "text-brass" :
                      "text-white/35"
                    )}>
                      {p.status}
                    </p>
                  </div>
                </div>
              ))}
            </Card>
            <p className="mt-2 px-1 text-[11px] text-white/35">
              Total PIP budget: {usdCompact(business.pipItems.reduce((a, p) => a + p.estimatedCost, 0))}
              {" · "}Spent: {usdCompact(business.pipItems.reduce((a, p) => a + (p.actualCost ?? 0), 0))}
            </p>
          </Section>
        )}
      </div>
    </div>
  );
}

function DowOccupancy({
  series,
  rooms,
  color,
}: {
  series: HotelDay[];
  rooms: number;
  color: string;
}) {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const recent = series.slice(-28);
  const byDow = labels.map((_, i) => {
    const days = recent.filter((d) => new Date(`${d.date}T00:00:00`).getDay() === i);
    return days.length ? days.reduce((a, d) => a + d.occupancy, 0) / days.length : 0;
  });
  const max = Math.max(...byDow, 0.5);
  const bestIdx = byDow.indexOf(Math.max(...byDow));
  const worstIdx = byDow.indexOf(Math.min(...byDow.filter((v) => v > 0)));

  return (
    <div>
      <div className="flex h-[100px] items-end justify-between gap-1.5">
        {byDow.map((occ, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end">
            <div
              className="w-full rounded-t-md"
              style={{
                height: `${occ ? Math.max(4, (occ / max) * 100) : 0}%`,
                background: i === bestIdx ? color : i === worstIdx ? "#e2685caa" : `${color}59`,
              }}
            />
            <span className={cx("mt-1 text-[10px]", i === bestIdx ? "font-bold text-white/80" : "text-white/40")}>
              {labels[i]}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-white/40">
        {labels[bestIdx]} averages {pct(byDow[bestIdx], 0)} occupancy
        {" · "}{labels[worstIdx]} lowest at {pct(byDow[worstIdx], 0)}
      </p>
    </div>
  );
}

function RevBar({ label, amount, total, color }: { label: string; amount: number; total: number; color: string }) {
  const share = total ? amount / total : 0;
  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-white/65">{label}</span>
        <span className="font-semibold text-white/90 tabular-nums">
          {usd(amount)} <span className="text-white/35">· {pct(share, 0)}</span>
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: color }} />
      </div>
    </div>
  );
}

function RgiDot({ rgi }: { rgi: number }) {
  return (
    <span
      className={cx(
        "rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
        rgi >= 100 ? "bg-up/12 text-up" : "bg-down/12 text-down",
      )}
    >
      {rgi.toFixed(0)}
    </span>
  );
}

function Kpi({ label, value, trend, accent, est }: { label: string; value: string; trend?: number; accent?: string; est?: boolean }) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] font-medium text-white/45">{label}</p>
        {est && <EstChip />}
      </div>
      <p className={cx("mt-1 text-[18px] font-bold tracking-tight tabular-nums", accent ?? "text-white")}>{value}</p>
      {trend != null && <Delta value={trend} className="mt-1" />}
    </Card>
  );
}

/** A quiet "est." qualifier — this number was defaulted/estimated, not measured. Muted on
 *  purpose (vs the up/down RGI chips) so it reads as a footnote, not an alert. */
function EstChip() {
  return (
    <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/45">
      est.
    </span>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-[14px] font-semibold text-white/90">{title}</h2>
        {hint && <span className="text-[11px] text-white/35">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
