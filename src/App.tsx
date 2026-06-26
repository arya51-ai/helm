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
  Building2,
  BedDouble,
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
import { hotelPortfolioMetrics } from "./lib/hotelAnalytics";
import { buildHotelInsights } from "./lib/hotelInsights";
import { buildFuelInsights } from "./lib/fuelInsights";
import { buildUnitInsights, unitGroups, type UnitGroup } from "./lib/unitBenchmark";
import { readNetWorth, manualAssetTotal, manualLiabilityTotal, type NetWorthStore } from "./data/networth";
import { generateBrief } from "./lib/agent";
import { useDailyRefresh } from "./lib/useDailyRefresh";
import { BriefScreen, InsightCard } from "./components/BriefScreen";
import { PortfolioScreen } from "./components/PortfolioScreen";
import { EmpireScreen } from "./components/EmpireScreen";
import { BusinessesScreen } from "./components/BusinessesScreen";
import { BusinessDetail } from "./components/BusinessDetail";
import { HotelCommandCenter } from "./components/HotelCommandCenter";
import { HotelDetail } from "./components/HotelDetail";
import { MotelDetail } from "./components/MotelDetail";
import { FuelDetail } from "./components/FuelDetail";
import { CompareUnits } from "./components/CompareUnits";
import { AddBusinessSheet } from "./components/AddBusinessSheet";
import { EconomicsEditor } from "./components/EconomicsEditor";
import { InvestmentsSheet } from "./components/InvestmentsSheet";
import { SettingsScreen } from "./components/SettingsScreen";
import { Splash } from "./components/Splash";
import { AskSheet } from "./components/AskSheet";
import { ActionSheet } from "./components/ActionSheet";
import { cx } from "./components/ui";
import { HelmMark } from "./components/Brand";
import { readProfileId } from "./data/profiles";

