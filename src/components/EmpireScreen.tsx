import { useMemo, useState } from "react";
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
  Target,
  Droplet,
  Scale,
  Layers,
  Activity,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { Business, Currency } from "../types";
import type { Metrics, EmpireSummary } from "../lib/analytics";
import { usd, usdCompact, pct, signedUsd, shortDate } from "../lib/format";
import { DISPLAY_CURRENCY, RATES_TO_USD } from "../lib/currency";
import { empireCashProjection } from "../lib/forecast";
import { buildNetWorthIntel, type HealthFactor } from "../lib/netWorthHistory";
import { NetWorthChart, type ScrubInfo } from "./NetWorthChart";
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
const FACTOR_ICON: Record<HealthFactor["key"], LucideIcon> = {
  liquidity: Droplet,
  leverage: Scale,
  diversification: Layers,
  growth: Activity,
};

type Tab = "overview" | "assets" | "liabilities";
type Range = "1M" | "3M" | "1Y";

const scoreColor = (s: number) => (s >= 75 ? "#34c79a" : s >= 50 ? "#e0ae49" : "#e2685c");

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
  const [range, setRange] = useState<Range>("3M");
  const [scrub, setScrub] = useState<ScrubInfo | null>(null);
  const [sheet, setSheet] = useState<{ mode: AssetSheetMode; initial?: unknown } | null>(null);

  const ops = businesses.filter((b) => b.type !== "portfolio");
  const portfolio = businesses.find((b) => b.type === "portfolio");
  const pm = portfolio ? metricsBy[portfolio.id] : undefined;

  const foreign = [
    ...new Set(businesses.map((b) => b.currency).filter((c): c is Currency => !!c && c !== DISPLAY_CURRENCY)),
  ];

  const totalAssets = empire.totalAssets;
  const liabilities = empire.liabilities;
  const extraMonthly = extraMonthlyNet(netWorth);

  const intel = useMemo(
    () => buildNetWorthIntel(businesses, idleCash, netWorth),
    [businesses, idleCash, netWorth],
  );

  // Chart slice + projection per selected range. The 1Y view downsamples history to weekly
  // so the daily curve doesn't squash flat beside 12 months of projection — and the "today"
  // divider lands near center where the forward cone reads clearly.
  const chart = useMemo(() => {
    if (!intel) return null;
    if (range === "1M") return { history: intel.history.slice(-30), projection: intel.projection, showProjection: false };
    if (range === "3M") return { history: intel.history, projection: intel.projection, showProjection: false };
    const weekly = intel.history.filter((_, i) => i % 7 === 0);
    const last = intel.history[intel.history.length - 1];
    if (weekly[weekly.length - 1]?.date !== last.date) weekly.push(last);
    return { history: weekly, projection: intel.projection, showProjection: true };
  }, [intel, range]);

  // Hero number follows the scrubber when active, else shows live net worth.
  const heroValue = scrub ? scrub.value : empire.netWorth;
  const heroSub = scrub
    ? `${shortDate(scrub.date)}${scrub.projected ? " · projected" : ""}`
    : `${usd(totalAssets)} in assets − ${usd(liabilities)} owed`;

  // Net-worth composition (assets only).
  const segments = [
    { label: "Investments", value: empire.investments, color: "#e0ae49" },
    ...ops.map((b) => ({ label: b.shortName ?? b.name, value: b.capitalDeployed, color: b.accent })),
    { label: "Idle cash", value: idleCash, color: "#6e89a1" },
    ...(empire.manualAssets > 0 ? [{ label: "Other assets", value: empire.manualAssets, color: "#34c79a" }] : []),
  ].filter((s) => s.value > 0);

  // Return-on-capital ranking.
  const ranked = [
    ...ops.map((b) => ({ id: b.id, name: b.shortName ?? b.name, roic: metricsBy[b.id].roic, capital: b.capitalDeployed, color: b.accent })),
    ...(portfolio && pm ? [{ id: portfolio.id, name: "Stock portfolio", roic: pm.roic, capital: portfolio.capitalDeployed, color: portfolio.accent }] : []),
  ].sort((a, b) => b.roic - a.roic);
  const maxRoic = Math.max(...ranked.map((r) => r.roic), 0.0001);
  const best = ranked[0];
  const market = portfolio ? ranked.find((r) => r.id === portfolio.id) : undefined;
  const upside = best && market ? idleCash * best.roic - idleCash * market.roic : 0;

  const cashProj = empireCashProjection(businesses, idleCash, 6, extraMonthly);

  const openSheet = (mode: AssetSheetMode, initial?: unknown) => setSheet({ mode, initial });

  return (
    <div className="animate-fade-up space-y-6 px-4 pb-6 pt-2">
      <header className="px-1 pt-1">
        <h1 className="text-[22px] font-bold tracking-tight text-white">Net worth</h1>
        <p className="text-[13px] text-white/45">Everything you own, minus everything you owe.</p>
      </header>

      {/* ───── Net worth hero with live history → projection ───── */}
      <Card className="overflow-hidden p-5">
        <p className="text-[12px] font-medium text-white/45">{scrub ? "Net worth" : "Net worth today"}</p>
        <div className="mt-1 flex items-baseline gap-2.5">
          <span className="text-[36px] font-bold tracking-tight text-white tabular-nums">{usd(heroValue)}</span>
          {!scrub && <Delta value={empire.netWorthDayChange >= 0 ? 1 : -1} text={signedUsd(empire.netWorthDayChange)} />}
        </div>
        <p className="mt-1 text-[12px] text-white/40">{heroSub}</p>

        {chart && (
          <div className="mt-3">
            <NetWorthChart
              history={chart.history}
              projection={chart.projection}
              showProjection={chart.showProjection}
              onScrub={setScrub}
            />
          </div>
        )}

        {/* range + change chips */}
        <div className="mt-2 flex items-center justify-between">
          <div className="flex gap-1 rounded-full bg-white/[0.05] p-0.5">
            {(["1M", "3M", "1Y"] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cx(
                  "rounded-full px-3 py-1 text-[11px] font-bold transition",
                  range === r ? "bg-white text-black" : "text-white/50",
                )}
              >
                {r === "1Y" ? "1Y +" : r}
              </button>
            ))}
          </div>
          {intel && (
            <span className="text-[11.5px] text-white/45">
              {range === "1M" ? "30d " : range === "3M" ? `${intel.windowDays}d ` : "12mo "}
              <span className={cx("font-bold", (range === "1M" ? intel.change30d : range === "3M" ? intel.changeWindow : intel.projectedYear - empire.netWorth) >= 0 ? "text-up" : "text-down")}>
                {signedUsd(range === "1M" ? intel.change30d : range === "3M" ? intel.changeWindow : intel.projectedYear - empire.netWorth)}
              </span>
            </span>
          )}
        </div>
        {range === "1Y" && intel && (
          <p className="mt-2 text-[11.5px] leading-relaxed text-white/40">
            Projected on your trend + market drift: ~<span className="font-semibold text-white/70">{usd(intel.projectedYear)}</span> in 12 months. Shaded band is the likely range.
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
          {/* Helm Wealth Score */}
          {intel && <WealthScoreCard intel={intel} />}

          {/* Milestone trajectory */}
          {intel && intel.milestone.next > 0 && (
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Target size={16} className="text-brass" />
                <span className="text-[11px] font-bold uppercase tracking-wide text-brass">Trajectory</span>
              </div>
              <h3 className="mt-2 text-[16px] font-semibold leading-snug text-white">
                {intel.milestone.etaMonths != null ? (
                  <>
                    On track to cross {usdCompact(intel.milestone.next)} in{" "}
                    {intel.milestone.etaMonths === 1 ? "1 month" : `${intel.milestone.etaMonths} months`}
                  </>
                ) : (
                  <>Next milestone: {usdCompact(intel.milestone.next)}</>
                )}
              </h3>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brass to-brass"
                  style={{ width: `${Math.max(3, intel.milestone.progress * 100)}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-white/45 tabular-nums">
                <span>{usdCompact(intel.milestone.prev)}</span>
                <span className="font-semibold text-white/70">{pct(intel.milestone.progress, 0)} there</span>
                <span>
                  {usdCompact(intel.milestone.next)}
                  {intel.milestone.etaDate ? ` · ${shortDate(intel.milestone.etaDate)}` : ""}
                </span>
              </div>
            </Card>
          )}

          {/* What moved your net worth */}
          {intel && intel.attribution.some((a) => Math.abs(a.delta) >= 1) && (
            <section>
              <SectionTitle>What moved it · last 30 days</SectionTitle>
              <Card className="space-y-3 p-5">
                {(() => {
                  const maxAbs = Math.max(...intel.attribution.map((a) => Math.abs(a.delta)), 1);
                  return intel.attribution.map((a) => (
                    <div key={a.label}>
                      <div className="mb-1 flex items-center justify-between text-[12.5px]">
                        <span className="text-white/65">{a.label}</span>
                        <span className={cx("font-semibold tabular-nums", a.delta >= 0 ? "text-up" : "text-down")}>
                          {signedUsd(a.delta)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(Math.abs(a.delta) / maxAbs) * 100}%`, background: a.color }}
                        />
                      </div>
                    </div>
                  ));
                })()}
                <p className="pt-1 text-[11.5px] leading-relaxed text-white/40">
                  Net worth {intel.change30d >= 0 ? "grew" : "fell"}{" "}
                  <span className={cx("font-semibold", intel.change30d >= 0 ? "text-up" : "text-down")}>
                    {signedUsd(intel.change30d)}
                  </span>{" "}
                  this month — markets move daily, retained profit compounds quietly.
                </p>
              </Card>
            </section>
          )}

          {/* Composition */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-medium text-white/45">What your assets are made of</p>
              {intel && (
                <span className="text-[11px] font-semibold text-white/55">
                  {pct(intel.liquidNow / Math.max(1, totalAssets), 0)} liquid
                </span>
              )}
            </div>
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
          {best && market && upside > 0 && (
            <Card className="border-brass/20 bg-brass/[0.07] p-5">
              <div className="flex items-center gap-2">
                <Landmark size={16} className="text-brass" />
                <span className="text-[11px] font-bold uppercase tracking-wide text-brass">Capital move</span>
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
          )}

          {/* Cash flow + income streams */}
          <section>
            <SectionTitle
              right={
                <button onClick={onConnectCash} className="flex items-center gap-1 text-[12px] font-semibold text-brass">
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
                  <p className={cx("mt-1 text-[18px] font-bold tracking-tight tabular-nums", cashProj.monthlyNet >= 0 ? "text-up" : "text-down")}>
                    {signedUsd(cashProj.monthlyNet)}
                  </p>
                </div>
              </div>
              <div className="-mx-1 mt-3">
                <AreaTrend data={cashProj.points} color="#34c79a" height={90} />
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-white/45">
                Forecast on your current trend: ~<span className="font-semibold text-white/80">{usd(cashProj.monthlyNet)}/mo</span> net,
                banking to <span className="font-semibold text-white/80">{usd(cashProj.totalIn)}</span> by 6 months
                {extraMonthly !== 0 && <> (incl. {signedUsd(extraMonthly)}/mo you added)</>}.
              </p>

              {netWorth.income.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-3">
                  {netWorth.income.map((i) => (
                    <button key={i.id} onClick={() => openSheet("income", i)} className="flex w-full items-center justify-between text-left active:opacity-70">
                      <span className="flex items-center gap-1.5 text-[12.5px] text-white/60">
                        <Pencil size={11} className="text-white/30" /> {i.name}
                      </span>
                      <span className="text-[12.5px] font-semibold tabular-nums text-up">+{usd(i.monthly)}/mo</span>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => openSheet("income")}
                className="mt-3 flex items-center gap-1.5 text-[12px] font-semibold text-brass active:scale-95"
              >
                <Plus size={13} /> Add an income stream
              </button>
            </Card>
          </section>

          {/* Return on capital */}
          {ranked.length > 0 && (
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
          )}
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
                  name={b.shortName ?? b.name}
                  sub={`${b.type === "hotel" ? "Hotel" : "Business"} · ${pct(b.netMargin ?? 0, 0)} margin`}
                  value={b.capitalDeployed}
                  auto
                  onClick={() => onOpenBusiness(b.id)}
                />
              ))}
              {portfolio && (
                <ItemRow icon={TrendingUp} color="#e0ae49" name={portfolio.name} sub="Investments · live" value={empire.investments} auto onClick={() => onOpenBusiness(portfolio.id)} />
              )}
              <ItemRow icon={Wallet} color="#6e89a1" name="Idle cash" sub="Cash · checking" value={idleCash} auto onClick={onConnectCash} />
            </Card>
          </section>

          <section>
            <SectionTitle right={<span className="text-[12px] font-semibold text-up">{usd(empire.manualAssets)}</span>}>
              Added by you
            </SectionTitle>
            {netWorth.assets.length > 0 ? (
              <Card className="divide-y divide-white/[0.05]">
                {netWorth.assets.map((a) => (
                  <ItemRow
                    key={a.id}
                    icon={ASSET_ICON[a.kind]}
                    color="#34c79a"
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
          <SectionTitle right={<span className="text-[12px] font-semibold text-down">{usd(liabilities)}</span>}>
            What you owe
          </SectionTitle>
          {netWorth.liabilities.length > 0 ? (
            <Card className="divide-y divide-white/[0.05]">
              {netWorth.liabilities.map((l) => (
                <ItemRow
                  key={l.id}
                  icon={LIAB_ICON[l.kind]}
                  color="#e2685c"
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
              <span className="font-semibold tabular-nums text-up">{usd(totalAssets)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[13px]">
              <span className="text-white/55">Liabilities</span>
              <span className="font-semibold tabular-nums text-down">−{usd(liabilities)}</span>
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

function WealthScoreCard({ intel }: { intel: NonNullable<ReturnType<typeof buildNetWorthIntel>> }) {
  const { score, grade, factors } = intel.health;
  const col = scoreColor(score);
  const R = 30;
  const C = 2 * Math.PI * R;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Sparkles size={15} className="text-brass" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-brass">Helm wealth score</span>
      </div>
      <div className="mt-3 flex items-center gap-5">
        <div className="relative grid h-[88px] w-[88px] shrink-0 place-items-center">
          <svg width={88} height={88} className="-rotate-90">
            <circle cx={44} cy={44} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={7} />
            <circle
              cx={44}
              cy={44}
              r={R}
              fill="none"
              stroke={col}
              strokeWidth={7}
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - score / 100)}
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-[24px] font-bold leading-none tabular-nums text-white">{score}</span>
            <span className="text-[11px] font-bold" style={{ color: col }}>
              {grade}
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {factors.map((f) => {
            const Icon = FACTOR_ICON[f.key];
            return (
              <div key={f.key}>
                <div className="flex items-center gap-1.5">
                  <Icon size={12} className="text-white/45" />
                  <span className="text-[12px] text-white/65">{f.label}</span>
                  <span className="ml-auto text-[12px] font-bold tabular-nums" style={{ color: scoreColor(f.score) }}>
                    {f.score}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <div className="h-full rounded-full" style={{ width: `${f.score}%`, background: scoreColor(f.score) }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-3 border-t border-white/[0.06] pt-3 text-[11.5px] leading-relaxed text-white/45">
        {factors.find((f) => f.score === Math.min(...factors.map((x) => x.score)))!.detail}. A wealth advisor charges
        thousands a year for this read — Helm scores it every day.
      </p>
    </Card>
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
        <p className={cx("text-[14px] font-semibold tabular-nums", negative ? "text-down" : "text-white")}>
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
