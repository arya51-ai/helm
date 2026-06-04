import { useState } from "react";
import {
  ArrowUpRight,
  Landmark,
  Wallet,
  Building2,
  Home,
  Car,
  Gem,
  Bitcoin,
  TrendingUp,
  Package,
  CreditCard,
  GraduationCap,
  Plus,
  ChevronRight,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import type { Business, Currency } from "../types";
import type { Metrics, EmpireSummary } from "../lib/analytics";
import { usd, usdCompact, pct, signedUsd } from "../lib/format";
import { DISPLAY_CURRENCY, RATES_TO_USD } from "../lib/currency";
import { empireCashProjection } from "../lib/forecast";
import { Card, Delta, SectionTitle, cx } from "./ui";
import { AreaTrend } from "./charts";
import {
  type NetWorthStore,
  type AssetKind,
  type LiabilityKind,
  assetKindLabel,
  liabilityKindLabel,
  extraMonthlyNet,
} from "../data/networth";
import { AssetSheet, type AssetSheetMode } from "./AssetSheet";

const ASSET_ICON: Record<AssetKind, LucideIcon> = {
  "real-estate": Home,
  cash: Wallet,
  investment: TrendingUp,
  vehicle: Car,
  crypto: Bitcoin,
  valuable: Gem,
  business: Building2,
  other: Package,
};
const LIAB_ICON: Record<LiabilityKind, LucideIcon> = {
  mortgage: Home,
  loan: Landmark,
  "credit-card": CreditCard,
  "auto-loan": Car,
  "student-loan": GraduationCap,
  other: Package,
};

type Tab = "overview" | "assets" | "liabilities";

export function EmpireScreen({
  businesses,
  metricsBy,
  empire,
  idleCash,
  netWorth,
  onOpenBusiness,
  onToast,
  onConnectCash,
  onNetWorthChange,
}: {
  businesses: Business[];
  metricsBy: Record<string, Metrics>;
  empire: EmpireSummary;
  idleCash: number;
  netWorth: NetWorthStore;
  onOpenBusiness: (id: string) => void;
  onToast: (msg: string) => void;
  onConnectCash: () => void;
  onNetWorthChange: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [sheet, setSheet] = useState<{ mode: AssetSheetMode; initial?: unknown } | null>(null);

  const ops = businesses.filter((b) => b.type !== "portfolio");
  const portfolio = businesses.find((b) => b.type === "portfolio")!;
  const pm = metricsBy[portfolio.id];

  const foreign = [
    ...new Set(businesses.map((b) => b.currency).filter((c): c is Currency => !!c && c !== DISPLAY_CURRENCY)),
  ];

  const totalAssets = empire.totalAssets;
  const liabilities = empire.liabilities;
  const extraMonthly = extraMonthlyNet(netWorth);

  // Net-worth composition (assets only).
  const segments = [
    { label: "Investments", value: empire.investments, color: "#7c6cf5" },
    ...ops.map((b) => ({ label: b.name, value: b.capitalDeployed, color: b.accent })),
    { label: "Idle cash", value: idleCash, color: "#64748b" },
    ...(empire.manualAssets > 0 ? [{ label: "Other assets", value: empire.manualAssets, color: "#10b981" }] : []),
  ].filter((s) => s.value > 0);

  // Return-on-capital ranking.
  const ranked = [
    ...ops.map((b) => ({ id: b.id, name: b.name, roic: metricsBy[b.id].roic, capital: b.capitalDeployed, color: b.accent })),
    { id: portfolio.id, name: "Stock portfolio", roic: pm.roic, capital: portfolio.capitalDeployed, color: portfolio.accent },
  ].sort((a, b) => b.roic - a.roic);
  const maxRoic = Math.max(...ranked.map((r) => r.roic));
  const best = ranked[0];
  const market = ranked.find((r) => r.id === portfolio.id)!;
  const upside = idleCash * best.roic - idleCash * market.roic;

  const cashProj = empireCashProjection(businesses, idleCash, 6, extraMonthly);

  const openSheet = (mode: AssetSheetMode, initial?: unknown) => setSheet({ mode, initial });

  return (
    <div className="animate-fade-up space-y-6 px-4 pb-6 pt-2">
      <header className="px-1 pt-1">
        <h1 className="text-[22px] font-bold tracking-tight text-white">Net worth</h1>
        <p className="text-[13px] text-white/45">Everything you own, minus everything you owe.</p>
      </header>

      {/* Net worth hero — always visible */}
      <Card className="p-5">
        <p className="text-[12px] font-medium text-white/45">Net worth</p>
        <div className="mt-1 flex items-baseline gap-2.5">
          <span className="text-[36px] font-bold tracking-tight text-white tabular-nums">{usd(empire.netWorth)}</span>
          <Delta value={empire.netWorthDayChange >= 0 ? 1 : -1} text={signedUsd(empire.netWorthDayChange)} />
        </div>
        <p className="mt-1 text-[12px] text-white/40">
          {usd(totalAssets)} in assets − {usd(liabilities)} owed · markets today
        </p>

        {/* Assets vs liabilities */}
        <div className="mt-5 space-y-3">
          <BalanceBar label="Assets" value={totalAssets} max={totalAssets} color="#10b981" />
          <BalanceBar label="Liabilities" value={liabilities} max={totalAssets} color="#ef4444" />
        </div>
        {liabilities === 0 && (
          <p className="mt-3 text-[11px] text-white/35">
            No debts added yet — add a mortgage or loan under <b className="text-white/55">Liabilities</b> for a true net worth.
          </p>
        )}
      </Card>

      {/* Tabs */}
      <div className="flex gap-1.5 rounded-full bg-white/[0.05] p-1">
        {(["overview", "assets", "liabilities"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cx(
              "flex-1 rounded-full py-2 text-[13px] font-semibold capitalize transition",
              tab === t ? "bg-white text-black" : "text-white/50",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ───────── OVERVIEW ───────── */}
      {tab === "overview" && (
        <>
          {/* Composition */}
          <Card className="p-5">
            <p className="text-[12px] font-medium text-white/45">What your assets are made of</p>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full">
              {segments.map((s) => (
                <div key={s.label} style={{ width: `${(s.value / totalAssets) * 100}%`, background: s.color }} />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-y-2">
              {segments.map((s) => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  <span className="truncate text-[12px] text-white/55">{s.label}</span>
                  <span className="ml-auto pr-3 text-[12px] font-semibold text-white/80 tabular-nums">{usdCompact(s.value)}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Capital move */}
          <Card className="border-violet-400/20 bg-violet-500/[0.07] p-5">
            <div className="flex items-center gap-2">
              <Landmark size={16} className="text-violet-300" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-violet-300">Capital move</span>
            </div>
            <h3 className="mt-2 text-[16px] font-semibold leading-snug text-white">
              Your {usdCompact(idleCash)} of idle cash could earn {pct(best.roic, 0)}, not {pct(market.roic, 0)}
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">
              {best.name} returns the most on the capital in it. Moving idle cash there instead of leaving it in the
              market is roughly <span className="font-semibold text-white">{signedUsd(upside)}/yr</span> of difference.
            </p>
            <button
              onClick={() => onToast("Capital plan saved to review ✓")}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black active:scale-95"
            >
              Build the plan <ArrowUpRight size={15} strokeWidth={2.5} />
            </button>
          </Card>

          {/* Cash flow + income streams */}
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
                  <p className={cx("mt-1 text-[18px] font-bold tracking-tight tabular-nums", cashProj.monthlyNet >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {signedUsd(cashProj.monthlyNet)}
                  </p>
                </div>
              </div>
              <div className="-mx-1 mt-3">
                <AreaTrend data={cashProj.points} color="#34d399" height={90} />
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-white/45">
                Forecast on your current trend: ~<span className="font-semibold text-white/80">{usd(cashProj.monthlyNet)}/mo</span> net,
                banking to <span className="font-semibold text-white/80">{usd(cashProj.totalIn)}</span> by 6 months
                {extraMonthly !== 0 && <> (incl. {signedUsd(extraMonthly)}/mo you added)</>}.
              </p>

              {/* Income streams */}
              {netWorth.income.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-3">
                  {netWorth.income.map((i) => (
                    <button key={i.id} onClick={() => openSheet("income", i)} className="flex w-full items-center justify-between text-left active:opacity-70">
                      <span className="flex items-center gap-1.5 text-[12.5px] text-white/60">
                        <Pencil size={11} className="text-white/30" /> {i.name}
                      </span>
                      <span className="text-[12.5px] font-semibold tabular-nums text-emerald-300">+{usd(i.monthly)}/mo</span>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => openSheet("income")}
                className="mt-3 flex items-center gap-1.5 text-[12px] font-semibold text-violet-300 active:scale-95"
              >
                <Plus size={13} /> Add an income stream
              </button>
            </Card>
          </section>

          {/* Return on capital */}
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
                    <div className="h-full rounded-full" style={{ width: `${(r.roic / maxRoic) * 100}%`, background: r.color }} />
                  </div>
                  <p className="mt-1 text-[11px] text-white/35 tabular-nums">{usdCompact(r.capital)} deployed · return on capital, annualized</p>
                </div>
              ))}
            </Card>
          </section>
        </>
      )}

      {/* ───────── ASSETS ───────── */}
      {tab === "assets" && (
        <>
          <section>
            <SectionTitle right={<span className="text-[12px] font-semibold text-white/70">{usd(totalAssets)}</span>}>
              Tracked by Helm
            </SectionTitle>
            <Card className="divide-y divide-white/[0.05]">
              {ops.map((b) => (
                <ItemRow
                  key={b.id}
                  icon={Building2}
                  color={b.accent}
                  name={b.name}
                  sub={`Business · ${pct(b.netMargin ?? 0, 0)} margin`}
                  value={b.capitalDeployed}
                  auto
                  onClick={() => onOpenBusiness(b.id)}
                />
              ))}
              <ItemRow icon={TrendingUp} color="#7c6cf5" name={portfolio.name} sub="Investments · live" value={empire.investments} auto onClick={() => onOpenBusiness(portfolio.id)} />
              <ItemRow icon={Wallet} color="#64748b" name="Idle cash" sub="Cash · checking" value={idleCash} auto onClick={onConnectCash} />
            </Card>
          </section>

          <section>
            <SectionTitle right={<span className="text-[12px] font-semibold text-emerald-300">{usd(empire.manualAssets)}</span>}>
              Added by you
            </SectionTitle>
            {netWorth.assets.length > 0 ? (
              <Card className="divide-y divide-white/[0.05]">
                {netWorth.assets.map((a) => (
                  <ItemRow
                    key={a.id}
                    icon={ASSET_ICON[a.kind]}
                    color="#10b981"
                    name={a.name}
                    sub={a.monthlyIncome ? `${assetKindLabel(a.kind)} · +${usd(a.monthlyIncome)}/mo` : assetKindLabel(a.kind)}
                    value={a.value}
                    editable
                    onClick={() => openSheet("asset", a)}
                  />
                ))}
              </Card>
            ) : (
              <Card className="p-5 text-center text-[13px] text-white/40">
                Add a house, a car, savings, crypto — anything Helm can't see — for an accurate net worth.
              </Card>
            )}
            <AddButton label="Add an asset" onClick={() => openSheet("asset")} />
          </section>
        </>
      )}

      {/* ───────── LIABILITIES ───────── */}
      {tab === "liabilities" && (
        <section>
          <SectionTitle right={<span className="text-[12px] font-semibold text-rose-300">{usd(liabilities)}</span>}>
            What you owe
          </SectionTitle>
          {netWorth.liabilities.length > 0 ? (
            <Card className="divide-y divide-white/[0.05]">
              {netWorth.liabilities.map((l) => (
                <ItemRow
                  key={l.id}
                  icon={LIAB_ICON[l.kind]}
                  color="#ef4444"
                  name={l.name}
                  sub={[liabilityKindLabel(l.kind), l.apr ? `${l.apr}% APR` : null, l.monthlyPayment ? `${usd(l.monthlyPayment)}/mo` : null].filter(Boolean).join(" · ")}
                  value={l.balance}
                  negative
                  editable
                  onClick={() => openSheet("liability", l)}
                />
              ))}
            </Card>
          ) : (
            <Card className="p-5 text-center text-[13px] text-white/40">
              Add a mortgage, car loan, or credit-card balance. Helm subtracts these from your net worth.
            </Card>
          )}
          <AddButton label="Add a liability" onClick={() => openSheet("liability")} />

          <Card className="mt-5 p-4">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-white/55">Assets</span>
              <span className="font-semibold tabular-nums text-emerald-300">{usd(totalAssets)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[13px]">
              <span className="text-white/55">Liabilities</span>
              <span className="font-semibold tabular-nums text-rose-300">−{usd(liabilities)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/[0.08] pt-3">
              <span className="text-[14px] font-semibold text-white">Net worth</span>
              <span className="text-[18px] font-bold tabular-nums text-white">{usd(empire.netWorth)}</span>
            </div>
          </Card>
        </section>
      )}

      {foreign.length > 0 && (
        <p className="px-1 text-[11px] leading-relaxed text-white/30">
          Totals shown in {DISPLAY_CURRENCY}.{" "}
          {foreign.map((c) => `${c} converted at 1 ${c} = $${RATES_TO_USD[c].toFixed(2)}`).join(" · ")}.
        </p>
      )}

      {sheet && (
        <AssetSheet
          mode={sheet.mode}
          initial={sheet.initial as never}
          onClose={() => setSheet(null)}
          onSaved={onNetWorthChange}
          onToast={onToast}
        />
      )}
    </div>
  );
}

function BalanceBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12.5px]">
        <span className="text-white/55">{label}</span>
        <span className="font-semibold tabular-nums" style={{ color }}>
          {usd(value)}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
        <div className="h-full rounded-full" style={{ width: `${max ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0}%`, background: color }} />
      </div>
    </div>
  );
}

function ItemRow({
  icon: Icon,
  color,
  name,
  sub,
  value,
  auto,
  editable,
  negative,
  onClick,
}: {
  icon: LucideIcon;
  color: string;
  name: string;
  sub: string;
  value: number;
  auto?: boolean;
  editable?: boolean;
  negative?: boolean;
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 p-4 text-left active:bg-white/[0.02]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${color}22`, color }}>
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-white">{name}</p>
        <p className="truncate text-[11px] text-white/40">{sub}</p>
      </div>
      <div className="text-right">
        <p className={cx("text-[14px] font-semibold tabular-nums", negative ? "text-rose-300" : "text-white")}>
          {negative ? "−" : ""}
          {usd(value)}
        </p>
        {auto && <p className="text-[10px] font-medium uppercase tracking-wide text-white/30">auto</p>}
      </div>
      {editable ? <Pencil size={14} className="text-white/25" /> : <ChevronRight size={16} className="text-white/20" />}
    </button>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-3xl border border-dashed border-white/15 py-4 text-[14px] font-medium text-white/55 active:scale-[0.99]"
    >
      <Plus size={18} /> {label}
    </button>
  );
}
