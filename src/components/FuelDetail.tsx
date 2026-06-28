import { useState } from "react";
import { ChevronLeft, MapPin, Fuel, Store, DollarSign, Gauge, ShoppingBasket, TrendingUp } from "lucide-react";
import type { Business } from "../types";
import { fuelMetricsFor } from "../lib/fuelAnalytics";
import { usd, usdCompact, pct, signedPct, shortDate, weekday } from "../lib/format";
import { Card, Delta, cx } from "./ui";
import { DataHealthBadge } from "./DataHealthBadge";
import { AreaTrend } from "./charts";

const RANGES = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
];

type Mode = "revenue" | "gallons" | "cpg" | "inside";

export function FuelDetail({ business, onClose }: { business: Business; onClose: () => void }) {
  const [range, setRange] = useState(1);
  const [mode, setMode] = useState<Mode>("revenue");
  const m = fuelMetricsFor(business);
  if (!m || !business.fuelSeries) return null;

  const fs = business.fuelSeries;
  const slice = fs.slice(-RANGES[range].days);
  const chartData = slice.map((d) => ({
    date: d.date,
    revenue:
      mode === "revenue" ? d.totalRevenue : mode === "gallons" ? d.gallonsSold : mode === "cpg" ? d.cpg : d.insideSales,
  }));

  // Two-engine profit split.
  const fuelGP = m.monthFuelMargin;
  const insideGP = m.monthInsideMargin;
  const otherGP = m.monthGrossProfit - fuelGP - insideGP;
  const gpTotal = Math.max(1, m.monthGrossProfit);
  const segs = [
    { label: "Fuel", value: fuelGP, color: business.accent },
    { label: "Inside", value: insideGP, color: "#34c79a" },
    { label: "Other", value: Math.max(0, otherGP), color: "#e0ae49" },
  ].filter((s) => s.value > 0);

  return (
    <div className="fixed inset-0 z-40 mx-auto flex max-w-[440px] flex-col bg-[#0a263e]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-5">
        <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.06] active:scale-90">
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[18px] font-bold tracking-tight text-white">{business.name}</h1>
          <p className="flex items-center gap-1 truncate text-[12px] text-white/45">
            <MapPin size={11} /> {business.location}
            {business.pumps ? ` · ${business.pumps} pumps` : ""}
            {business.brand ? ` · ${business.brand}` : ""}
          </p>
        </div>
      </div>

      <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 pb-10 pt-1">
        {/* Persistent trust badge — coverage / freshness for the station's series */}
        <DataHealthBadge series={business.series} />

        {/* Hero — gross profit this month */}
        <Card className="p-5">
          <p className="text-[12px] font-medium text-white/45">Gross profit · last 30 days</p>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="text-[34px] font-bold tracking-tight text-white tabular-nums">{usd(m.monthGrossProfit)}</span>
            <Delta value={m.gallonsTrend7} />
          </div>
          <p className="mt-1 text-[12px] text-white/40">
            on {usdCompact(m.monthTotalRevenue)} revenue · {Math.round(m.avgGallonsDay).toLocaleString()} gal/day
          </p>
          <div className="-mx-1 mt-3">
            <AreaTrend data={chartData} color={business.accent} height={96} />
          </div>
          <div className="mt-1 flex gap-1 rounded-full bg-white/[0.05] p-0.5">
            {([
              ["revenue", "Revenue"],
              ["gallons", "Gallons"],
              ["cpg", "CPG"],
              ["inside", "Inside"],
            ] as [Mode, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setMode(k)}
                className={cx(
                  "flex-1 rounded-full py-1.5 text-[11px] font-bold transition",
                  mode === k ? "bg-white text-[#071e33]" : "text-white/50",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex justify-center gap-1">
            {RANGES.map((r, i) => (
              <button
                key={r.label}
                onClick={() => setRange(i)}
                className={cx(
                  "rounded-full px-3 py-1 text-[11px] font-semibold transition",
                  range === i ? "bg-white/15 text-white" : "text-white/40",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </Card>

        {/* The two-engine split — the heart of a fuel business */}
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Gauge size={15} className="text-brass" />
            <span className="text-[11px] font-bold uppercase tracking-wide text-brass">Where the profit comes from</span>
          </div>
          <div className="mt-3 flex h-3.5 overflow-hidden rounded-full">
            {segs.map((s) => (
              <div key={s.label} style={{ width: `${(s.value / gpTotal) * 100}%`, background: s.color }} />
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {segs.map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                <span className="text-[12.5px] text-white/65">{s.label}</span>
                <span className="ml-auto text-[12.5px] font-semibold tabular-nums text-white/85">
                  {usdCompact(s.value)} <span className="text-white/40">· {pct(s.value / gpTotal, 0)}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-white/[0.06] pt-3 text-[11.5px] leading-relaxed text-white/45">
            Fuel is {pct(m.monthFuelRevenue / Math.max(1, m.monthTotalRevenue), 0)} of revenue but only{" "}
            {pct(m.fuelProfitShare, 0)} of profit — the c-store is where the margin lives.
          </p>
        </Card>

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-3">
          <Kpi icon={Fuel} label="Gallons / day" value={Math.round(m.avgGallonsDay).toLocaleString()} />
          <Kpi icon={DollarSign} label="Fuel margin" value={`${m.monthCpg.toFixed(1)}¢/gal`} />
          <Kpi icon={Store} label="Inside / day" value={usd(m.avgInsideDay)} />
          <Kpi icon={TrendingUp} label="Inside margin" value={pct(m.monthInsideMarginPct, 0)} />
          <Kpi icon={ShoppingBasket} label="Inside per gallon" value={usd(m.insidePerGallon, true)} />
          <Kpi icon={DollarSign} label="Revenue / mo" value={usdCompact(m.monthTotalRevenue)} />
        </div>

        {/* Recent days */}
        <Card className="p-4">
          <p className="mb-2 text-[12px] font-medium text-white/45">Recent days</p>
          <div className="space-y-1.5">
            <div className="flex items-center text-[10px] font-semibold uppercase tracking-wide text-white/30">
              <span className="w-10">Day</span>
              <span className="flex-1 text-right">Gallons</span>
              <span className="flex-1 text-right">CPG</span>
              <span className="flex-1 text-right">Inside</span>
              <span className="flex-1 text-right">Revenue</span>
            </div>
            {fs.slice(-7).reverse().map((d) => (
              <div key={d.date} className="flex items-center text-[12px] tabular-nums">
                <span className="w-10 text-white/50">{weekday(d.date)}</span>
                <span className="flex-1 text-right text-white/80">{d.gallonsSold.toLocaleString()}</span>
                <span className="flex-1 text-right text-white/80">{d.cpg.toFixed(0)}¢</span>
                <span className="flex-1 text-right text-white/80">{usdCompact(d.insideSales)}</span>
                <span className="flex-1 text-right font-semibold text-white">{usdCompact(d.totalRevenue)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Fuel; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5">
        <Icon size={13} className="text-white/40" />
        <p className="text-[11px] font-medium text-white/45">{label}</p>
      </div>
      <p className="mt-1.5 text-[20px] font-bold tracking-tight text-white tabular-nums">{value}</p>
    </Card>
  );
}
