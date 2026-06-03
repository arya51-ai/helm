import { useState } from "react";
import {
  AlertTriangle,
  Sparkles,
  Lightbulb,
  Landmark,
  Info,
  ChevronRight,
  Check,
} from "lucide-react";
import type { Business, Insight, InsightKind } from "../types";
import type { Metrics, EmpireSummary } from "../lib/analytics";
import type { DataSource } from "../data/source";
import { usd, usdCompact, longDate, daysAgo, weekday, shortDate } from "../lib/format";
import { Card, Delta, Sparkline, SectionTitle, cx } from "./ui";
import { AreaTrend } from "./charts";
import { HelmLockup, HelmMark } from "./Brand";

const KIND_STYLE: Record<
  InsightKind,
  { icon: typeof Info; ring: string; chip: string; text: string }
> = {
  alert: { icon: AlertTriangle, ring: "bg-rose-400/12", chip: "text-rose-400", text: "Needs you" },
  opportunity: { icon: Lightbulb, ring: "bg-amber-400/12", chip: "text-amber-400", text: "Opportunity" },
  win: { icon: Sparkles, ring: "bg-emerald-400/12", chip: "text-emerald-400", text: "Win" },
  capital: { icon: Landmark, ring: "bg-violet-400/12", chip: "text-violet-300", text: "Capital" },
  info: { icon: Info, ring: "bg-sky-400/12", chip: "text-sky-300", text: "FYI" },
};

