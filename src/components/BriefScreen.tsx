import { useState } from "react";
import {
  AlertTriangle,
  Sparkles,
  Lightbulb,
  Landmark,
  Info,
  ChevronRight,
  Check,
  CircleDashed,
} from "lucide-react";
import { Building2, ChevronRight as ChevronRightIcon } from "lucide-react";
import type { Business, Insight, InsightKind } from "../types";
import type { Metrics, EmpireSummary } from "../lib/analytics";
import type { DataSource } from "../data/source";
import { hotelPortfolioMetrics } from "../lib/hotelAnalytics";
import { usd, usdCompact, money, pct, longDate, daysAgo, weekday, shortDate } from "../lib/format";
import { list as listActions, setStatus as setActionStatus, type TrackedAction } from "../data/actions";
import { Card, Delta, Sparkline, SectionTitle, cx } from "./ui";
import { TrendRibbon } from "./charts";
import { HelmLockup, HelmMark } from "./Brand";

const KIND_STYLE: Record<
  InsightKind,
  { icon: typeof Info; ring: string; chip: string; text: string }
> = {
  alert: { icon: AlertTriangle, ring: "bg-down/12", chip: "text-down", text: "Needs you" },
  opportunity: { icon: Lightbulb, ring: "bg-brass/12", chip: "text-brass", text: "Opportunity" },
  win: { icon: Sparkles, ring: "bg-up/12", chip: "text-up", text: "Win" },
  capital: { icon: Landmark, ring: "bg-brass/12", chip: "text-brass", text: "Capital" },
  info: { icon: Info, ring: "bg-info/12", chip: "text-info", text: "FYI" },
};

export function InsightCard({
  insight,
  onAction,
  onOpen,
  onDraft,
}: {
  insight: Insight;
  onAction: (msg: string) => void;
  onOpen?: () => void;
  /** When provided, the action opens the agentic draft/confirm sheet instead of an instant toast. */
  onDraft?: () => void;
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
                  insight.metricUp ? "bg-up/10 text-up" : "bg-down/10 text-down",
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
                  if (onDraft) {
                    onDraft();
                    return;
                  }
                  setDone(true);
                  onAction(insight.action!.done);
                }}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition",
                  done
                    ? "bg-up/15 text-up"
                    : "bg-brass text-[#071e33] active:scale-95",
                )}
              >
                {done ? <Check size={15} strokeWidth={3} /> : onDraft ? <Sparkles size={14} className="text-brass" /> : null}
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

const LOOP_KIND_LABEL: Record<TrackedAction["kind"], string> = {
  message: "Message",
  reorder: "Reorder",
  capital: "Capital",
  task: "Task",
};

/**
 * Open loops — the actions the owner has drafted/sent but not closed. This is what makes
 * Helm feel like a COO rather than a dashboard: it remembers what's outstanding and lets
 * you tap it done. Reads straight from the tracked-actions store; on done we drop it from
 * the live list (the record stays, just no longer "open").
 */
