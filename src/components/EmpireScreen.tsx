import { ArrowUpRight, Landmark, Wallet, Building2 } from "lucide-react";
import type { Business, Currency } from "../types";
import type { Metrics, EmpireSummary } from "../lib/analytics";
import { usd, usdCompact, pct, signedUsd, signedPct } from "../lib/format";
import { DISPLAY_CURRENCY, RATES_TO_USD } from "../lib/currency";
import { Card, Delta, SectionTitle, cx } from "./ui";
import { AreaTrend } from "./charts";

export function EmpireScreen({
  businesses,
  metricsBy,
  empire,
  idleCash,
  onOpenBusiness,
  onToast,
  onConnectCash,
}: {
  businesses: Business[];
  metricsBy: Record<string, Metrics>;
  empire: EmpireSummary;
  idleCash: number;
  onOpenBusiness: (id: string) => void;
  onToast: (msg: string) => void;
  onConnectCash: () => void;
}) {
  const ops = businesses.filter((b) => b.type !== "portfolio");
  const portfolio = businesses.find((b) => b.type === "portfolio")!;
  const pm = metricsBy[portfolio.id];

  // Currencies other than the display currency, so we can footnote the conversion.
  const foreign = [
    ...new Set(businesses.map((b) => b.currency).filter((c): c is Currency => !!c && c !== DISPLAY_CURRENCY)),
  ];

  // Composition of net worth
  const segments = [
    { label: "Investments", value: empire.investments, color: "#7c6cf5" },
    ...ops.map((b) => ({ label: b.name, value: b.capitalDeployed, color: b.accent })),
    { label: "Idle cash", value: idleCash, color: "#64748b" },
  ];

  // Return-on-capital ranking (businesses + market on one yardstick)
  const ranked = [
    ...ops.map((b) => ({
      id: b.id,
      name: b.name,
      roic: metricsBy[b.id].roic,
      capital: b.capitalDeployed,
      color: b.accent,
    })),
    {
      id: portfolio.id,
      name: "Stock portfolio",
      roic: pm.roic,
      capital: portfolio.capitalDeployed,
      color: portfolio.accent,
    },
  ].sort((a, b) => b.roic - a.roic);
  const maxRoic = Math.max(...ranked.map((r) => r.roic));
  const best = ranked[0];
  const market = ranked.find((r) => r.id === portfolio.id)!;
  const upside = idleCash * best.roic - idleCash * market.roic;

  // Cash flow: profitable ops throw off cash; project the bankable balance forward.
  const monthlyNet = Math.round(ops.reduce((a, b) => a + metricsBy[b.id].monthlyProfit, 0));
  const projMonths = 6;
  const cashStart = (() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const projection = Array.from({ length: projMonths + 1 }, (_, i) => {
    const d = new Date(cashStart);
    d.setMonth(d.getMonth() + i);
    return { date: d.toISOString().slice(0, 10), revenue: idleCash + monthlyNet * i };
  });
  const cashIn6 = idleCash + monthlyNet * projMonths;

  return (
    <div className="animate-fade-up space-y-7 px-4 pb-6 pt-2">
      <header className="px-1 pt-1">
        <h1 className="text-[22px] font-bold tracking-tight text-white">Net worth</h1>
        <p className="text-[13px] text-white/45">Your whole empire on one yardstick.</p>
      </header>

      {/* Net worth hero */}
      <Card className="p-5">
        <p className="text-[12px] font-medium text-white/45">Estimated net worth</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[36px] font-bold tracking-tight text-white tabular-nums">
            {usd(empire.netWorth)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[13px] text-white/45">
          <Delta value={empire.netWorthDayChange >= 0 ? 1 : -1} text={signedUsd(empire.netWorthDayChange)} />
          <span>from markets today</span>
        </div>

        {/* Composition bar */}
        <div className="mt-5 flex h-3 overflow-hidden rounded-full">
          {segments.map((s) => (
            <div
              key={s.label}
              style={{ width: `${(s.value / empire.netWorth) * 100}%`, background: s.color }}
            />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-y-2">
          {segments.map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              <span className="text-[12px] text-white/55">{s.label}</span>
              <span className="ml-auto pr-3 text-[12px] font-semibold text-white/80 tabular-nums">
                {usdCompact(s.value)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Capital allocator callout */}
      <Card className="border-violet-400/20 bg-violet-500/[0.07] p-5">
        <div className="flex items-center gap-2">
          <Landmark size={16} className="text-violet-300" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-violet-300">
            Capital move
          </span>
        </div>
        <h3 className="mt-2 text-[16px] font-semibold leading-snug text-white">
          Your {usdCompact(idleCash)} of idle cash could earn {pct(best.roic, 0)}, not {pct(market.roic, 0)}
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">
          {best.name} returns the most on the capital in it. Moving idle cash there instead of leaving
          it in the market is roughly <span className="font-semibold text-white">{signedUsd(upside)}/yr</span> of
          difference.
        </p>
        <button
          onClick={() => onToast("Capital plan saved to review ✓")}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black active:scale-95"
        >
          Build the plan <ArrowUpRight size={15} strokeWidth={2.5} />
        </button>
      </Card>

      {/* Cash flow */}
      <section>
        <SectionTitle
          right={
            <button onClick={onConnectCash} className="flex items-center gap-1 text-[12px] font-semibold text-violet-300">
              <Landmark size={12} /> Sync bank
            </button>
          }
        >
          Cash flow
        </SectionTitle>
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[12px] font-medium text-white/45">Cash on hand</p>
              <p className="mt-1 text-[28px] font-bold tracking-tight text-white tabular-nums">{usd(idleCash)}</p>
            </div>
            <div className="text-right">
              <p className="text-[12px] font-medium text-white/45">Net / mo</p>
              <p className="mt-1 text-[18px] font-bold tracking-tight text-emerald-400 tabular-nums">
                {signedUsd(monthlyNet)}
              </p>
            </div>
          </div>
          <div className="-mx-1 mt-3">
            <AreaTrend data={projection} color="#34d399" height={90} />
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-white/45">
            Your businesses throw off <span className="font-semibold text-white/80">{usd(monthlyNet)}/mo</span> in
            net profit. Banked, that's <span className="font-semibold text-white/80">{usd(cashIn6)}</span> in 6
            months — capital you could redeploy.
          </p>
        </Card>
      </section>

      {/* Return on capital ranking */}
      <section>
        <SectionTitle>Where your money works hardest</SectionTitle>
        <Card className="space-y-4 p-5">
          {ranked.map((r) => (
            <div key={r.id} onClick={() => onOpenBusiness(r.id)} className="cursor-pointer">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-medium text-white/80">{r.name}</span>
                <span className="text-[13px] font-bold text-white tabular-nums">{pct(r.roic, 0)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(r.roic / maxRoic) * 100}%`, background: r.color }}
                />
              </div>
              <p className="mt-1 text-[11px] text-white/35 tabular-nums">
                {usdCompact(r.capital)} deployed · return on capital, annualized
              </p>
            </div>
          ))}
        </Card>
      </section>

      {/* Per-business economics */}
      <section>
        <SectionTitle>Monthly profit</SectionTitle>
        <div className="space-y-3">
          {ops.map((b) => {
            const m = metricsBy[b.id];
            return (
              <Card key={b.id} className="flex items-center gap-3 p-4" onClick={() => onOpenBusiness(b.id)}>
                <Building2 size={18} style={{ color: b.accent }} />
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-white">{b.name}</p>
                  <p className="text-[12px] text-white/40">
                    {pct(b.netMargin ?? 0, 0)} net margin · {usdCompact(b.capitalDeployed)} in
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[15px] font-bold text-white tabular-nums">{usd(m.monthlyProfit)}</p>
                  <p className="text-[11px] text-white/40">/mo profit</p>
                </div>
              </Card>
            );
          })}
          <Card className="flex items-center gap-3 p-4">
            <Wallet size={18} className="text-slate-400" />
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-white">Idle cash</p>
              <p className="text-[12px] text-white/40">Earning ~0% in checking</p>
            </div>
            <p className="text-[15px] font-bold text-white tabular-nums">{usd(idleCash)}</p>
          </Card>
        </div>
      </section>

      {foreign.length > 0 && (
        <p className="px-1 text-[11px] leading-relaxed text-white/30">
          Totals shown in {DISPLAY_CURRENCY}.{" "}
          {foreign.map((c) => `${c} converted at 1 ${c} = $${RATES_TO_USD[c].toFixed(2)}`).join(" · ")}.
        </p>
      )}
    </div>
  );
}