type Tab = "brief" | "empire" | "stocks" | "businesses" | "hotels" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("brief");
  const [openBiz, setOpenBiz] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [allInsights, setAllInsights] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Convert the synchronous initial render too, so the first frame's totals match
  // the async-loaded ones (Subway's CAD shown in USD) rather than flashing unconverted.
  // The "blank slate" demo persona starts with zero businesses — the owner uploads their own
  // (LiveIQ, Retailz, …) and those become the only businesses shown. Every other persona seeds
  // samples. Initializing empty here (not after load) avoids a sample→blank flash on open.
  const [businesses, setBusinesses] = useState<Business[]>(() =>
    readProfileId() === "blank" ? [] : toDisplayCurrency(BUSINESSES),
  );
  const [dataSource, setDataSource] = useState<DataSource>("mock");
  const [economicsBizId, setEconomicsBizId] = useState<string | null>(null);
  const [investOpen, setInvestOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [askOpen, setAskOpen] = useState(false);
  const [actionInsight, setActionInsight] = useState<Insight | null>(null);
  const [openHotel, setOpenHotel] = useState<string | null>(null);

  // Hotels are first-class businesses (type: "hotel"). The hospitality command center
  // only exists when at least one is present — so a Subway-and-smoke-shop owner never
  // sees it, and it lights up the moment a property is added.
  const hotels = useMemo(() => businesses.filter((b) => b.type === "hotel"), [businesses]);
  const hasHotels = hotels.length > 0;
  const hotelPortfolio = useMemo(() => hotelPortfolioMetrics(hotels), [hotels]);
  const hotelInsights = useMemo(() => buildHotelInsights(hotels), [hotels]);
  // A single independent motel (Sam) gets its own owner-operator view — it opens straight into
  // MotelDetail and skips the chain "command center", which is built for multi-property portfolios.
  const soloMotel = hotels.length === 1 && hotels[0].independent ? hotels[0] : null;
  // Persona owner — greet whoever's holding it by name (a hotel persona carries its owner's name).
  const ownerName = useMemo(() => businesses.find((b) => b.ownerName)?.ownerName ?? EMPIRE.owner, [businesses]);

  // Fuel stations are first-class businesses (type: "fuel") with their own COO read
  // (gallons, CPG, c-store attach). They live in the normal Businesses flow with a
  // fuel-aware deep dive — no separate tab needed for a 3-station operator.
  const stations = useMemo(() => businesses.filter((b) => b.type === "fuel"), [businesses]);
  const fuelInsights = useMemo(() => buildFuelInsights(stations), [stations]);

  // Idle cash on hand — defaults to the sample figure, replaced by a real Plaid balance.
  const [idleCash, setIdleCash] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem("helm:cash:v1"));
      if (v > 0) return v;
      // Blank demo starts with no connected cash, so net worth reflects only what's uploaded.
      return readProfileId() === "blank" ? 0 : EMPIRE.idleCash;
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
    // Generic rule-engine insights cover plain shops; hotels and fuel get their own
    // vertical engines; same-brand units get head-to-head benchmarking. All merge into
    // one ranked brief.
    const opsInsights = buildInsights(
      businesses.filter((b) => b.type !== "hotel" && b.type !== "fuel"),
      metricsBy,
      { idleCash },
    );
    const unitInsights = buildUnitInsights(businesses, metricsBy);
    const insights = [...opsInsights, ...hotelInsights, ...fuelInsights, ...unitInsights].sort(
      (a, b) => b.priority - a.priority,
    );
    return { metricsBy, empire, insights };
  }, [businesses, idleCash, netWorth, hotelInsights, fuelInsights]);

  // Same-brand peer groups (Dev's Subways) for the head-to-head compare overlay.
  const unitGroupsList = useMemo(() => unitGroups(businesses, metricsBy), [businesses, metricsBy]);
  const [compareGroup, setCompareGroup] = useState<UnitGroup | null>(null);
  function openCompareFor(insight: Insight) {
    const g = unitGroupsList.find(
      (grp) => insight.id === `unit-compare-${grp.brand.toLowerCase().replace(/\s+/g, "-")}`,
    );
    if (g) setCompareGroup(g);
  }

  // Claude-written morning read for the Brief. Null when no key is configured
  // (the rule-engine insight cards stand on their own). Refetches when the data
  // set meaningfully changes — not on every render.
  const [aiBrief, setAiBrief] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    // Nothing to brief on a blank slate — skip the call until a business is added.
    if (businesses.length === 0) {
      setAiBrief(null);
      return;
    }
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

  // If the active persona has no hotels (or the last one was removed), never strand the
  // user on a now-hidden hospitality tab.
  useEffect(() => {
    if (tab === "hotels" && !hasHotels) setTab("brief");
  }, [tab, hasHotels]);

  // Merge a single imported/synced business into state immediately (no flash). Convert to the
  // display currency first — uploads arrive in their native currency (a CAD Subway), while the rest
  // of state is already USD, so an unconverted insert would skew the empire totals until the next load.
  function mergeBusiness(b: Business) {
    const converted = toDisplayCurrency([b])[0];
    setBusinesses((prev) => {
      const i = prev.findIndex((x) => x.id === converted.id);
      if (i < 0) return [...prev, converted];
      const next = [...prev];
      next[i] = { ...next[i], ...converted };
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

  // Investments open the dedicated portfolio screen (positions, risk, factor scores,
  // projection, live prices) — every other business type opens the generic detail overlay.
  function openBusiness(id: string) {
    const b = businesses.find((x) => x.id === id);
    if (b?.type === "portfolio") {
      setTab("stocks");
      return;
    }
    setOpenBiz(id);
  }

  const business = openBiz ? businesses.find((b) => b.id === openBiz) ?? null : null;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#071e33] text-white sm:py-4">
      {/* Ambient backdrop */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-brass/[0.10] blur-[120px]" />
      </div>

      {/* Phone column */}
      <div className="relative mx-auto flex h-full max-w-[440px] flex-col overflow-hidden bg-[#0a263e]/80 backdrop-blur-xl sm:rounded-[2.4rem] sm:border sm:border-white/10 sm:shadow-2xl">
        <StatusBar />

        <main className="no-scrollbar flex-1 overflow-y-auto pb-28">
          {businesses.length === 0 && tab !== "settings" ? (
            <FirstRun onAdd={() => setAddOpen(true)} />
          ) : (
          <>
          {tab === "brief" && (
            <BriefScreen
              businesses={businesses}
              metricsBy={metricsBy}
              empire={empire}
              insights={insights}
              source={dataSource}
              aiBrief={aiBrief}
              owner={ownerName}
              onOpenBusiness={openBusiness}
              onToast={showToast}
              onSeeAll={() => setAllInsights(true)}
              onProfile={() => setTab("settings")}
              onAsk={() => setAskOpen(true)}
              onDraft={setActionInsight}
              onOpenHotels={() => (soloMotel ? setOpenHotel(soloMotel.id) : setTab("hotels"))}
              onOpenHotel={(id) => setOpenHotel(id)}
              onOpenCompare={openCompareFor}
            />
          )}
          {tab === "empire" && (
            <EmpireScreen
              businesses={businesses}
              metricsBy={metricsBy}
              empire={empire}
              idleCash={idleCash}
              netWorth={netWorth}
              onOpenBusiness={openBusiness}
              onToast={showToast}
              onConnectCash={connectCash}
              onNetWorthChange={refreshNetWorth}
            />
          )}
          {tab === "businesses" && (
            <BusinessesScreen
              businesses={businesses.filter((b) => b.type !== "hotel")}
              metricsBy={metricsBy}
              onOpenBusiness={openBusiness}
              onAdd={() => setAddOpen(true)}
            />
          )}
          {tab === "hotels" && (
            <HotelCommandCenter
              hotels={hotels}
              portfolio={hotelPortfolio}
              insights={hotelInsights}
              onOpenHotel={(id) => setOpenHotel(id)}
              onToast={showToast}
              onDraft={setActionInsight}
            />
          )}
          {tab === "stocks" && (
            <PortfolioScreen onToast={showToast} />
          )}
          {tab === "settings" && (
            <SettingsScreen
              owner={ownerName}
              businesses={businesses}
              dataSource={dataSource}
              asOf={empire.asOf}
              onReload={reload}
              onToast={showToast}
            />
          )}
          </>
          )}
        </main>

        {/* Bottom nav */}
        <nav className="absolute inset-x-0 bottom-0 z-30 border-t border-white/[0.07] bg-[#0a263e]/85 px-3 pb-6 pt-2.5 backdrop-blur-xl">
          {/* Two equal-width (flex-1) clusters flank the centered + FAB, so the button
              stays dead-center whether or not the adaptive Hotels tab is present. The
              clusters absorb the odd tab — never the +. */}
          <div className="flex items-center">
            <div className="flex flex-1 items-center justify-around gap-1">
              <NavButton icon={Home} label="Brief" active={tab === "brief"} onClick={() => setTab("brief")} />
              {soloMotel ? (
                <NavButton icon={BedDouble} label="Motel" active={openHotel === soloMotel.id} onClick={() => setOpenHotel(soloMotel.id)} />
              ) : hasHotels ? (
                <NavButton icon={Building2} label="Hotels" active={tab === "hotels"} onClick={() => setTab("hotels")} />
              ) : (
                <NavButton icon={Store} label="Businesses" active={tab === "businesses"} onClick={() => setTab("businesses")} />
              )}
            </div>
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Add business"
              className="mx-1.5 grid h-12 w-12 shrink-0 -translate-y-1 place-items-center rounded-2xl bg-brass text-[#071e33] shadow-lg shadow-brass/30 active:scale-90"
            >
              <Plus size={24} strokeWidth={2.6} />
            </button>
            <div className="flex flex-1 items-center justify-around gap-1">
              {hasHotels && !soloMotel && (
                <NavButton icon={Store} label="Businesses" active={tab === "businesses"} onClick={() => setTab("businesses")} />
              )}
              <NavButton icon={PieChart} label="Net worth" active={tab === "empire"} onClick={() => setTab("empire")} />
              <button onClick={() => setTab("settings")} className="flex flex-col items-center gap-1 py-1">
                <span
                  className={cx(
                    "grid h-[22px] w-[22px] place-items-center rounded-full text-[10px] font-bold text-white",
                    tab === "settings" && "ring-2 ring-white ring-offset-2 ring-offset-[#0a263e]",
                  )}
                  style={{ background: "linear-gradient(135deg,#e0ae49,#0a263e)" }}
                >
                  {ownerName[0]}
                </span>
                <span className={cx("text-[10px] font-medium", tab === "settings" ? "text-white" : "text-white/35")}>
                  You
                </span>
              </button>
            </div>
          </div>
        </nav>

        {/* Overlays */}
        {openHotel && (() => {
          const h = hotels.find((x) => x.id === openHotel);
          if (!h) return null;
          // Independent motels get the owner-operator view (occupancy / rate / channels / OTA fees);
          // flagged chain properties get the RevPAR-Index / GOP / PIP command view.
          return h.independent ? (
            <MotelDetail business={h} onClose={() => setOpenHotel(null)} onSynced={mergeBusiness} onReset={reload} />
          ) : (
            <HotelDetail business={h} onClose={() => setOpenHotel(null)} />
          );
        })()}
        {compareGroup && <CompareUnits group={compareGroup} onClose={() => setCompareGroup(null)} />}
        {business && business.type === "fuel" && (
          <FuelDetail business={business} onClose={() => setOpenBiz(null)} />
        )}
        {business && business.type !== "fuel" && (
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
            onActivateHospitality={() => setTab("hotels")}
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
              openBusiness(id);
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
              openBusiness(id);
            }}
            onDraft={setActionInsight}
            onOpenCompare={(i) => {
              setAllInsights(false);
              openCompareFor(i);
            }}
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
  onOpenCompare,
}: {
  insights: ReturnType<typeof buildInsights>;
  onClose: () => void;
  onToast: (m: string) => void;
  onOpenBusiness: (id: string) => void;
  onDraft: (insight: Insight) => void;
  onOpenCompare: (insight: Insight) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 mx-auto flex max-w-[440px] flex-col bg-[#0a263e]">
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
            onDraft={i.action ? () => (i.id.startsWith("unit-compare") ? onOpenCompare(i) : onDraft(i)) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function FirstRun({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-8 pb-28 pt-10 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-3xl bg-brass/15">
        <HelmMark size={34} className="text-brass" />
      </div>
      <h1 className="mt-6 text-[24px] font-bold tracking-tight text-white">Welcome to Helm</h1>
      <p className="mt-2 max-w-[20rem] text-[14px] leading-relaxed text-white/55">
        Your AI COO for every business you run. Bring in your numbers and Helm reads them like an
        operator — one screen, on your phone.
      </p>
      <button
        onClick={onAdd}
        className="mt-7 flex items-center gap-2 rounded-full bg-brass px-6 py-3.5 text-[15px] font-bold text-[#071e33] shadow-lg shadow-brass/30 active:scale-[0.98]"
      >
        <Plus size={20} strokeWidth={2.6} /> Add your first business
      </button>
      <div className="mt-6 space-y-1 text-[12px] text-white/40">
        <p>Upload a sales export from your POS</p>
        <p className="text-white/60">LiveIQ · Retailz · Square · Clover · or any CSV</p>
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
      <Icon size={22} className={cx(active ? "text-brass" : "text-white/35")} strokeWidth={active ? 2.4 : 2} />
      <span className={cx("text-[10px] font-medium", active ? "text-brass" : "text-white/35")}>{label}</span>
    </button>
  );
}