export function InsightCard({
  insight,
  onAction,
  onOpen,
}: {
  insight: Insight;
  onAction: (msg: string) => void;
  onOpen?: () => void;
}) {
  const s = KIND_STYLE[insight.kind];
  const Icon = s.icon;
  const [done, setDone] = useState(false);
  return (
    <Card className="p-4">
      <div className="flex gap-3">
        <div className={cx("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-2xl", s.ring)}>
          <Icon size={18} className={s.chip} strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cx("text-[11px] font-bold uppercase tracking-wide", s.chip)}>
              {s.text}
            </span>
            {insight.metric && (
              <span
                className={cx(
                  "rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                  insight.metricUp ? "bg-emerald-400/10 text-emerald-400" : "bg-rose-400/10 text-rose-400",
                )}
              >
                {insight.metric}
              </span>
            )}
          </div>
          <h3 className="mt-1.5 text-[15px] font-semibold leading-snug text-white">
            {insight.title}
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-white/55">{insight.detail}</p>

          {insight.action && (
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => {
                  setDone(true);
                  onAction(insight.action!.done);
                }}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition",
                  done
                    ? "bg-emerald-400/15 text-emerald-400"
                    : "bg-white text-black active:scale-95",
                )}
              >
                {done ? <Check size={15} strokeWidth={3} /> : null}
                {done ? "Done" : insight.action.label}
              </button>
              {onOpen && (
                <button
                  onClick={onOpen}
                  className="inline-flex items-center gap-0.5 rounded-full px-2 py-2 text-[13px] font-medium text-white/50"
                >
                  Open <ChevronRight size={15} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function BriefScreen({
  businesses,
  metricsBy,
  empire,
  insights,
  source,
  aiBrief,
  onOpenBusiness,
  onToast,
  onSeeAll,
  onProfile,
  onAsk,
}: {
  businesses: Business[];
  metricsBy: Record<string, Metrics>;
  empire: EmpireSummary;
  insights: Insight[];
  source: DataSource;
  /** Claude-written morning read (null when the model isn't configured → falls back to the rule cards). */
  aiBrief?: string | null;
  onOpenBusiness: (id: string) => void;
  onToast: (msg: string) => void;
  onSeeAll: () => void;
  onProfile: () => void;
  onAsk: () => void;
}) {
  const today = new Date();
  const hour = today.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const needs = insights.filter((i) => i.kind === "alert").length;
  const top = insights.slice(0, 4);

  // Be honest about recency: POS data usually lags a day, so the headline number
  // is the latest completed close, not literally "today".
  const lag = empire.asOf ? daysAgo(empire.asOf) : 0;
  const revLabel =
    lag <= 0
      ? "Revenue today · all businesses"
      : lag === 1
        ? "Revenue yesterday · all businesses"
        : `Revenue · ${weekday(empire.asOf)} ${shortDate(empire.asOf)} · all businesses`;

  return (
    <div className="animate-fade-up space-y-7 px-4 pb-6 pt-2">
      {/* Brand + greeting */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <HelmLockup size={30} tag="AI COO" />
          <button
            onClick={onProfile}
            className="grid h-9 w-9 place-items-center rounded-full text-[14px] font-bold text-white shadow-lg active:scale-90"
            style={{ background: "linear-gradient(135deg,#8b5cf6,#4f46e5)" }}
          >
            A
          </button>
        </div>
        <header className="px-1">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-medium text-white/45">{longDate(today)}</p>
            <span
              className={cx(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                source === "real" ? "bg-emerald-400/12 text-emerald-400" : "bg-amber-400/12 text-amber-400",
              )}
            >
              <span
                className={cx("h-1.5 w-1.5 rounded-full", source === "real" ? "bg-emerald-400" : "bg-amber-400")}
              />
              {source === "real" ? "Live" : "Sample data"}
            </span>
          </div>
          <h1 className="mt-0.5 text-[26px] font-bold tracking-tight text-white">{greeting}, Arya</h1>
        </header>
      </div>

      {/* Empire snapshot */}
      <Card className="overflow-hidden p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[12px] font-medium text-white/45">{revLabel}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[34px] font-bold tracking-tight text-white tabular-nums">
                {usd(empire.revenueToday)}
              </span>
              <Delta value={empire.revenueDayChange} />
            </div>
          </div>
        </div>
        <div className="-mx-1 mt-2">
          <AreaTrend data={empire.combinedSeries} color="#7c6cf5" height={110} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-4">
          <Stat label="This week" value={usdCompact(empire.weekToDate)} />
          <Stat label="This month" value={usdCompact(empire.last30)} />
          <Stat
            label="Net worth"
            value={usdCompact(empire.netWorth)}
            accent="text-violet-300"
          />
        </div>
      </Card>

      {/* Ask Helm */}
      <button
        onClick={onAsk}
        className="flex w-full items-center gap-2.5 rounded-2xl border border-violet-400/20 bg-violet-500/[0.07] px-4 py-3 active:scale-[0.99]"
      >
        <HelmMark size={18} className="text-violet-300" />
        <span className="text-[14px] text-white/50">Ask Helm anything…</span>
        <Sparkles size={15} className="ml-auto text-violet-300/70" />
      </button>

      {/* Helm's read — Claude's prioritized morning narrative (only when configured) */}
      {aiBrief && (
        <Card className="border-violet-400/15 bg-violet-500/[0.06] p-4">
          <div className="mb-1.5 flex items-center gap-1.5">
            <HelmMark size={14} className="text-violet-300" />
            <span className="text-[11px] font-bold uppercase tracking-wide text-violet-300">Helm's read</span>
          </div>
          <p className="text-[14px] leading-relaxed text-white/85">{aiBrief}</p>
        </Card>
      )}

      {/* The Brief */}
      <section>
        <SectionTitle
          right={
            <button onClick={onSeeAll} className="text-[13px] font-medium text-violet-300">
              See all {insights.length}
            </button>
          }
        >
          Your brief
        </SectionTitle>
        <p className="mb-3 px-1 text-[13px] text-white/45">
          {needs > 0
            ? `${needs} thing${needs > 1 ? "s" : ""} need${needs > 1 ? "" : "s"} you today, ranked by what matters.`
            : "Here's what I'd look at today, ranked by what matters."}
        </p>
        <div className="space-y-3">
          {top.map((i) => (
            <InsightCard
              key={i.id}
              insight={i}
              onAction={onToast}
              onOpen={i.businessId ? () => onOpenBusiness(i.businessId!) : undefined}
            />
          ))}
        </div>
      </section>

      {/* Businesses quick row */}
      <section>
        <SectionTitle>Your businesses</SectionTitle>
        <div className="space-y-3">
          {businesses.map((b) => {
            const m = metricsBy[b.id];
            const spark = b.series.slice(-14).map((p) => p.revenue);
            return (
              <Card key={b.id} className="flex items-center gap-3 p-3.5" onClick={() => onOpenBusiness(b.id)}>
                <div
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[15px] font-bold"
                  style={{ background: `${b.accent}22`, color: b.accent }}
                >
                  {b.name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-white">{b.shortName ?? b.name}</p>
                  <p className="truncate text-[12px] text-white/40">{b.location}</p>
                </div>
                <Sparkline data={spark} color={b.accent} width={64} height={30} fill={false} />
                <div className="w-[84px] text-right">
                  <p className="text-[14px] font-semibold text-white tabular-nums">
                    {b.type === "portfolio" ? usdCompact(m.marketValue) : usd(m.today)}
                  </p>
                  <Delta
                    value={b.type === "portfolio" ? m.dayChange : m.vsExpected}
                    className="mt-0.5"
                  />
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-white/40">{label}</p>
      <p className={cx("mt-0.5 text-[16px] font-bold tabular-nums", accent ?? "text-white")}>
        {value}
      </p>
    </div>
  );
}
