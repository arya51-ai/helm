import { useEffect, useMemo, useState } from "react";
import {
  Home,
  PieChart,
  Store,
  Plus,
  ChevronLeft,
  Wifi,
  BatteryFull,
  SignalHigh,
  type LucideIcon,
} from "lucide-react";
import { BUSINESSES, EMPIRE } from "./data/businesses";
import { loadBusinesses, removeBusiness, type DataSource } from "./data/source";
import { plaidBalances } from "./lib/plaid";
import { toDisplayCurrency } from "./lib/currency";
import { updateFxRates } from "./lib/fxFeed";
import { usd } from "./lib/format";
import type { Business, Insight } from "./types";
import { metricsFor, empireSummary, type Metrics } from "./lib/analytics";
import { buildInsights } from "./lib/insights";
import { readNetWorth, manualAssetTotal, manualLiabilityTotal, type NetWorthStore } from "./data/networth";
import { generateBrief } from "./lib/agent";
import { useDailyRefresh } from "./lib/useDailyRefresh";
import { BriefScreen, InsightCard } from "./components/BriefScreen";
import { EmpireScreen } from "./components/EmpireScreen";
import { BusinessesScreen } from "./components/BusinessesScreen";
import { BusinessDetail } from "./components/BusinessDetail";
import { AddBusinessSheet } from "./components/AddBusinessSheet";
import { EconomicsEditor } from "./components/EconomicsEditor";
import { InvestmentsSheet } from "./components/InvestmentsSheet";
import { SettingsScreen } from "./components/SettingsScreen";
import { Splash } from "./components/Splash";
import { AskSheet } from "./components/AskSheet";
import { ActionSheet } from "./components/ActionSheet";
import { cx } from "./components/ui";