function OpenLoops({ businesses }: { businesses: Business[] }) {
  const [actions, setActions] = useState<TrackedAction[]>(() =>
    listActions()
      .filter((a) => a.status !== "done")
      .sort((a, b) => (b.sentAt ?? b.createdAt) - (a.sentAt ?? a.createdAt)),
  );
  if (actions.length === 0) return null;

  const nameFor = (id?: string) => {
    if (!id) return null;
    const b = businesses.find((x) => x.id === id);
    return b ? b.shortName ?? b.name : null;
  };

  const markDone = (id: string) => {
    setActionStatus(id, "done");
    setActions((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <section>
      <SectionTitle right={<span className="text-[12px] text-white/40">{actions.length} open</span>}>
        Open loops
      </SectionTitle>
      <p className="mb-3 px-1 text-[13px] text-white/45">
        What you've put in motion — tap to close it out.
      </p>
      <div className="space-y-2.5">
        {actions.map((a) => {
          const biz = nameFor(a.businessId);
          return (
            <Card key={a.id} className="flex items-center gap-3 p-3.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-brass/12 text-brass">
                <CircleDashed size={17} strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-white">
                  {a.insightTitle ?? a.draftText}
                </p>
                <p className="truncate text-[12px] text-white/40">
                  {LOOP_KIND_LABEL[a.kind]}
                  {biz ? ` · ${biz}` : ""}
                  {a.status === "sent" ? " · sent" : " · drafted"}
                </p>
              </div>
              <button
                onClick={() => markDone(a.id)}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-up/15 px-3 py-1.5 text-[12px] font-semibold text-up active:scale-95"
              >
                <Check size={13} strokeWidth={3} />
                Done
              </button>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

export function BriefScreen({
  businesses,
  metricsBy,
  empire,
  insights,
  source,
  aiBrief,
  owner,
  onOpenBusiness,
  onToast,
  onSeeAll,
  onProfile,
  onAsk,
  onDraft,
  onOpenHotels,
  onOpenHotel,
  onOpenCompare,
}: {
  businesses: Business[];
  metricsBy: Record<string, Metrics>;
  empire: EmpireSummary;
  insights: Insight[];
  source: DataSource;
  /** Claude-written morning read (null when the model isn't configured → falls back to the rule cards). */
  aiBrief?: string | null;
  /** Persona owner's first name, for the greeting + avatar. */
  owner: string;
  onOpenBusiness: (id: string) => void;
  onToast: (msg: string) => void;
  onSeeAll: () => void;
  onProfile: () => void;
  onAsk: () => void;
  onDraft: (insight: Insight) => void;
  /** Jump to the hospitality command center (only meaningful when hotels exist). */
  onOpenHotels?: () => void;
  /** Open one property's deep dive directly (used for a single independent motel). */
  onOpenHotel?: (id: string) => void;
  /** Open the same-brand head-to-head comparison for a unit-compare insight. */
  onOpenCompare?: (insight: Insight) => void;
}) {
  const ops = businesses.filter((b) => b.type !== "hotel");
  const hotels = businesses.filter((b) => b.type === "hotel");
  const hotelPortfolio = hotels.length ? hotelPortfolioMetrics(hotels) : null;
  // A lone independent motel reads as itself, not a "portfolio" — tapping it opens its own view.
  const soloMotel = hotels.length === 1 && hotels[0].independent ? hotels[0] : null;
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
  // A single CAD motel reads in CA$ and as itself, not "all businesses".
  const fmtBig = (n: number) => (soloMotel ? money(n, "CAD") : usd(n));
  const fmtC = (n: number) => (soloMotel ? "CA" + usdCompact(n) : usdCompact(n));
  const revLabelFinal = soloMotel ? `${soloMotel.shortName} · last night` : revLabel;

  return (
    <div className="animate-fade-up space-y-7 px-4 pb-6 pt-2">
      {/* Brand + greeting */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <HelmLockup size={30} tag="AI COO" />
          <button
            onClick={onProfile}
            className="grid h-9 w-9 place-items-center rounded-full text-[14px] font-bold text-white shadow-lg active:scale-90"
            style={{ background: "linear-gradient(135deg,#e0ae49,#0a263e)" }}
          >
            {owner[0]}
          </button>
        </div>
        <header className="px-1">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-medium text-white/45">{longDate(today)}</p>
            <span
              className={cx(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                source === "real" ? "bg-up/12 text-up" : "bg-brass/12 text-brass",
              )}
            >
              <span
                className={cx("h-1.5 w-1.5 rounded-full", source === "real" ? "bg-up" : "bg-brass")}
              />
              {source === "real" ? "Live" : "Sample data"}
            </span>
          </div>
          <h1 className="mt-0.5 text-[26px] font-bold tracking-tight text-white">{greeting}, {owner}</h1>
        </header>
      </div>

      {/* Helm's read — the COO speaks first: Claude's prioritized morning narrative */}
      {aiBrief && (
        <Card className="border-brass/20 bg-brass/[0.06] p-4">
          <div className="mb-1.5 flex items-center gap-1.5">
            <HelmMark size={14} className="text-brass" />
            <span className="text-[11px] font-bold uppercase tracking-wide text-brass">Helm's read</span>
          </div>
          <p className="text-[14px] leading-relaxed text-ink">{aiBrief}</p>
        </Card>
      )}

      {/* Empire snapshot */}
      <Card className="overflow-hidden p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[12px] font-medium text-white/45">{revLabelFinal}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[34px] font-bold tracking-tight text-white tabular-nums">
                {fmtBig(empire.revenueToday)}
              </span>
              <Delta value={empire.revenueDayChange} />
            </div>
          </div>
        </div>
        <div className="-mx-1 mt-2">
          <TrendRibbon data={empire.combinedSeries} color="#e0ae49" height={110} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-4">
          <Stat label="This week" value={fmtC(empire.weekToDate)} />
          <Stat label="This month" value={fmtC(empire.last30)} />
          <Stat
            label="Net worth"
            value={fmtC(empire.netWorth)}
            accent="text-brass"
          />
        </div>
      </Card>

      {/* Ask Helm */}
      <button
        onClick={onAsk}
        className="flex w-full items-center gap-2.5 rounded-2xl border border-brass/20 bg-brass/[0.07] px-4 py-3 active:scale-[0.99]"
      >
        <HelmMark size={18} className="text-brass" />
        <span className="text-[14px] text-white/50">Ask Helm anything…</span>
        <Sparkles size={15} className="ml-auto text-brass/70" />
      </button>

      {/* Open loops — what Helm is already tracking, closed with a tap */}
      <OpenLoops businesses={businesses} />

      {/* The Brief */}
      <section>
        <SectionTitle
          right={
            <button onClick={onSeeAll} className="text-[13px] font-medium text-brass">
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
              onDraft={i.action ? () => (i.id.startsWith("unit-compare") ? onOpenCompare?.(i) : onDraft(i)) : undefined}
            />
          ))}
        </div>
      </section>

      {/* Businesses quick row */}
      <section>
        <SectionTitle right={hotelPortfolio && !soloMotel ? <span className="text-[12px] text-white/40">{ops.length + hotels.length} total</span> : undefined}>
          {soloMotel ? "Your motel" : hotelPortfolio ? "Your portfolio" : "Your businesses"}
        </SectionTitle>
        <div className="space-y-3">
          {/* A lone independent motel reads as itself; multiple properties collapse into a portfolio card. */}
          {hotelPortfolio && soloMotel && (
            <Card className="flex items-center gap-3 p-3.5" onClick={() => onOpenHotel?.(soloMotel.id)}>
              <div
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[15px] font-bold"
                style={{ background: `${soloMotel.accent}22`, color: soloMotel.accent }}
              >
                {soloMotel.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-white">{soloMotel.name}</p>
                <p className="truncate text-[12px] text-white/40">
                  {soloMotel.location} · {soloMotel.rooms} rooms · {pct(hotelPortfolio.avgOccupancy, 0)} full
                </p>
              </div>
              <div className="text-right">
                <p className="text-[14px] font-semibold text-white tabular-nums">{money(hotelPortfolio.avgAdr, "CAD")}</p>
                <p className="text-[10px] font-medium uppercase tracking-wide text-white/35">avg rate</p>
              </div>
              <ChevronRightIcon size={16} className="text-white/25" />
            </Card>
          )}
          {hotelPortfolio && !soloMotel && (
            <Card className="flex items-center gap-3 p-3.5" onClick={onOpenHotels}>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brass/15 text-brass">
                <Building2 size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-white">Hotel portfolio</p>
                <p className="truncate text-[12px] text-white/40">
                  {hotels.length} {hotels.length === 1 ? "property" : "properties"} · {hotelPortfolio.totalRooms.toLocaleString()} rooms · {pct(hotelPortfolio.avgOccupancy, 0)} occ
                </p>
              </div>
              <div className="text-right">
                <p className="text-[14px] font-semibold text-white tabular-nums">${hotelPortfolio.avgRevpar.toFixed(0)}</p>
                <p className="text-[10px] font-medium uppercase tracking-wide text-white/35">RevPAR</p>
              </div>
              <ChevronRightIcon size={16} className="text-white/25" />
            </Card>
          )}
          {ops.map((b) => {
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
