import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money, currencySymbol, shortDate } from "../lib/format";

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
            <linearGradient id={`area-${color}`} x1="0" y1="0" x2="0" y2="1">
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
            fill={`url(#area-${color})`}
            animationDuration={650}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
