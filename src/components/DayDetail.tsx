import { ChevronLeft, ChevronRight, Sparkles, Receipt, Package, Tag, Clock } from "lucide-react";
import type { Business, Currency } from "../types";
import { fromUSD } from "../lib/currency";
import { money, weekday, shortDate, signedPct, pct, asOfLabel } from "../lib/format";
import { dayBreakdown, hourLabel } from "../lib/breakdowns";
import { Card, Delta, cx } from "./ui";
import { HBars, HourBars } from "./charts";

/**
 * Drill-down for a single day. Tapping any day on the business detail opens this —
 * net sales, units, average ticket, the hourly curve, daypart split, product mix,
 * channel & payment breakdown, and a plain-English read of how the day went.
 */
export function DayDetail({
  business,
  index,
  cur,
  onClose,
  onNav,
}: {
  business: Business;
  index: number;
  cur: Currency;
  onClose: () => void;
  onNav: (newIndex: number) => void;
}) {
  const d = dayBreakdown(business, index);
  const m = (usdAmt: number, cents = false) => money(fromUSD(usdAmt, cur), cur, cents);
  const canPrev = index > 0;
  const canNext = index < business.series.length - 1;
  const recency = asOfLabel(d.date);

  return (
    <div className="fixed inset-0 z-[60] mx-auto flex max-w-[440px] flex-col bg-[#0a263e]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.06] active:scale-90"
          >
            <ChevronLeft size={20} className="text-white" />
          </button>
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[15px] font-bold"
            style={{ background: `${business.accent}22`, color: business.accent }}
          >
            {business.name[0]}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[16px] font-bold leading-tight text-white">
              {weekday(d.date, true)}, {shortDate(d.date)}
            </h1>
            <p className="text-[11px] text-white/40">
              {business.name} · {recency}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            disabled={!canPrev}
            onClick={() => canPrev && onNav(index - 1)}
            className={cx(
              "grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] active:scale-90",
              !canPrev && "opacity-30",
            )}
          >
            <ChevronLeft size={18} className="text-white" />
          </button>
          <button
            disabled={!canNext}
            onClick={() => canNext && onNav(index + 1)}
            className={cx(
              "grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] active:scale-90",
              !canNext && "opacity-30",
            )}
          >
            <ChevronRight size={18} className="text-white" />
          </button>
        </div>
      </div>

      <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-4 pb-10">
        {/* Hero */}
        <div className="px-1">
          <p className="text-[12px] font-medium text-white/45">Net sales</p>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="text-[38px] font-bold tracking-tight text-white tabular-nums">{m(d.revenue)}</span>
            <Delta value={d.vsExpected} size="lg" />
          </div>
          <p className="mt-1 text-[13px] text-white/45">
            vs {m(d.expected)} on a typical {weekday(d.date, true)} ·{" "}
            <span className={d.dayChange >= 0 ? "text-up" : "text-down"}>
              {signedPct(d.dayChange)} vs prior day
            </span>
          </p>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-3">
          <Kpi icon={Receipt} label="Transactions" value={String(d.transactions)} />
          <Kpi icon={Package} label={`Units sold`} value={String(d.unitsSold)} sub={`${d.unitsPerTxn.toFixed(1)} / ticket`} />
          <Kpi icon={Tag} label="Avg ticket" value={m(d.avgTicket, true)} />
          <Kpi icon={Clock} label="Peak hour" value={hourLabel(d.peakHour)} />
        </div>

        {/* Helm's read */}
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-1.5">
            <Sparkles size={14} className="text-brass" />
            <span className="text-[11px] font-bold uppercase tracking-wide text-brass">Helm's read</span>
          </div>
          <ul className="space-y-1.5">
            {d.reads.map((r, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-snug text-white/75">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/30" />
                {r}
              </li>
            ))}
          </ul>
        </Card>

        {/* Hourly */}
        <Section title="Sales by hour" hint={`Busiest around ${hourLabel(d.peakHour)}`}>
          <Card className="p-4">
            <HourBars hours={d.hourly} peak={d.peakHour} color={business.accent} />
          </Card>
        </Section>

        {/* Daypart */}
        <Section title="By daypart">
          <Card className="p-4">
            <HBars segs={d.dayparts} fmt={(n) => m(n)} />
          </Card>
        </Section>

        {/* Product / category mix */}
        <Section title={d.kind === "restaurant" ? "Product mix" : "Category mix"}>
          <Card className="p-4">
            <HBars segs={d.categories} fmt={(n) => m(n)} />
          </Card>
        </Section>

        {/* Channel mix (restaurant) */}
        {d.channels.length > 0 && (
          <Section title="Order channel">
            <Card className="p-4">
              <HBars segs={d.channels} fmt={(n) => m(n)} />
            </Card>
          </Section>
        )}

        {/* Payment mix */}
        <Section title="Payment type">
          <Card className="p-4">
            <HBars segs={d.payments} fmt={(n) => m(n)} />
          </Card>
        </Section>

        {/* Operations */}
        <Section title="Operations">
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Discounts" value={m(d.discount)} sub={`${pct(d.revenue ? d.discount / d.revenue : 0, 1)} of sales`} />
            {d.kind === "retail" ? (
              <Kpi label="Tax collected" value={m(d.tax)} />
            ) : (
              <Kpi label="Labor" value={m(d.labor)} sub={`${pct(d.laborPct, 0)} of sales`} />
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon?: typeof Receipt;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-white/45">
        {Icon && <Icon size={13} className="text-white/35" />}
        {label}
      </p>
      <p className="mt-1 text-[20px] font-bold tracking-tight text-white tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-white/40">{sub}</p>}
    </Card>
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
