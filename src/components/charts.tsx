import { Fragment, useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money, currencySymbol, shortDate, weekday, pct } from "../lib/format";
import { type Seg, type DowStat, type HourPoint, hourLabel } from "../lib/breakdowns";
import { isoDate } from "../data/rng";
import { cx } from "./ui";

interface TrendPoint {
  date: string;
  revenue: number;
}

function TooltipBox({ active, payload, currency = "USD" }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as TrendPoint;
  return (
    <div className="rounded-xl border border-white/10 bg-[#15161d] px-3 py-2 shadow-xl">
      <div className="text-[11px] font-medium text-white/50">{shortDate(p.date)}</div>
      <div className="text-sm font-semibold text-white tabular-nums">{money(p.revenue, currency)}</div>
    </div>
  );
}

export function AreaTrend({
  data,
  color,
  height = 160,
  showAxis = false,
  currency = "USD",
}: {
  data: TrendPoint[];
  color: string;
  height?: number;
  showAxis?: boolean;
  /** ISO currency the values are already expressed in (drives the axis symbol + tooltip). */
  currency?: string;
}) {
  const sym = currencySymbol(currency);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`area-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {showAxis && (
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={28}
            />
          )}
          {showAxis && (
            <YAxis
              tickFormatter={(v) =>
                v === 0 ? `${sym}0` : v < 1000 ? `${sym}${(v / 1000).toFixed(1)}k` : `${sym}${(v / 1000).toFixed(0)}k`
              }
              tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={currency === "USD" ? 34 : 50}
            />
          )}
          <Tooltip content={(props) => <TooltipBox {...props} currency={currency} />} cursor={{ stroke: "rgba(255,255,255,0.15)" }} />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#area-${color.replace(/[^a-z0-9]/gi, "")})`}
            animationDuration={650}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Track an element's pixel width (for crisp, responsive custom SVG). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export interface DayBarPoint {
  date: string;
  revenue: number;
  /** Typical same-weekday net sales — drawn as a faint baseline tick if present. */
  expected?: number;
}

/**
 * Interactive daily bar chart: every day is its own tappable column, weekends are
 * dimmed, the selected day is outlined, and a faint tick marks each day's "typical"
 * baseline. Labels show weekdays (short ranges) or dates (long ranges).
 */