type Tab = "brief" | "empire" | "businesses" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("brief");
  const [openBiz, setOpenBiz] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [allInsights, setAllInsights] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Convert the synchronous initial render too, so the first frame's totals match
  // the async-loaded ones (Subway's CAD shown in USD) rather than flashing unconverted.
  const [businesses, setBusinesses] = useState<Business[]>(() => toDisplayCurrency(BUSINESSES));
  const [dataSource, setDataSource] = useState<DataSource>("mock");
  const [economicsBizId, setEconomicsBizId] = useState<string | null>(null);
  const [investOpen, setInvestOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [askOpen, setAskOpen] = useState(false);
  const [actionInsight, setActionInsight] = useState<Insight | null>(null);
  // Idle cash on hand — defaults to the sample figure, replaced by a real Plaid balance.
  const [idleCash, setIdleCash] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem("helm:cash:v1"));
      return v > 0 ? v : EMPIRE.idleCash;
    } catch {
      return EMPIRE.idleCash;
    }
  });

  useEffect(() => {
    let alive = true;
    loadBusinesses().then(({ businesses, source }) => {
      if (!alive) return;
      setBusinesses(businesses);
      setDataSource(source);
    });
    // Fetch live FX rates on app start; fails silently if unreachable
    updateFxRates();
    return () => {
      alive = false;
    };
  }, []);

  // Manual net-worth items (assets / liabilities / income Helm doesn't auto-track).
  const [netWorth, setNetWorth] = useState<NetWorthStore>(() => readNetWorth());
  const refreshNetWorth = () => setNetWorth(readNetWorth());

  const { metricsBy, empire, insights } = useMemo(() => {
    const metricsBy: Record<string, Metrics> = {};
    for (const b of businesses) metricsBy[b.id] = metricsFor(b);
    const empire = empireSummary(businesses, metricsBy, idleCash, {
      assets: manualAssetTotal(netWorth),
      liabilities: manualLiabilityTotal(netWorth),
    });
    const insights = buildInsights(businesses, metricsBy, { idleCash });
    return { metricsBy, empire, insights };
  }, [businesses, idleCash, netWorth]);

  // Claude-written morning read for the Brief. Null when no key is configured
  // (the rule-engine insight cards stand on their own). Refetches when the data
  // set meaningfully changes — not on every render.
  const [aiBrief, setAiBrief] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    generateBrief({ businesses, metricsBy, empire, insights, idleCash }).then((t) => {
      if (alive) setAiBrief(t);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empire.asOf, businesses.length, dataSource, idleCash]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  }

  // Re-run the full load pipeline (sample ← data.json ← imports ← overrides → currency).
  // Used after an economics override changes so ROIC / net worth reflect it.
  function reload() {
    loadBusinesses().then(({ businesses, source }) => {
      setBusinesses(businesses);
      setDataSource(source);
    });
  }

  // Roll data forward automatically at local midnight (and on focus after a date change),
  // so "today" advances without reopening the app.
  useDailyRefresh(reload);

  // Merge a single imported/synced business into state immediately (no flash).
  function mergeBusiness(b: Business) {
    setBusinesses((prev) => {
      const i = prev.findIndex((x) => x.id === b.id);
      if (i < 0) return [...prev, b];
      const next = [...prev];
      next[i] = { ...next[i], ...b };
      return next;
    });
    setDataSource("real");
  }

  // Pull real cash on hand from a linked bank via Plaid balances.
  async function connectCash() {
    const r = await plaidBalances();
    if (!r) {
      showToast("Bank connector not running — start npm run dev");
      return;
    }
    setIdleCash(r.cash);
    try {
      localStorage.setItem("helm:cash:v1", String(r.cash));
    } catch {
      /* ignore */
    }
    showToast(`Cash synced — ${usd(r.cash)}${r.demo ? " (demo)" : ""} ✓`);
  }

  const business = openBiz ? businesses.find((b) => b.id === openBiz) ?? null : null;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#06070b] text-white sm:py-4">
      {/* Ambient backdrop */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-600/20 blur-[110px]" />
        <div className="absolute top-40 -right-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-[110px]" />
      </div>

      {/* Phone column */}
      <div className="relative mx-auto flex h-full max-w-[440px] flex-col overflow-hidden bg-[#0a0b10]/80 backdrop-blur-xl sm:rounded-[2.4rem] sm:border sm:border-white/10 sm:shadow-2xl">
        <StatusBar />

        <main className="no-scrollbar flex-1 overflow-y-auto pb-28">
          {tab === "brief" && (
            <BriefScreen
              businesses={businesses}
              metricsBy={metricsBy}
              empire={empire}
              insights={insights}
              source={dataSource}
              aiBrief={aiBrief}
              onOpenBusiness={setOpenBiz}
              onToast={showToast}
              onSeeAll={() => setAllInsights(true)}
              onProfile={() => setTab("settings")}
              onAsk={() => setAskOpen(true)}
              onDraft={setActionInsight}
            />
          )}
          {tab === "empire" && (
            <EmpireScreen
              businesses={businesses}
              metricsBy={metricsBy}
              empire={empire}
              idleCash={idleCash}
              netWorth={netWorth}
              onOpenBusiness={setOpenBiz}
              onToast={showToast}
              onConnectCash={connectCash}
              onNetWorthChange={refreshNetWorth}
            />
          )}
          {tab === "businesses" && (
            <BusinessesScreen
              businesses={businesses}
              metricsBy={metricsBy}
              onOpenBusiness={setOpenBiz}
              onAdd={() => setAddOpen(true)}
            />
          )}
          {tab === "settings" && (
            <SettingsScreen
              owner={EMPIRE.owner}
              businesses={businesses}
              dataSource={dataSource}
              asOf={empire.asOf}
              onReload={reload}
              onToast={showToast}
            />
          )}
        </main>

        {/* Bottom nav */}
        <nav className="absolute inset-x-0 bottom-0 z-30 border-t border-white/[0.07] bg-[#0a0b10]/85 px-3 pb-6 pt-2.5 backdrop-blur-xl">
          <div className="flex items-center justify-around">
            <NavButton icon={Home} label="Brief" active={tab === "brief"} onClick={() => setTab("brief")} />
            <NavButton icon={PieChart} label="Net worth" active={tab === "empire"} onClick={() => setTab("empire")} />
            <button
              onClick={() => setAddOpen(true)}
              className="grid h-12 w-12 -translate-y-1 place-items-center rounded-2xl bg-white text-black shadow-lg shadow-violet-900/30 active:scale-90"
            >
              <Plus size={24} strokeWidth={2.6} />
            </button>
            <NavButton icon={Store} label="Businesses" active={tab === "businesses"} onClick={() => setTab("businesses")} />
            <button onClick={() => setTab("settings")} className="flex w-14 flex-col items-center gap-1 py-1">
              <span
                className={cx(
                  "grid h-[22px] w-[22px] place-items-center rounded-full text-[10px] font-bold text-white",
                  tab === "settings" && "ring-2 ring-white ring-offset-2 ring-offset-[#0a0b10]",
                )}
                style={{ background: "linear-gradient(135deg,#8b5cf6,#4f46e5)" }}
              >
                A
              </span>
              <span className={cx("text-[10px] font-medium", tab === "settings" ? "text-white" : "text-white/35")}>
                You
              </span>
            </button>
          </div>
        </nav>

        {/* Overlays */}
        {business && (
          <BusinessDetail
            business={business}
            metrics={metricsBy[business.id]}
            onClose={() => setOpenBiz(null)}
            onEdit={() => (business.type === "portfolio" ? setInvestOpen(true) : setEconomicsBizId(business.id))}
          />
        )}
        {addOpen && (
          <AddBusinessSheet
            businesses={businesses}
            onClose={() => setAddOpen(false)}
            onImported={mergeBusiness}
            onConnectInvestments={() => {
              setAddOpen(false);
              setInvestOpen(true);
            }}
            onToast={showToast}
          />
        )}
        {economicsBizId &&
          (() => {
            const b = businesses.find((x) => x.id === economicsBizId);
            return b && b.type !== "portfolio" ? (
              <EconomicsEditor
                business={b}
                metrics={metricsBy[b.id]}
                onClose={() => setEconomicsBizId(null)}
                onSaved={reload}
                onRemove={() => {
                  const label = b.shortName ?? b.name;
                  removeBusiness(b.id);
                  setEconomicsBizId(null);
                  setOpenBiz(null);
                  setBusinesses((prev) => prev.filter((x) => x.id !== b.id));
                  reload();
                  showToast(`${label} removed ✓`);
                }}
                onToast={showToast}
              />
            ) : null;
          })()}
        {investOpen && (
          <InvestmentsSheet
            existing={businesses.find((b) => b.type === "portfolio")}
            onClose={() => setInvestOpen(false)}
            onImported={mergeBusiness}
            onToast={showToast}
          />
        )}
        {askOpen && (
          <AskSheet
            ctx={{ businesses, metricsBy, empire, insights, idleCash }}
            onClose={() => setAskOpen(false)}
            onOpenBusiness={(id) => {
              setAskOpen(false);
              setOpenBiz(id);
            }}
          />
        )}
        {allInsights && (
          <AllInsights
            insights={insights}
            onClose={() => setAllInsights(false)}
            onToast={showToast}
            onOpenBusiness={(id) => {
              setAllInsights(false);
              setOpenBiz(id);
            }}
            onDraft={setActionInsight}
          />
        )}
        {actionInsight && (
          <ActionSheet
            insight={actionInsight}
            ctx={{ businesses, metricsBy, empire, insights, idleCash }}
            onClose={() => setActionInsight(null)}
            onToast={showToast}
          />
        )}

        {/* Toast */}
        {toast && (
          <div className="pointer-events-none absolute inset-x-0 bottom-28 z-[60] flex justify-center px-6">
            <div className="animate-fade-up rounded-full bg-white px-4 py-2.5 text-[13px] font-semibold text-black shadow-xl">
              {toast}
            </div>
          </div>
        )}

        {showSplash && <Splash onDone={() => setShowSplash(false)} />}
      </div>
    </div>
  );
}

