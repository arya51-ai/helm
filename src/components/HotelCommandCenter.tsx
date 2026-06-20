import { useState } from "react";
import {
  Building2,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Star,
  Users,
  DollarSign,
  BedDouble,
  BarChart3,
  Award,
  AlertTriangle,
  Clock,
  CheckCircle2,
  MapPin,
} from "lucide-react";
import type { Business, HotelPortfolioMetrics, Insight } from "../types";
import { hotelMetricsFor } from "../lib/hotelAnalytics";
import { usd, usdCompact, pct, signedPct } from "../lib/format";
import { Card, Delta, Sparkline, cx } from "./ui";
import { InsightCard } from "./BriefScreen";

type SubTab = "overview" | "properties" | "competitive" | "operations";

export function HotelCommandCenter({
  hotels,
  portfolio,
  insights,
  onOpenHotel,
  onToast,
  onDraft,
}: {
  hotels: Business[];
  portfolio: HotelPortfolioMetrics;
  insights: Insight[];
  onOpenHotel: (id: string) => void;
  onToast: (m: string) => void;
  onDraft: (insight: Insight) => void;
}) {
  const [sub, setSub] = useState<SubTab>("overview");

  return (
    <div className="animate-fade-up space-y-4 px-4 pb-6 pt-2">
      <header className="px-1 pt-1">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-brass/15">
            <Building2 size={16} className="text-brass" />
          </div>
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-white">Portfolio Command Center</h1>
            <p className="text-[12px] text-white/45">
              {hotels.length} {hotels.length === 1 ? "property" : "properties"} · {portfolio.totalRooms.toLocaleString()} rooms
            </p>
          </div>
        </div>
      </header>

      {/* Sub-tabs */}
      <div className="flex gap-1.5 rounded-full bg-white/[0.05] p-1">
        {(["overview", "properties", "competitive", "operations"] as SubTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setSub(t)}
            className={cx(
              "flex-1 rounded-full py-1.5 text-[11px] font-semibold capitalize transition",
              sub === t ? "bg-white text-black" : "text-white/50",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {sub === "overview" && (
        <OverviewTab
          hotels={hotels}
          portfolio={portfolio}
          insights={insights}
          onOpenHotel={onOpenHotel}
          onToast={onToast}
          onDraft={onDraft}
        />
      )}
      {sub === "properties" && (
        <PropertiesTab hotels={hotels} onOpenHotel={onOpenHotel} />
      )}
      {sub === "competitive" && (
        <CompetitiveTab hotels={hotels} portfolio={portfolio} />
      )}
      {sub === "operations" && (
        <OperationsTab hotels={hotels} portfolio={portfolio} />
      )}
    </div>
  );
}

function OverviewTab({
  hotels,
  portfolio,
  insights,
  onOpenHotel,
  onToast,
  onDraft,
}: {
  hotels: Business[];
  portfolio: HotelPortfolioMetrics;
  insights: Insight[];
  onOpenHotel: (id: string) => void;
  onToast: (m: string) => void;
  onDraft: (insight: Insight) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Hero KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <HeroKpi
          label="Portfolio RevPAR"
          value={`$${portfolio.avgRevpar.toFixed(0)}`}
          icon={BarChart3}
          accent="text-brass"
          trend={portfolio.properties[0]?.revparTrend}
        />
        <HeroKpi
          label="Avg Occupancy"
          value={pct(portfolio.avgOccupancy, 0)}
          icon={BedDouble}
          accent="text-up"
          trend={portfolio.properties[0]?.occupancyTrend}
        />
        <HeroKpi
          label="Monthly Revenue"
          value={usdCompact(portfolio.totalRevenue)}
          icon={DollarSign}
          accent="text-brass"
        />
        <HeroKpi
          label="Portfolio GOP"
          value={usdCompact(portfolio.totalGop)}
          icon={TrendingUp}
          accent="text-info"
          sub={`${pct(portfolio.avgGopMargin, 0)} margin`}
        />
      </div>

      {/* Portfolio RGI gauge */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] font-medium text-white/45">RevPAR Index (RGI)</p>
            <p className="mt-1 text-[32px] font-bold tracking-tight text-white tabular-nums">
              {portfolio.avgRgi.toFixed(1)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-white/35">100 = fair share</p>
            <span
              className={cx(
                "mt-1 inline-block rounded-md px-2 py-0.5 text-[12px] font-bold",
                portfolio.avgRgi >= 100
                  ? "bg-up/12 text-up"
                  : "bg-down/12 text-down",
              )}
            >
              {portfolio.avgRgi >= 100 ? "Winning" : "Below fair share"}
            </span>
          </div>
        </div>
        <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all"
            style={{
              width: `${Math.min(100, (portfolio.avgRgi / 130) * 100)}%`,
              background: portfolio.avgRgi >= 100 ? "#34c79a" : "#e2685c",
            }}
          />
          <div
            className="absolute inset-y-0 w-0.5 bg-white/60"
            style={{ left: `${(100 / 130) * 100}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-white/35">
          <span>70</span>
          <span>Fair share (100)</span>
          <span>130+</span>
        </div>
      </Card>

      {/* Quick property ranking */}
      <div>
        <SectionTitle>Property Ranking</SectionTitle>
        <Card className="divide-y divide-white/[0.05]">
          {portfolio.properties.map((p, i) => (
            <button
              key={p.id}
              onClick={() => onOpenHotel(p.id)}
              className="flex w-full items-center gap-3 p-3.5 text-left active:bg-white/[0.02]"
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[12px] font-bold"
                style={{ background: `${p.accent}22`, color: p.accent }}
              >
                #{i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-white">{p.shortName}</p>
                <p className="text-[11px] text-white/40">{p.brand} · {p.rooms} rooms</p>
              </div>
              <div className="text-right">
                <p className="text-[13px] font-semibold text-white tabular-nums">${p.revpar.toFixed(0)}</p>
                <p className="text-[10px] text-white/40">RevPAR</p>
              </div>
              <RgiChip rgi={p.rgi} />
              <ChevronRight size={16} className="text-white/25" />
            </button>
          ))}
        </Card>
      </div>

      {/* Review scores */}
      <div>
        <SectionTitle>Guest Satisfaction</SectionTitle>
        <Card className="divide-y divide-white/[0.05]">
          {portfolio.properties
            .slice()
            .sort((a, b) => b.reviewScore - a.reviewScore)
            .map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3.5">
                <Star
                  size={16}
                  className={p.reviewScore >= 4.0 ? "text-brass" : "text-down"}
                  fill={p.reviewScore >= 4.0 ? "#e0ae49" : "#e2685c"}
                />
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-white">{p.shortName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-white tabular-nums">{p.reviewScore.toFixed(1)}</span>
                  <span className="text-[11px] text-white/35">/5</span>
                </div>
              </div>
            ))}
        </Card>
      </div>

      {/* AI insights */}
      {insights.length > 0 && (
        <div>
          <SectionTitle>AI Insights</SectionTitle>
          <div className="space-y-3">
            {insights.slice(0, 5).map((i) => (
              <InsightCard
                key={i.id}
                insight={i}
                onAction={onToast}
                onOpen={i.businessId ? () => onOpenHotel(i.businessId!) : undefined}
                onDraft={i.action ? () => onDraft(i) : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PropertiesTab({
  hotels,
  onOpenHotel,
}: {
  hotels: Business[];
  onOpenHotel: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {hotels.map((h) => {
        const m = hotelMetricsFor(h);
        if (!m) return null;
        const spark = h.hotelSeries?.slice(-21).map((d) => d.revpar) ?? [];
        return (
          <Card key={h.id} className="p-4" onClick={() => onOpenHotel(h.id)}>
            <div className="flex items-center gap-3">
              <div
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-[13px] font-bold"
                style={{ background: `${h.accent}22`, color: h.accent }}
              >
                {h.brand?.charAt(0) ?? "H"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-white">{h.name}</p>
                <p className="flex items-center gap-1 text-[12px] text-white/40">
                  <MapPin size={11} /> {h.location} · {h.rooms} rooms · {h.brand}
                </p>
              </div>
              <ChevronRight size={18} className="text-white/25" />
            </div>

            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-[11px] text-white/40">RevPAR (30d avg)</p>
                <p className="text-[22px] font-bold text-white tabular-nums">${m.monthRevpar.toFixed(0)}</p>
                <Delta value={m.revparTrend30} className="mt-1" />
              </div>
              <Sparkline data={spark} color={h.accent} width={120} height={48} />
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2 border-t border-white/[0.06] pt-3">
              <Mini label="Occupancy" value={pct(m.monthOcc, 0)} />
              <Mini label="ADR" value={usd(m.monthAdr)} />
              <Mini label="RGI" value={m.monthRgi.toFixed(0)} accent={m.monthRgi >= 100 ? "text-up" : "text-down"} />
              <Mini label="GOP" value={pct(m.monthGopMargin, 0)} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function CompetitiveTab({
  hotels,
  portfolio,
}: {
  hotels: Business[];
  portfolio: HotelPortfolioMetrics;
}) {
  const compEstById = new Map(hotels.map((h) => [h.id, !!h.compEstimated]));
  const anyCompEst = hotels.some((h) => h.compEstimated);
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="text-[12px] font-medium text-white/45">STR Competitive Benchmarking</p>
        <p className="mt-1 text-[11px] text-white/35">
          RevPAR Index (RGI) measures your fair share vs the comp set. 100 = par.
        </p>
        <div className="mt-4 space-y-4">
          {portfolio.properties.map((p) => (
            <div key={p.id}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-white">
                  {p.shortName}
                  {compEstById.get(p.id) && <EstChip />}
                </span>
                <span
                  className={cx(
                    "text-[13px] font-bold tabular-nums",
                    p.rgi >= 100 ? "text-up" : "text-down",
                  )}
                >
                  {p.rgi.toFixed(1)}
                </span>
              </div>
              <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${Math.min(100, (p.rgi / 130) * 100)}%`,
                    background: p.rgi >= 100 ? p.accent : "#e2685c",
                  }}
                />
                <div
                  className="absolute inset-y-0 w-px bg-white/40"
                  style={{ left: `${(100 / 130) * 100}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-white/30">
                <span>RevPAR ${p.revpar.toFixed(0)}</span>
                <span>{p.rgi >= 100 ? `+${(p.rgi - 100).toFixed(1)} above fair share` : `${(100 - p.rgi).toFixed(1)} below fair share`}</span>
              </div>
            </div>
          ))}
        </div>
        {anyCompEst && (
          <EstNote>RGI marked “est.” is shown at fair share (100) — add your STR report for exact benchmarking.</EstNote>
        )}
      </Card>

      {/* ADR vs Occupancy quadrant */}
      <Card className="p-5">
        <p className="text-[12px] font-medium text-white/45">Rate vs Volume Strategy</p>
        <p className="mt-1 text-[11px] text-white/35">
          Where each property sits on the rate/occupancy curve
        </p>
        <div className="mt-4 space-y-3">
          {portfolio.properties.map((p) => {
            const rateHigh = p.adr > portfolio.avgAdr;
            const volHigh = p.occupancy > portfolio.avgOccupancy;
            const quad = rateHigh && volHigh ? "Star" : rateHigh ? "Premium" : volHigh ? "Volume" : "Watch";
            const quadColor = quad === "Star" ? "text-up" : quad === "Watch" ? "text-down" : "text-brass";
            return (
              <div key={p.id} className="flex items-center gap-3">
                <div
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold"
                  style={{ background: `${p.accent}22`, color: p.accent }}
                >
                  {p.shortName.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-white">{p.shortName}</p>
                  <p className="text-[11px] text-white/40">
                    ADR ${p.adr.toFixed(0)} · Occ {pct(p.occupancy, 0)}
                  </p>
                </div>
                <span className={cx("rounded-md px-2 py-0.5 text-[11px] font-bold", quadColor, "bg-white/[0.06]")}>
                  {quad}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3 text-[10px] text-white/35">
          <span><b className="text-up">Star</b> = high rate + high volume</span>
          <span><b className="text-brass">Premium</b> = high rate, low volume</span>
          <span><b className="text-brass">Volume</b> = high volume, low rate</span>
          <span><b className="text-down">Watch</b> = both below average</span>
        </div>
      </Card>
    </div>
  );
}

function OperationsTab({
  hotels,
  portfolio,
}: {
  hotels: Business[];
  portfolio: HotelPortfolioMetrics;
}) {
  const allPip = hotels.flatMap((h) =>
    (h.pipItems ?? []).map((p) => ({ hotel: h.shortName ?? h.name, accent: h.accent, ...p })),
  );
  const statusOrder = { overdue: 0, "in-progress": 1, upcoming: 2, complete: 3 };
  allPip.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  const costEstById = new Map(hotels.map((h) => [h.id, !!h.costEstimated]));
  const anyCostEst = hotels.some((h) => h.costEstimated);

  return (
    <div className="space-y-4">
      {/* Labor efficiency */}
      <div>
        <SectionTitle>Labor Efficiency</SectionTitle>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] text-white/45">Portfolio avg labor %</p>
              <p className="mt-1 text-[28px] font-bold text-white tabular-nums">{pct(portfolio.avgLaborPct, 1)}</p>
            </div>
            <div className="text-right text-[11px] text-white/35">
              <p>Industry target: 28-33%</p>
              <p className={portfolio.avgLaborPct > 0.33 ? "text-down" : "text-up"}>
                {portfolio.avgLaborPct > 0.33 ? "Above target" : "Within target"}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {portfolio.properties
              .slice()
              .sort((a, b) => b.laborPct - a.laborPct)
              .map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="flex w-20 shrink-0 items-center gap-1 truncate text-[12px] font-medium text-white/60">
                    <span className="truncate">{p.shortName}</span>
                    {costEstById.get(p.id) && <EstChip />}
                  </span>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${Math.min(100, p.laborPct * 200)}%`,
                        background: p.laborPct > 0.35 ? "#e2685c" : p.laborPct > 0.33 ? "#e0ae49" : "#34c79a",
                      }}
                    />
                  </div>
                  <span className="w-10 text-right text-[12px] font-semibold text-white tabular-nums">
                    {pct(p.laborPct, 0)}
                  </span>
                </div>
              ))}
          </div>
          {anyCostEst && (
            <EstNote>Labor marked “est.” is modeled at ~30% of revenue — add your P&amp;L for exact labor cost.</EstNote>
          )}
        </Card>
      </div>

      {/* GOP margin comparison */}
      <div>
        <SectionTitle>GOP Margin by Property</SectionTitle>
        <Card className="p-5">
          <div className="space-y-3">
            {portfolio.properties
              .slice()
              .sort((a, b) => b.gopMargin - a.gopMargin)
              .map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="flex w-20 shrink-0 items-center gap-1 truncate text-[12px] font-medium text-white/60">
                    <span className="truncate">{p.shortName}</span>
                    {costEstById.get(p.id) && <EstChip />}
                  </span>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${Math.min(100, p.gopMargin * 200)}%`,
                        background: p.accent,
                      }}
                    />
                  </div>
                  <span className="w-10 text-right text-[12px] font-semibold text-white tabular-nums">
                    {pct(p.gopMargin, 0)}
                  </span>
                </div>
              ))}
          </div>
          {anyCostEst && (
            <EstNote>GOP margin marked “est.” is modeled from typical cost ratios — add your P&amp;L for exact margins.</EstNote>
          )}
        </Card>
      </div>

      {/* PIP tracker */}
      {allPip.length > 0 && (
        <div>
          <SectionTitle>PIP Compliance Tracker</SectionTitle>
          <Card className="divide-y divide-white/[0.05]">
            {allPip.map((p) => (
              <div key={p.id + p.hotel} className="flex items-center gap-3 p-3.5">
                <PipStatusIcon status={p.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-white">{p.title}</p>
                  <p className="text-[11px] text-white/40">
                    {p.hotel} · {p.category} · Due {p.deadline}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[12px] font-semibold text-white tabular-nums">{usdCompact(p.estimatedCost)}</p>
                  {p.actualCost != null && (
                    <p className="text-[10px] text-white/35">spent {usdCompact(p.actualCost)}</p>
                  )}
                </div>
              </div>
            ))}
          </Card>
          <div className="mt-2 flex gap-3 px-1 text-[10px] text-white/35">
            <span>Total PIP budget: {usdCompact(allPip.reduce((a, p) => a + p.estimatedCost, 0))}</span>
            <span>Spent: {usdCompact(allPip.reduce((a, p) => a + (p.actualCost ?? 0), 0))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PipStatusIcon({ status }: { status: string }) {
  if (status === "overdue")
    return <AlertTriangle size={16} className="shrink-0 text-down" />;
  if (status === "in-progress")
    return <Clock size={16} className="shrink-0 text-brass" />;
  if (status === "complete")
    return <CheckCircle2 size={16} className="shrink-0 text-up" />;
  return <Clock size={16} className="shrink-0 text-white/30" />;
}

function HeroKpi({
  label,
  value,
  icon: Icon,
  accent,
  trend,
  sub,
}: {
  label: string;
  value: string;
  icon: typeof TrendingUp;
  accent: string;
  trend?: number;
  sub?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Icon size={14} className={accent} />
        <p className="text-[11px] font-medium text-white/45">{label}</p>
      </div>
      <p className={cx("mt-1.5 text-[22px] font-bold tracking-tight tabular-nums text-white")}>{value}</p>
      {trend != null && <Delta value={trend} className="mt-1" />}
      {sub && <p className="mt-1 text-[11px] text-white/40">{sub}</p>}
    </Card>
  );
}

function RgiChip({ rgi }: { rgi: number }) {
  const good = rgi >= 100;
  return (
    <span
      className={cx(
        "rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
        good ? "bg-up/12 text-up" : "bg-down/12 text-down",
      )}
    >
      {rgi.toFixed(0)}
    </span>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="text-[10px] text-white/40">{label}</p>
      <p className={cx("mt-0.5 text-[13px] font-semibold tabular-nums", accent ?? "text-white")}>{value}</p>
    </div>
  );
}

/** A quiet "est." qualifier — muted on purpose (vs the up/down RGI chips) so a defaulted /
 *  estimated number reads as a footnote, not an alert. Mirrors the chip in HotelDetail. */
function EstChip() {
  return (
    <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/45">
      est.
    </span>
  );
}

/** One-line "these numbers are estimated — add real data for exact" affordance, shown under a
 *  comp/cost section when any property in scope lacks STR / P&L data. */
function EstNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex items-center gap-1.5 border-t border-white/[0.06] pt-3 text-[11px] text-white/35">
      <EstChip /> {children}
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 px-1 text-[14px] font-semibold text-white/90">{children}</h2>;
}