export function DayBars({
  data,
  color,
  currency = "USD",
  selected,
  onSelect,
  height = 172,
}: {
  data: DayBarPoint[];
  color: string;
  currency?: string;
  selected?: string | null;
  onSelect?: (date: string) => void;
  height?: number;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = data.length;
  const padT = 8;
  const padB = 20;
  const innerH = height - padT - padB;
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const slot = n && w ? w / n : 0;
  const barW = Math.max(2, Math.min(slot * 0.64, 22));
  const labelStep = n <= 14 ? 1 : Math.ceil(n / 7);
  const sym = currencySymbol(currency);

  return (
    <div className="w-full">
      <div ref={ref} style={{ height }} className="w-full">
        {w > 0 && (
          <svg width={w} height={height} role="img">
            {data.map((d, i) => {
              const cx = i * slot + slot / 2;
              const h = Math.max(1, (d.revenue / max) * innerH);
              const y = padT + innerH - h;
              const dow = new Date(`${d.date}T00:00:00`).getDay();
              const weekend = dow === 0 || dow === 6;
              const isSel = selected === d.date;
              const fill = isSel ? color : `${color}${weekend ? "4d" : "99"}`;
              const showLabel = i % labelStep === 0 || isSel;
              const labelText = n <= 14 ? weekday(d.date) : shortDate(d.date);
              return (
                <g key={d.date}>
                  <rect
                    x={i * slot}
                    y={0}
                    width={slot}
                    height={height}
                    fill="transparent"
                    style={{ cursor: onSelect ? "pointer" : "default" }}
                    onClick={() => onSelect?.(d.date)}
                  />
                  {d.expected != null && (
                    <rect
                      x={cx - barW / 2 - 1.5}
                      y={padT + innerH - (d.expected / max) * innerH}
                      width={barW + 3}
                      height={1.5}
                      fill="rgba(255,255,255,0.45)"
                    />
                  )}
                  <rect x={cx - barW / 2} y={y} width={barW} height={h} rx={Math.min(3, barW / 2)} fill={fill} />
                  {isSel && (
                    <rect
                      x={cx - barW / 2 - 1.5}
                      y={y - 1.5}
                      width={barW + 3}
                      height={h + 3}
                      rx={Math.min(4, barW / 2 + 1)}
                      fill="none"
                      stroke="#fff"
                      strokeWidth={1.5}
                    />
                  )}
                  {showLabel && (
                    <text
                      x={cx}
                      y={height - 6}
                      textAnchor="middle"
                      fontSize={10}
                      fill={isSel ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)"}
                      fontWeight={isSel ? 700 : 400}
                    >
                      {labelText}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <div className="mt-1 flex items-center justify-center gap-3 text-[10px] text-white/35">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} /> net sales
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-[2px] w-3 bg-white/45" /> typical {sym}
        </span>
        <span>· tap a day</span>
      </div>
    </div>
  );
}

/** Horizontal "share of sales" bars for a breakdown (daypart, category, channel, payment). */
export function HBars({ segs, fmt }: { segs: Seg[]; fmt: (n: number) => string }) {
  const max = Math.max(...segs.map((s) => s.amount), 1);
  return (
    <div className="space-y-2.5">
      {segs.map((s) => (
        <div key={s.key}>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-white/65">{s.label}</span>
            <span className="font-semibold text-white/90 tabular-nums">
              {fmt(s.amount)} <span className="text-white/35">· {pct(s.share, 0)}</span>
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full" style={{ width: `${(s.amount / max) * 100}%`, background: s.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Average-by-weekday column chart; best day highlighted, worst tinted red. */
export function DowBars({ stats, color, onSelectDow }: { stats: DowStat[]; color: string; onSelectDow?: (dow: number) => void }) {
  const max = Math.max(...stats.map((s) => s.avg), 1);
  return (
    <div className="flex h-[116px] items-end justify-between gap-1.5">
      {stats.map((s) => (
        <button
          key={s.dow}
          onClick={() => onSelectDow?.(s.dow)}
          className="flex h-full flex-1 flex-col items-center justify-end"
        >
          <div
            className="w-full rounded-t-md transition-all"
            style={{
              height: `${s.avg ? Math.max(4, (s.avg / max) * 100) : 0}%`,
              background: s.best ? color : s.worst ? "#ef4444aa" : `${color}59`,
            }}
          />
          <span className={`mt-1.5 text-[10px] ${s.best ? "font-bold text-white/80" : "text-white/40"}`}>{s.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Hourly net-sales curve for a single day; peak hour highlighted. */
export function HourBars({ hours, peak, color }: { hours: HourPoint[]; peak: number; color: string }) {
  const max = Math.max(...hours.map((h) => h.amount), 1);
  const ticks = hours.filter((_, i) => i % 3 === 0);
  return (
    <div>
      <div className="flex h-[92px] items-end gap-[3px]">
        {hours.map((h) => (
          <div key={h.hour} className="flex h-full flex-1 flex-col justify-end">
            <div
              className="w-full rounded-t-[3px]"
              style={{ height: `${Math.max(2, (h.amount / max) * 100)}%`, background: h.hour === peak ? color : `${color}59` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-white/35">
        {ticks.map((h) => (
          <span key={h.hour}>{hourLabel(h.hour)}</span>
        ))}
      </div>
    </div>
  );
}

export interface CalPoint {
  date: string;
  value: number;
}

function localDay(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}
function compactNum(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `${Math.round(v)}`;
}

/**
 * Calendar heatmap: each day is a large (~44px), color-coded, tappable tile laid out
 * like a real calendar (weekday columns, week rows). Built for legibility on a phone —
 * the value sits on every tile (never color-alone), darker = a bigger sales day. The
 * readable answer to 30–90 hair-thin bars.
 */
export function CalendarHeatmap({
  points,
  color,
  selected,
  onSelect,
  fmt,
}: {
  points: CalPoint[];
  color: string;
  selected?: string | null;
  onSelect?: (date: string) => void;
  fmt: (n: number) => string;
}) {
  if (!points.length) return null;
  const byDate = new Map(points.map((p) => [p.date, p.value]));
  const max = Math.max(...points.map((p) => p.value), 1);
  const todayIso = points[points.length - 1].date;

  // Build week rows from the Sunday on/before the first day, through the last day.
  const first = localDay(points[0].date);
  const last = localDay(points[points.length - 1].date);
  const startSun = new Date(first);
  startSun.setDate(startSun.getDate() - startSun.getDay());
  const weeks: Date[][] = [];
  const cursor = new Date(startSun);
  while (cursor <= last) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  // Month label for the row where the month first appears.
  let prevMonth = -1;
  const monthLabels = weeks.map((week) => {
    const rep = week.find((d) => byDate.has(isoDate(d))) ?? week[3];
    const mo = rep.getMonth();
    if (mo !== prevMonth) {
      prevMonth = mo;
      return rep.toLocaleDateString("en-US", { month: "short" });
    }
    return "";
  });

  const alphaHex = (t: number) =>
    Math.round((0.16 + 0.84 * Math.max(0, Math.min(1, t))) * 255)
      .toString(16)
      .padStart(2, "0");
  const wd = ["S", "M", "T", "W", "T", "F", "S"];
  const cols = "28px repeat(7, 1fr)";

  return (
    <div>
      <div className="grid items-center" style={{ gridTemplateColumns: cols, gap: 3 }}>
        <div />
        {wd.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-white/35">
            {d}
          </div>
        ))}
      </div>
      <div className="mt-1 grid" style={{ gridTemplateColumns: cols, gap: 3 }}>
        {weeks.map((week, wi) => (
          <Fragment key={wi}>
            <div className="flex items-center text-[10px] font-medium text-white/40">{monthLabels[wi]}</div>
            {week.map((day, di) => {
              const iso = isoDate(day);
              const v = byDate.get(iso);
              const weekend = di === 0 || di === 6;
              const isSel = selected === iso;
              if (v == null) {
                return <div key={di} className="aspect-square rounded-lg border border-white/[0.03]" />;
              }
              return (
                <button
                  key={di}
                  onClick={() => onSelect?.(iso)}
                  title={`${weekday(iso)} ${shortDate(iso)} · ${fmt(v)}`}
                  className={cx(
                    "relative flex aspect-square flex-col items-center justify-center rounded-lg transition active:scale-90",
                    isSel && "ring-2 ring-white",
                  )}
                  style={{
                    background: `${color}${alphaHex(v / max)}`,
                    outline: iso === todayIso && !isSel ? `1.5px solid ${color}` : undefined,
                  }}
                >
                  <span className={cx("absolute left-1 top-0.5 text-[8px] leading-none", weekend ? "text-white/35" : "text-white/50")}>
                    {day.getDate()}
                  </span>
                  <span className="text-[11px] font-bold leading-none text-white tabular-nums">{compactNum(v)}</span>
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] text-white/40">
        <span>tap a day to drill in</span>
        <span className="flex items-center gap-1">
          less
          <span className="flex gap-0.5">
            {[0.2, 0.45, 0.7, 1].map((t) => (
              <span key={t} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: `${color}${alphaHex(t)}` }} />
            ))}
          </span>
          more
        </span>
      </div>
    </div>
  );
}

export interface ForecastBand {
  date: string;
  mean: number;
  lo: number;
  hi: number;
}

/**
 * Actuals (solid) flowing into a forecast (dashed mean + shaded lo–hi band). The forecast
 * is anchored to the last actual point so the line is continuous. Values are already in the
 * display currency.
 */
export function ForecastChart({
  actual,
  forecast,
  color,
  height = 140,
}: {
  actual: { date: string; revenue: number }[];
  forecast: ForecastBand[];
  color: string;
  height?: number;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const A = actual.length;
  const F = forecast.length;
  const N = A + F;
  const lastActual = A ? actual[A - 1].revenue : forecast[0]?.mean ?? 0;
  const vals = [...actual.map((a) => a.revenue), ...forecast.flatMap((f) => [f.lo, f.hi, f.mean]), 0];
  const min = Math.min(...vals);
  const max = Math.max(...vals, 1);
  const range = max - min || 1;
  const padT = 12;
  const padB = 18;
  const innerH = height - padT - padB;
  const x = (i: number) => (N > 1 ? (i / (N - 1)) * w : w / 2);
  const y = (v: number) => padT + innerH - ((v - min) / range) * innerH;

  const id = `fc-${color.replace(/[^a-z0-9]/gi, "")}`;
  // Actual line + filled area to baseline.
  const actPts = actual.map((a, i) => `${x(i).toFixed(1)},${y(a.revenue).toFixed(1)}`);
  const actLine = A ? `M${actPts.join(" L")}` : "";
  const actArea = A ? `${actLine} L${x(A - 1).toFixed(1)},${height} L0,${height} Z` : "";
  // Forecast mean: anchor at the last actual (index A-1), then each forecast point (A..N-1).
  const fcMean = forecast.map((f, i) => `${x(A + i).toFixed(1)},${y(f.mean).toFixed(1)}`);
  const fcLine = F ? `M${x(A - 1).toFixed(1)},${y(lastActual).toFixed(1)} L${fcMean.join(" L")}` : "";
  // Band polygon: hi across (left→right), then lo back (right→left), anchored at last actual.
  const hiPts = forecast.map((f, i) => `${x(A + i).toFixed(1)},${y(f.hi).toFixed(1)}`);
  const loPts = forecast.map((f, i) => `${x(A + i).toFixed(1)},${y(f.lo).toFixed(1)}`).reverse();
  const anchor = `${x(A - 1).toFixed(1)},${y(lastActual).toFixed(1)}`;
  const band = F ? `M${anchor} L${hiPts.join(" L")} L${loPts.join(" L")} Z` : "";

  return (
    <div ref={ref} style={{ height }} className="w-full">
      {w > 0 && N > 0 && (
        <svg width={w} height={height} role="img">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          {/* divider between actual and forecast */}
          {A > 0 && F > 0 && (
            <line x1={x(A - 1)} y1={padT} x2={x(A - 1)} y2={padT + innerH} stroke="rgba(255,255,255,0.12)" strokeDasharray="2 3" />
          )}
          <path d={actArea} fill={`url(#${id})`} />
          {band && <path d={band} fill={color} fillOpacity={0.12} />}
          <path d={actLine} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {fcLine && (
            <path d={fcLine} fill="none" stroke={color} strokeWidth={2} strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
          )}
          {A > 0 && <circle cx={x(A - 1)} cy={y(lastActual)} r={3} fill={color} />}
          <text x={2} y={height - 4} fontSize={9} fill="rgba(255,255,255,0.35)">
            {actual[0] ? shortDate(actual[0].date) : ""}
          </text>
          {forecast[F - 1] && (
            <text x={w - 2} y={height - 4} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.35)">
              {shortDate(forecast[F - 1].date)}
            </text>
          )}
        </svg>
      )}
    </div>
  );
}

/** A clean, bold, full-width trend ribbon (custom SVG) — shows the shape at a glance. */
export function TrendRibbon({
  data,
  color,
  height = 88,
}: {
  data: { date: string; revenue: number }[];
  color: string;
  height?: number;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = data.length;
  const vals = data.map((d) => d.revenue);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 1);
  const range = max - min || 1;
  const padT = 12;
  const padB = 6;
  const innerH = height - padT - padB;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * w : w / 2);
  const y = (v: number) => padT + innerH - ((v - min) / range) * innerH;
  const id = `ribbon-${color.replace(/[^a-z0-9]/gi, "")}`;
  const linePts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.revenue).toFixed(1)}`);
  const line = n ? `M${linePts.join(" L")}` : "";
  const area = n ? `${line} L${w.toFixed(1)},${height} L0,${height} Z` : "";

  return (
    <div ref={ref} style={{ height }} className="w-full">
      {w > 0 && n > 0 && (
        <svg width={w} height={height} role="img">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.34} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id})`} />
          <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(n - 1)} cy={y(vals[n - 1])} r={3.5} fill={color} />
        </svg>
      )}
    </div>
  );
}