function AllInsights({
  insights,
  onClose,
  onToast,
  onOpenBusiness,
  onDraft,
}: {
  insights: ReturnType<typeof buildInsights>;
  onClose: () => void;
  onToast: (m: string) => void;
  onOpenBusiness: (id: string) => void;
  onDraft: (insight: Insight) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 mx-auto flex max-w-[440px] flex-col bg-[#0a0b10]">
      <div className="flex items-center gap-3 px-4 pb-3 pt-5">
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] active:scale-90">
          <ChevronLeft size={20} className="text-white" />
        </button>
        <h1 className="text-[17px] font-bold text-white">Your brief · {insights.length}</h1>
      </div>
      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-4 pb-10">
        {insights.map((i) => (
          <InsightCard
            key={i.id}
            insight={i}
            onAction={onToast}
            onOpen={i.businessId ? () => onOpenBusiness(i.businessId!) : undefined}
            onDraft={i.action ? () => onDraft(i) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-6 pt-3 text-white">
      <span className="text-[14px] font-semibold tabular-nums">9:41</span>
      <div className="flex items-center gap-1.5">
        <SignalHigh size={15} />
        <Wifi size={15} />
        <BatteryFull size={18} />
      </div>
    </div>
  );
}

function NavButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex w-14 flex-col items-center gap-1 py-1">
      <Icon size={22} className={cx(active ? "text-white" : "text-white/35")} strokeWidth={active ? 2.4 : 2} />
      <span className={cx("text-[10px] font-medium", active ? "text-white" : "text-white/35")}>{label}</span>
    </button>
  );
}
