import { useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Coins, RefreshCw, SlidersHorizontal, TrendingUp, TrendingDown } from "lucide-react";
import type { Business, Currency } from "../types";
import type { Metrics } from "../lib/analytics";
import { usd, usdCompact, money, pct, signedPct, signedUsd, daysAgo, weekday, shortDate, currencySymbol } from "../lib/format";
import { DISPLAY_CURRENCY, RATES_TO_USD, fromUSD } from "../lib/currency";
import { Card, Delta, cx } from "./ui";
import { DataHealthBadge } from "./DataHealthBadge";
import { AreaTrend, DayBars, HBars, DowBars, CalendarHeatmap, TrendRibbon, ForecastChart } from "./charts";
import { benchmarkFor } from "../lib/benchmark";
import { expectedFor, dowAverages, rangeBreakdown } from "../lib/breakdowns";
import { forecastDaily, summarizeForecast, paceToGoal } from "../lib/forecast";
import { anomalyMarks, detectAnomalies } from "../lib/anomalies";
import { goalFor, setGoal } from "../data/goals";
import { DayDetail } from "./DayDetail";

const RANGES = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
];

export function BusinessDetail({
  business,
  metrics,
  onClose,
  onEdit,
}: {
  business: Business;
  metrics: Metrics;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [range, setRange] = useState(1);
  const [dayIdx, setDayIdx] = useState<number | null>(null);
  const isPort = business.type === "portfolio";
  // Monthly revenue goal (USD), persisted; editable inline.
  const [goal, setGoalState] = useState<number>(() => (business.type === "portfolio" ? 0 : goalFor(business.id)));
  const [goalEdit, setGoalEdit] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  // A business that reports in a non-display currency (e.g. Subway in CAD) gets a CAD/USD switch.
  const isForeign = !isPort && !!business.currency && business.currency !== DISPLAY_CURRENCY;
  const [cur, setCur] = useState<Currency>(DISPLAY_CURRENCY);
  const otherCur: Currency = cur === DISPLAY_CURRENCY ? ((business.currency as Currency) ?? DISPLAY_CURRENCY) : DISPLAY_CURRENCY;
  // Render any in-memory (USD) amount in the currently-selected currency.
  const m = (usdAmt: number, cents = false) => money(fromUSD(usdAmt, cur), cur, cents);
  const bench = benchmarkFor(business, metrics);
  const days = RANGES[range].days;
  const data = business.series
    .slice(-days)
    .map((p) => ({ date: p.date, revenue: cur === DISPLAY_CURRENCY ? p.revenue : fromUSD(p.revenue, cur) }));

  // ── Richer analytics (operating businesses) ──
  const n = business.series.length;
  const start = Math.max(0, n - days);
  const toCur = (v: number) => (cur === DISPLAY_CURRENCY ? v : fromUSD(v, cur));
  const barData = isPort
    ? []
    : business.series.slice(start).map((p, j) => ({
        date: p.date,
        revenue: toCur(p.revenue),
        expected: toCur(expectedFor(business, start + j)),
      }));
  const rb = isPort ? null : rangeBreakdown(business, days);
  const dow = isPort ? [] : dowAverages(business, days);
  const bestDow = dow.find((s) => s.best);
  const worstDow = dow.find((s) => s.worst);
  const recentIdx = isPort ? [] : Array.from({ length: Math.min(8, n) }, (_, k) => n - 1 - k);
  const lastIndexOfDow = (d: number) => {
    for (let i = n - 1; i >= 0; i--) if (new Date(`${business.series[i].date}T00:00:00`).getDay() === d) return i;
    return -1;
  };
  const selDate = dayIdx != null ? business.series[dayIdx].date : null;
  const pickDay = (date: string) => {
    const i = business.series.findIndex((p) => p.date === date);
    if (i >= 0) setDayIdx(i);
  };
  // Anomalies: outlier-day calendar dots + a "what changed" feed (operating businesses only).
  const marks = isPort ? {} : anomalyMarks(business);
  const anomalies = isPort
    ? []
    : detectAnomalies(business, { lookback: 21, z: 1.5 }).filter((a) => Math.abs(a.vsExpected) >= 0.08);

  // ── Forecast + pace-to-goal (operating businesses) ──
  const toUsd = (v: number) => (cur === DISPLAY_CURRENCY ? v : v * RATES_TO_USD[cur as Currency]);
  const fc30 = isPort ? null : summarizeForecast(business.series, 30);
  const fcActual = isPort ? [] : business.series.slice(-21).map((p) => ({ date: p.date, revenue: toCur(p.revenue) }));
  const fcBand = isPort
    ? []
    : forecastDaily(business.series, 21).map((f) => ({ date: f.date, mean: toCur(f.mean), lo: toCur(f.lo), hi: toCur(f.hi) }));
  const pace = !isPort && goal > 0 ? paceToGoal(business.series, goal) : null;
  const saveGoal = () => {
    const v = parseFloat(goalInput.replace(/[^0-9.]/g, ""));
    const usd = v > 0 ? Math.round(toUsd(v)) : 0;
    setGoal(business.id, usd);
    setGoalState(usd);
    setGoalEdit(false);
    setGoalInput("");
  };

  const asOf = business.series.at(-1)!.date;
  const lag = daysAgo(asOf);
  const revLabel =
    lag <= 0 ? "Today's revenue" : lag === 1 ? "Yesterday's revenue" : `Latest · ${weekday(asOf)} ${shortDate(asOf)}`;

  return (
    <>
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
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[15px] font-bold"
              style={{ background: `${business.accent}22`, color: business.accent }}
            >
              {business.name[0]}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-[16px] font-bold leading-tight text-white">{business.name}</h1>
              <p className="flex items-center gap-1 text-[11px] text-white/40">
                <MapPin size={10} /> {business.location}
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.08] px-3 py-2 text-[12px] font-semibold text-white active:scale-95"
        >
          {isPort ? (
            <>
              <RefreshCw size={13} /> Sync
            </>
          ) : (
            <>
              <SlidersHorizontal size={13} /> Edit
            </>
          )}
        </button>
      </div>

      <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-4 pb-10">
        {/* Hero number */}
        <div className="px-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-medium text-white/45">{isPort ? "Market value" : revLabel}</p>
            {isForeign && (
              <div className="flex gap-0.5 rounded-full bg-white/[0.06] p-0.5">
                {[DISPLAY_CURRENCY, business.currency as Currency].map((c) => (
                  <button
                    key={c}
                    onClick={() => setCur(c)}
                    className={cx(
                      "rounded-full px-2.5 py-1 text-[11px] font-bold transition",
                      cur === c ? "bg-white text-black" : "text-white/50",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="text-[38px] font-bold tracking-tight text-white tabular-nums">
              {isPort ? usd(metrics.marketValue) : m(metrics.today)}
            </span>
            <Delta
              value={isPort ? metrics.dayChange : metrics.vsExpected}
              size="lg"
              text={isPort ? signedPct(metrics.dayChange) : undefined}
            />
          </div>
          {!isPort && (
            <p className="mt-1 text-[13px] text-white/45">vs {m(metrics.expectedToday)} on a typical day</p>
          )}
          {isForeign && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-white/35">
              <Coins size={10} className="shrink-0" />≈ {money(fromUSD(metrics.today, otherCur), otherCur)} · 1{" "}
              {business.currency} = ${RATES_TO_USD[business.currency as Currency].toFixed(2)}
            </p>
          )}
        </div>

        {/* Persistent trust badge — coverage / freshness for the series (operating businesses;
            a portfolio has no daily-coverage notion, so skip it). */}
        {!isPort && <DataHealthBadge series={business.series} />}

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

        {isPort ? (
          <Card className="p-3 pt-4">
            <AreaTrend data={data} color={business.accent} height={180} showAxis currency={cur} />
          </Card>
        ) : range === 0 ? (
          <Card className="p-3 pt-3">
            <DayBars data={barData} color={business.accent} currency={cur} selected={selDate} onSelect={pickDay} />
          </Card>
        ) : (
          <Card className="p-4">
            <div className="mb-1.5 flex items-baseline justify-between px-0.5">
              <span className="text-[12px] font-medium text-white/45">{days}-day trend</span>
              <span className="text-[11px] text-white/35">
                {shortDate(data[0].date)} – {shortDate(data[data.length - 1].date)}
              </span>
            </div>
            <TrendRibbon data={data} color={business.accent} height={88} />
            <div className="mt-4 border-t border-white/[0.06] pt-4">
              <CalendarHeatmap
                points={data.map((p) => ({ date: p.date, value: p.revenue }))}
                color={business.accent}
                selected={selDate}
                onSelect={pickDay}
                fmt={(v) => money(v, cur)}
                marks={marks}
              />
            </div>
          </Card>
        )}

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-3">
          {isPort ? (
            <>
              <Kpi label="Total gain" value={usd(metrics.totalGain)} accent="text-up" />
              <Kpi label="Total return" value={signedPct(metrics.totalReturn)} />
              <Kpi label="Day change" value={signedUsd(metrics.dayChangeUsd)} />
              <Kpi label="Cost basis" value={usdCompact(metrics.costBasis)} />
            </>
          ) : (
            <>
              <Kpi label="This week" value={m(metrics.weekToDate)} sub={`${signedPct(metrics.wow)} WoW`} />
              <Kpi label="This month" value={m(metrics.last30)} />
              <Kpi label="Transactions today" value={String(metrics.transactionsToday)} />
              <Kpi label="Avg ticket" value={m(metrics.avgTicket, true)} />
              <Kpi label="Profit / mo" value={m(metrics.monthlyProfit)} />
              <Kpi label="Return on capital" value={pct(metrics.roic, 0)} accent="text-brass" />
            </>
          )}
        </div>

        {/* ── Forecast + pace-to-goal (operating businesses) ── */}
        {!isPort && fc30 && (
          <DetailSection title="Forecast" hint="next 30 days">
            <Card className="p-4">
              <div className="flex items-baseline justify-between px-0.5">
                <div>
                  <p className="text-[12px] font-medium text-white/45">Projected revenue</p>
                  <p className="mt-0.5 text-[24px] font-bold tracking-tight text-white tabular-nums">{m(fc30.total)}</p>
                </div>
                <p className="text-[11px] text-white/35 tabular-nums">
                  range {m(fc30.lo)} – {m(fc30.hi)}
                </p>
              </div>
              <div className="mt-3">
                <ForecastChart actual={fcActual} forecast={fcBand} color={business.accent} />
              </div>
              <div className="mt-1 flex items-center justify-center gap-4 text-[10px] text-white/35">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-[2px] w-3" style={{ background: business.accent }} /> actual
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-[2px] w-3 border-t border-dashed" style={{ borderColor: business.accent }} /> forecast
                </span>
              </div>

              {/* Pace to goal */}
              <div className="mt-4 border-t border-white/[0.06] pt-4">
                {pace ? (
                  <>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[12px] font-medium text-white/55">
                        Monthly goal · {m(pace.goal)}
                      </span>
                      <span
                        className={cx(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                          pace.onTrack ? "bg-up/12 text-up" : "bg-brass/12 text-brass",
                        )}
                      >
                        {pace.onTrack ? "On track" : "Behind pace"}
                      </span>
                    </div>
                    <div className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${Math.min(100, Math.max(2, pace.fractionToGoal * 100))}%`,
                          background: pace.onTrack ? "#34c79a" : "#e0ae49",
                        }}
                      />
                      <div
                        className="absolute inset-y-0 w-px bg-white/40"
                        style={{ left: `${(pace.daysElapsed / pace.daysInMonth) * 100}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-white/40 tabular-nums">
                      <span>{m(pace.mtdActual)} so far</span>
                      <span>projected {m(pace.projectedMonthEnd)}</span>
                    </div>
                    <button onClick={() => setGoalEdit(true)} className="mt-2 text-[11px] font-medium text-brass">
                      Edit goal
                    </button>
                  </>
                ) : goalEdit ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-white/60">Monthly goal</span>
                    <div className="flex items-center rounded-xl border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5">
                      <span className="text-[14px] font-semibold text-white/50">{currencySymbol(cur)}</span>
                      <input
                        autoFocus
                        value={goalInput}
                        onChange={(e) => setGoalInput(e.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                        className="w-20 bg-transparent text-[14px] font-semibold text-white outline-none"
                      />
                    </div>
                    <button onClick={saveGoal} className="rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-black active:scale-95">
                      Set
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setGoalEdit(true)}
                    className="text-[13px] font-medium text-brass"
                  >
                    + Set a monthly goal
                  </button>
                )}
              </div>
            </Card>
          </DetailSection>
        )}

        {/* ── What changed: anomalies vs the business's own trend+weekday norm ── */}
        {!isPort && anomalies.length > 0 && (
          <DetailSection title="What changed" hint="vs its own norm">
            <Card className="divide-y divide-white/[0.05]">
              {anomalies.slice(0, 4).map((a) => {
                const down = a.kind === "dip" || a.kind === "streak-down";
                const streak = a.runLength >= 3;
                return (
                  <button
                    key={`${a.date}-${a.endDate}`}
                    onClick={() => pickDay(a.endDate)}
                    className="flex w-full items-center gap-3 p-3.5 text-left active:bg-white/[0.02]"
                  >
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                      style={{ background: down ? "#e2685c22" : "#34c79a22" }}
                    >
                      {down ? (
                        <TrendingDown size={15} className="text-down" />
                      ) : (
                        <TrendingUp size={15} className="text-up" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold text-white">
                        {streak ? `${a.runLength} ${down ? "soft" : "strong"} days running` : `${weekday(a.endDate)} ${down ? "dip" : "spike"}`}
                      </p>
                      <p className="text-[11px] text-white/40">
                        {Math.abs(a.z).toFixed(1)}σ {down ? "below" : "above"} norm · {shortDate(a.endDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cx("text-[13.5px] font-semibold tabular-nums", down ? "text-down" : "text-up")}>
                        {signedPct(a.vsExpected, 0)}
                      </p>
                      <p className="text-[11px] text-white/40">{m(Math.abs(a.delta))}</p>
                    </div>
                    <ChevronRight size={16} className="text-white/25" />
                  </button>
                );
              })}
            </Card>
          </DetailSection>
        )}

        {/* ── Day-level analytics (operating businesses) ── */}
        {!isPort && rb && (
          <>
            {/* Recent days — tap to drill into any day */}
            <DetailSection title="Recent days" hint="tap a day">
              <Card className="divide-y divide-white/[0.05]">
                {recentIdx.map((i) => {
                  const p = business.series[i];
                  const exp = expectedFor(business, i);
                  const vs = exp ? p.revenue / exp - 1 : 0;
                  return (
                    <button
                      key={p.date}
                      onClick={() => setDayIdx(i)}
                      className="flex w-full items-center gap-3 p-3.5 text-left active:bg-white/[0.02]"
                    >
                      <div className="w-12 shrink-0">
                        <p className="text-[13px] font-semibold text-white">{weekday(p.date)}</p>
                        <p className="text-[11px] text-white/40">{shortDate(p.date)}</p>
                      </div>
                      <div className="flex-1" />
                      <div className="text-right">
                        <p className="text-[14px] font-semibold text-white tabular-nums">{m(p.revenue)}</p>
                        <p className="text-[11px] text-white/40">{p.transactions} txns</p>
                      </div>
                      <Delta value={vs} className="ml-1" />
                      <ChevronRight size={16} className="text-white/25" />
                    </button>
                  );
                })}
              </Card>
            </DetailSection>

            {/* Day-of-week pattern */}
            <DetailSection
              title="Day-of-week pattern"
              hint={bestDow ? `best ${bestDow.label}${worstDow ? ` · slow ${worstDow.label}` : ""}` : undefined}
            >
              <Card className="p-4 pt-5">
                <DowBars
                  stats={dow}
                  color={business.accent}
                  onSelectDow={(d) => {
                    const i = lastIndexOfDow(d);
                    if (i >= 0) setDayIdx(i);
                  }}
                />
                {bestDow && (
                  <p className="mt-3 text-[11px] text-white/40">
                    {bestDow.label} averages {m(bestDow.avg)}/day
                    {worstDow ? ` · ${worstDow.label} the slowest at ${m(worstDow.avg)}` : ""}. Tap a bar for that day.
                  </p>
                )}
              </Card>
            </DetailSection>

            {/* Sales by daypart */}
            <DetailSection title="Sales by daypart" hint={`last ${days}d`}>
              <Card className="p-4">
                <HBars segs={rb.dayparts} fmt={(v) => m(v)} />
              </Card>
            </DetailSection>

            {/* Product / category mix */}
            <DetailSection title={rb.kind === "restaurant" ? "Product mix" : "Category mix"} hint={`last ${days}d`}>
              <Card className="p-4">
                <HBars segs={rb.categories} fmt={(v) => m(v)} />
              </Card>
            </DetailSection>

            {/* Order channel (restaurant) */}
            {rb.channels.length > 0 && (
              <DetailSection title="Order channel" hint={`last ${days}d`}>
                <Card className="p-4">
                  <HBars segs={rb.channels} fmt={(v) => m(v)} />
                </Card>
              </DetailSection>
            )}

            {/* Payment type */}
            <DetailSection title="Payment type" hint={`last ${days}d`}>
              <Card className="p-4">
                <HBars segs={rb.payments} fmt={(v) => m(v)} />
              </Card>
            </DetailSection>
          </>
        )}

        {/* Peer benchmark (operating businesses) */}
        {bench && (
          <div>
            <h2 className="mb-2 flex items-center gap-2 px-1 text-[14px] font-semibold text-white/90">
              How you compare
              <span className="rounded-full bg-brass/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brass">
                Beta
              </span>
            </h2>
            <Card className="p-5">
              <div className="flex items-baseline justify-between">
                <p className="text-[13px] text-white/55">vs similar {bench.label} near you</p>
                <p className="text-[22px] font-bold text-white tabular-nums">
                  {bench.percentile}
                  <span className="text-[13px] font-medium text-white/40">th</span>
                </p>
              </div>
              <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${bench.percentile}%`, background: business.accent }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-white/35">
                <span>peers' median</span>
                <span>top performers</span>
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-white/45">
                You're doing <b className="text-white/80">{usd(bench.yourDaily)}/day</b> — ahead of about{" "}
                {bench.percentile}% of {bench.label} your size. Top performers do ~{usd(bench.peerTop)}/day.
              </p>
              <p className="mt-2 text-[11px] text-white/30">
                Estimated from regional benchmarks · sharpens as more owners join Helm.
              </p>
            </Card>
          </div>
        )}

        {/* Portfolio holdings */}
        {isPort && business.holdings && (
          <div>
            <h2 className="mb-2 px-1 text-[14px] font-semibold text-white/90">Holdings</h2>
            <Card className="divide-y divide-white/[0.05]">
              {business.holdings
                .slice()
                .sort((a, b) => b.shares * b.price - a.shares * a.price)
                .map((h) => {
                  const value = h.shares * h.price;
                  return (
                    <div key={h.ticker} className="flex items-center gap-3 p-3.5">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.06] text-[11px] font-bold text-white">
                        {h.ticker}
                      </div>
                      <div className="flex-1">
                        <p className="text-[14px] font-semibold text-white">{h.name}</p>
                        <p className="text-[11px] text-white/40">
                          {h.shares} sh · {usd(h.price, true)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[14px] font-semibold text-white tabular-nums">{usd(value)}</p>
                        <Delta value={h.dayChangePct} className="mt-0.5" />
                      </div>
                    </div>
                  );
                })}
            </Card>
          </div>
        )}
      </div>
    </div>
    {!isPort && dayIdx != null && (
      <DayDetail
        business={business}
        index={dayIdx}
        cur={cur}
        onClose={() => setDayIdx(null)}
        onNav={(i) => setDayIdx(Math.max(0, Math.min(n - 1, i)))}
      />
    )}
    </>
  );
}

function DetailSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
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

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-[12px] font-medium text-white/45">{label}</p>
      <p className={cx("mt-1 text-[20px] font-bold tracking-tight tabular-nums", accent ?? "text-white")}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-white/40">{sub}</p>}
    </Card>
  );
}
