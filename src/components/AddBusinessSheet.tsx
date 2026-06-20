import { useEffect, useRef, useState } from "react";
import {
  Camera,
  FileSpreadsheet,
  Link2,
  Check,
  Loader2,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Upload,
  TrendingUp,
  BookText,
  BedDouble,
  Star,
  MapPin,
  Fuel,
  Mail,
} from "lucide-react";
import type { Business, BusinessType, Currency, DayPoint } from "../types";
import { parseSalesFile, remap, slugId, type ParsedImport } from "../lib/import";
import { DataHealth } from "./DataHealth";
import { tallySync, tallyToBusiness, type TallyResult } from "../lib/tally";
import { buildSampleHotels } from "../data/hotels";
import { parseHotelFile, buildHotelFromImport, manualHotel, type ParsedHotelImport } from "../lib/hotelImport";
import { parseFuelFile, buildStationFromImport, manualFuel, type ParsedFuelImport } from "../lib/fuelImport";
import { toUSD } from "../lib/currency";
import { upsertImported } from "../data/source";
import { usd, usdCompact, money, shortDate, pct } from "../lib/format";
import { cx } from "./ui";

type View =
  | "home"
  | "connect"
  | "connecting"
  | "connectBeta"
  | "importing"
  | "review"
  | "capture"
  | "scanning"
  | "snapReview"
  | "tally"
  | "hotel"
  | "fuel"
  | "done";

interface Provider {
  id: string;
  label: string;
  url: string;
  accent: string;
  sub: string;
  targetId: string;
}
const PROVIDERS: Record<string, Provider> = {
  liveiq: {
    id: "liveiq",
    label: "Subway Live IQ",
    url: "liveiq.subway.com",
    accent: "#34c79a",
    sub: "Net sales, customer count, daily close",
    targetId: "subway-espanola",
  },
  retailz: {
    id: "retailz",
    label: "Retailz POS",
    url: "retailzpos.com",
    accent: "#e0ae49",
    sub: "Sales summary by date",
    targetId: "riverside-columbus",
  },
};

const NEW_COLORS = ["#34c79a", "#e0ae49", "#e0ae49", "#6fa8dc", "#e0ae49", "#e0ae49"];

// ── Real Claude-vision extraction (POST /api/agent/vision) ──────────────────────────
// The endpoint is unreachable on a static deploy / without an API key — it answers
// { available:false } and the UI degrades honestly to upload/manual. Any field not
// clearly visible comes back null; we NEVER fabricate.
// Internal discriminated union — `kind:"unavailable"` is the UI's normalized form of the
// endpoint's `{ available:false }` (and of any network/parse error), so every branch narrows
// cleanly on `kind`.
type VisionResult =
  | { kind: "unavailable" }
  | { kind: "hotel"; adr: number | null; occupancy: number | null; revpar: number | null; asOf: string | null }
  | { kind: "sales"; date: string | null; grossSales: number | null; netSales: number | null; transactions: number | null };

function isoToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Read a File into raw base64 (no "data:" prefix) + its media type. */
function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that image."));
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      resolve({ base64, mediaType: file.type || "image/jpeg" });
    };
    reader.readAsDataURL(file);
  });
}

async function extractFromImage(file: File, businessType: string): Promise<VisionResult> {
  const { base64, mediaType } = await fileToBase64(file);
  const resp = await fetch("/api/agent/vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: base64, mediaType, businessType }),
  });
  if (!resp.ok) return { kind: "unavailable" };
  const data = (await resp.json()) as
    | { available?: boolean; kind?: string }
    | null;
  if (!data || data.available === false || (data.kind !== "hotel" && data.kind !== "sales")) {
    return { kind: "unavailable" };
  }
  return data as VisionResult;
}

export function AddBusinessSheet({
  businesses,
  onClose,
  onImported,
  onConnectInvestments,
  onToast,
  onActivateHospitality,
}: {
  businesses: Business[];
  onClose: () => void;
  onImported: (b: Business) => void;
  onConnectInvestments: () => void;
  onToast: (m: string) => void;
  /** Fired after a property is added, so the app can reveal the hospitality command center. */
  onActivateHospitality?: () => void;
}) {
  const [view, setView] = useState<View>("home");
  const [provider, setProvider] = useState<Provider | null>(null);

  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [targetId, setTargetId] = useState<string>("new");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<BusinessType>("retail");
  const [newCurrency, setNewCurrency] = useState<Currency>("USD");
  const [savedName, setSavedName] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const snapRef = useRef<HTMLInputElement>(null);
  const pendingTarget = useRef<string>("new");

  // ── Snap-a-report extraction state ────────────────────────────────────────────
  const [snap, setSnap] = useState<VisionResult | null>(null);
  // Editable copies of the extracted values (owner confirms/fixes before commit).
  const [snapName, setSnapName] = useState("");
  const [snapType, setSnapType] = useState<BusinessType>("restaurant");
  const [snapGross, setSnapGross] = useState("");
  const [snapNet, setSnapNet] = useState("");
  const [snapTxns, setSnapTxns] = useState("");
  const [snapRooms, setSnapRooms] = useState("");
  const [snapAdr, setSnapAdr] = useState("");
  const [snapOcc, setSnapOcc] = useState("");
  const [snapError, setSnapError] = useState("");

  useEffect(() => {
    if (view === "connecting") {
      const t = setTimeout(() => setView("connectBeta"), 1500);
      return () => clearTimeout(t);
    }
  }, [view]);

  function openFilePicker(defaultTarget: string) {
    pendingTarget.current = defaultTarget;
    fileRef.current?.click();
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setView("importing");
    try {
      const result = await parseSalesFile(file);
      setParsed(result);
      const guess =
        pendingTarget.current !== "new" && businesses.some((b) => b.id === pendingTarget.current)
          ? pendingTarget.current
          : "new";
      setTargetId(guess);
      setNewName(file.name.replace(/\.(csv|xlsx|xls)$/i, "").replace(/[_-]+/g, " "));
      setView("review");
    } catch (e) {
      onToast((e as Error).message || "Couldn't read that file.");
      setView("home");
    }
  }

  function commitImport() {
    if (!parsed) return;
    let biz: Business;
    if (targetId !== "new") {
      const existing = businesses.find((b) => b.id === targetId)!;
      biz = { ...existing, series: parsed.series };
    } else {
      const name = newName.trim() || "New business";
      biz = {
        id: slugId(name),
        name,
        shortName: name.split(/\s+/)[0],
        type: newType,
        location: "",
        category: newType === "restaurant" ? "Restaurant" : "Retail",
        accent: NEW_COLORS[businesses.length % NEW_COLORS.length],
        series: parsed.series as DayPoint[],
        capitalDeployed: 120000,
        netMargin: newType === "restaurant" ? 0.09 : 0.1,
        currency: newCurrency,
      };
    }
    upsertImported(biz);
    setSavedName(biz.name);
    onImported(biz);
    setView("done");
  }

  // ── Snap a report → real Claude-vision extraction ──────────────────────────────
  async function handleSnap(file: File | undefined) {
    if (!file) return;
    setSnapError("");
    setView("scanning");
    try {
      const result = await extractFromImage(file, "");
      if (result.kind === "unavailable") {
        // No live brain (static deploy / no key / error) — degrade honestly.
        setSnapError(
          "Photo reading needs the live brain — upload a file or enter the numbers instead.",
        );
        setView("capture");
        return;
      }
      setSnap(result);
      if (result.kind === "hotel") {
        setSnapType("hotel");
        setSnapName(file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
        setSnapAdr(result.adr != null ? String(result.adr) : "");
        setSnapOcc(result.occupancy != null ? String(Math.round(result.occupancy * 100)) : "");
        setSnapRooms("");
      } else {
        setSnapType("restaurant");
        setSnapName(file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
        setSnapGross(result.grossSales != null ? String(result.grossSales) : "");
        setSnapNet(result.netSales != null ? String(result.netSales) : "");
        setSnapTxns(result.transactions != null ? String(result.transactions) : "");
      }
      setView("snapReview");
    } catch {
      setSnapError(
        "Photo reading needs the live brain — upload a file or enter the numbers instead.",
      );
      setView("capture");
    }
  }

  // Commit the (edited) snap extraction through the existing build pipelines.
  function commitSnap() {
    if (!snap || snap.kind === "unavailable") return;
    const name = snapName.trim() || "New business";
    if (snapType === "hotel") {
      const adr = parseFloat(snapAdr);
      const occ = parseFloat(snapOcc);
      const rooms = Math.max(0, Math.round(parseFloat(snapRooms) || 0));
      if (!(adr > 0) || !(occ > 0) || !rooms) {
        setSnapError("Add rooms, ADR and occupancy to continue.");
        return;
      }
      const biz = manualHotel({ name, rooms, adr, occupancy: occ });
      upsertImported(biz);
      onImported(biz);
      onToast(`${biz.shortName ?? biz.name} added — hospitality is on ✓`);
      onActivateHospitality?.();
      onClose();
      return;
    }
    // Sales close → one-day series anchored to the photographed numbers.
    const gross = parseFloat(snapGross);
    const net = parseFloat(snapNet);
    const txns = Math.max(0, Math.round(parseFloat(snapTxns) || 0));
    const revenue = net > 0 ? net : gross;
    if (!(revenue > 0)) {
      setSnapError("Add a sales figure to continue.");
      return;
    }
    const asOf = snap.kind === "sales" && snap.date ? snap.date : isoToday();
    const biz: Business = {
      id: slugId(name),
      name,
      shortName: name.split(/\s+/)[0],
      type: snapType,
      location: "",
      category: snapType === "restaurant" ? "Restaurant" : "Retail",
      accent: NEW_COLORS[businesses.length % NEW_COLORS.length],
      series: [{ date: asOf, revenue, transactions: txns }],
      capitalDeployed: 120000,
      netMargin: snapType === "restaurant" ? 0.09 : 0.1,
      currency: "USD",
    };
    upsertImported(biz);
    onImported(biz);
    onToast(`${biz.shortName ?? biz.name} added ✓`);
    onClose();
  }

  const targetBusiness = businesses.find((b) => b.id === targetId);

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[440px] flex-col justify-end">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={snapRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleSnap(e.target.files?.[0]);
          e.target.value = ""; // allow re-picking the same photo
        }}
      />
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-sheet-up relative max-h-[90%] overflow-y-auto rounded-t-[2rem] border-t border-white/10 bg-[#0e3052] px-5 pb-9 pt-3">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/15" />

        {/* ── HOME ───────────────────────────────────────────────── */}
        {view === "home" && (
          <>
            <h2 className="text-[19px] font-bold tracking-tight text-white">Add a business</h2>
            <p className="mt-1 text-[13px] text-white/50">
              Connect your POS, or drop in a sales export. No spreadsheets to build.
            </p>
            <div className="mt-5 space-y-2.5">
              <ConnectRow
                provider={PROVIDERS.liveiq}
                onClick={() => {
                  setProvider(PROVIDERS.liveiq);
                  setView("connect");
                }}
              />
              <ConnectRow
                provider={PROVIDERS.retailz}
                onClick={() => {
                  setProvider(PROVIDERS.retailz);
                  setView("connect");
                }}
              />
              <OptionRow
                icon={BookText}
                title="Connect TallyPrime"
                sub="India · daily sales from Tally (₹)"
                onClick={() => setView("tally")}
              />
              <OptionRow
                icon={BedDouble}
                title="Add a hotel / property"
                sub="Marriott, Hilton, IHG · PMS or STR report"
                onClick={() => setView("hotel")}
              />
              <OptionRow
                icon={Fuel}
                title="Add a gas station"
                sub="Gilbarco Passport, back-office export"
                onClick={() => setView("fuel")}
              />
              <OptionRow
                icon={TrendingUp}
                title="Connect investments"
                sub="Yahoo Finance, Robinhood, Fidelity"
                onClick={onConnectInvestments}
              />
              <OptionRow
                icon={FileSpreadsheet}
                title="Upload a sales report"
                sub="CSV or Excel from any POS"
                onClick={() => openFilePicker("new")}
              />
              <OptionRow
                icon={Camera}
                title="Snap a daily close"
                sub="Photograph your register Z-report or folio"
                onClick={() => {
                  setSnap(null);
                  setSnapError("");
                  setView("capture");
                }}
              />
            </div>
          </>
        )}

        {/* ── TALLY (TallyPrime) ─────────────────────────────────── */}
        {view === "tally" && (
          <TallyConnectView
            onBack={() => setView("home")}
            onImported={onImported}
            onToast={onToast}
            onClose={onClose}
            onUpload={() => openFilePicker("new")}
          />
        )}

        {/* ── HOTEL / PROPERTY ───────────────────────────────────── */}
        {view === "hotel" && (
          <HotelConnectView
            businesses={businesses}
            onBack={() => setView("home")}
            onAdd={(b) => {
              upsertImported(b);
              onImported(b);
              onToast(`${b.shortName ?? b.name} added — hospitality is on ✓`);
              onActivateHospitality?.();
              onClose();
            }}
          />
        )}

        {/* ── GAS STATION ────────────────────────────────────────── */}
        {view === "fuel" && (
          <FuelConnectView
            onBack={() => setView("home")}
            onAdd={(b) => {
              upsertImported(b);
              onImported(b);
              onToast(`${b.shortName ?? b.name} added ✓`);
              onClose();
            }}
          />
        )}

        {/* ── CONNECT — no credentials; bring the report you already have ── */}
        {view === "connect" && provider && (
          <>
            <BackBar onBack={() => setView("home")} />
            <div
              className="mt-1 grid h-12 w-12 place-items-center rounded-2xl"
              style={{ background: `${provider.accent}22`, color: provider.accent }}
            >
              <Link2 size={22} />
            </div>
            <h2 className="mt-3 text-[19px] font-bold tracking-tight text-white">Bring in {provider.label}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-white/55">
              No passwords, no account access. Helm reads the sales report you already have — two ways, both
              take seconds.
            </p>

            <div className="mt-5 space-y-2.5">
              <button
                onClick={() => openFilePicker(provider.targetId)}
                className="flex w-full items-center gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-left transition active:scale-[0.99]"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brass/15 text-brass">
                  <Upload size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-[14.5px] font-semibold text-white">Upload an export</p>
                  <p className="text-[12px] text-white/45">In {provider.label}: Reports → export → drop it here</p>
                </div>
                <ChevronRight size={18} className="text-white/25" />
              </button>
              <button
                onClick={() => {
                  onToast("We'll set up your Helm reports inbox ✓");
                  onClose();
                }}
                className="flex w-full items-center gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-left transition active:scale-[0.99]"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-info/15 text-info">
                  <Mail size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-[14.5px] font-semibold text-white">Forward your report email</p>
                  <p className="text-[12px] text-white/45">Auto-forward your daily summary — set up once</p>
                </div>
                <ChevronRight size={18} className="text-white/25" />
              </button>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-white/40" />
              <p className="text-[12px] leading-relaxed text-white/45">
                Helm never asks for your {provider.label} login. Your numbers stay in your hands — one-click sync
                is coming, but you never have to wait on it.
              </p>
            </div>
            <p className="mt-3 text-center text-[11px] text-white/30">Direct sync to {provider.label} is in private beta.</p>
          </>
        )}

        {view === "connecting" && provider && (
          <Spinner title={`Connecting to ${provider.label}…`} sub="Establishing a secure session" />
        )}

        {/* Honest beta fallback → upload */}
        {view === "connectBeta" && provider && (
          <>
            <BackBar onBack={() => setView("connect")} />
            <div className="mt-1 grid h-12 w-12 place-items-center rounded-2xl bg-brass/12 text-brass">
              <ShieldCheck size={22} />
            </div>
            <h2 className="mt-3 text-[19px] font-bold tracking-tight text-white">
              Auto-connect is in private beta
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">
              We didn't store your login. While direct sync to {provider.label} rolls out, you can go
              live right now: in {provider.label}, open <b className="text-white/75">Reports → export</b>{" "}
              (CSV/Excel) and drop it here.
            </p>
            <button
              onClick={() => openFilePicker(provider.targetId)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
            >
              <Upload size={17} strokeWidth={2.4} /> Upload {provider.label} export
            </button>
            <button
              onClick={() => {
                onToast(`You're on the ${provider.label} early-access list ✓`);
                onClose();
              }}
              className="mt-2 w-full py-2 text-[13px] font-medium text-white/45"
            >
              Notify me when direct sync is ready
            </button>
          </>
        )}

        {view === "importing" && <Spinner title="Reading your report…" sub="Detecting dates, sales, and transactions" />}

        {/* ── IMPORT REVIEW ──────────────────────────────────────── */}
        {view === "review" && parsed && (
          <>
            <BackBar onBack={() => setView("home")} />
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-brass" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-brass">Parsed</span>
            </div>
            <h2 className="mt-2 text-[19px] font-bold tracking-tight text-white">
              {parsed.series.length} days of sales found
            </h2>
            <p className="mt-1 text-[13px] text-white/50">
              {shortDate(parsed.series[0].date)} → {shortDate(parsed.series.at(-1)!.date)} · mapped{" "}
              <b className="text-white/70">{parsed.detected.revenue}</b> → revenue
              {parsed.detected.transactions ? (
                <>
                  , <b className="text-white/70">{parsed.detected.transactions}</b> → transactions
                </>
              ) : null}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <Stat big={usdCompact(parsed.totalRevenue)} label="Total sales" />
              <Stat big={parsed.totalTransactions.toLocaleString()} label="Transactions" />
              <Stat big={usd(parsed.totalRevenue / Math.max(1, parsed.series.length))} label="Avg/day" />
            </div>

            {/* Confirm / fix the column mapping — auto-detection isn't always right. */}
            <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">
                Columns Helm used — fix if wrong
              </p>
              <div className="space-y-2">
                {([["Date", "date"], ["Sales", "revenue"], ["Transactions", "transactions"]] as const).map(
                  ([lbl, key]) => (
                    <label key={key} className="flex items-center justify-between gap-3">
                      <span className="text-[13px] text-white/60">{lbl}</span>
                      <select
                        value={parsed.detectedIdx[key]}
                        onChange={(e) =>
                          setParsed(remap(parsed, { ...parsed.detectedIdx, [key]: Number(e.target.value) }))
                        }
                        className="max-w-[58%] min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-[#0a263e] px-2.5 py-1.5 text-[13px] font-medium text-white outline-none focus:border-brass/40"
                      >
                        {key === "transactions" && <option value={-1}>None</option>}
                        {parsed.headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h || `Column ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  ),
                )}
              </div>
              {parsed.revenueLooksGross && (
                <p className="mt-2 text-[11px] font-medium text-brass">
                  Heads-up: that looks like a gross column. If there's a net-sales column, pick it above.
                </p>
              )}
            </div>

            {/* Trust layer: coverage, gaps, freshness, and a cross-check against the POS's own total. */}
            <div className="mt-3">
              <DataHealth series={parsed.series} />
            </div>

            <p className="mb-2 mt-5 px-1 text-[12px] font-medium text-white/45">Add to</p>
            <div className="space-y-2">
              {businesses.map((b) => (
                <PickRow
                  key={b.id}
                  label={b.name}
                  sub={`Replace ${b.name}'s data`}
                  color={b.accent}
                  active={targetId === b.id}
                  onClick={() => setTargetId(b.id)}
                />
              ))}
              <PickRow
                label="New business"
                sub="Add as a brand-new business"
                color="#6e89a1"
                active={targetId === "new"}
                onClick={() => setTargetId("new")}
              />
            </div>

            {targetId === "new" && (
              <div className="mt-3 space-y-2.5">
                <Field label="Business name" value={newName} onChange={setNewName} placeholder="e.g. Sunrise Coffee" />
                <div className="flex gap-2">
                  {(["retail", "restaurant"] as BusinessType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setNewType(t)}
                      className={cx(
                        "flex-1 rounded-2xl border py-2.5 text-[13px] font-semibold capitalize",
                        newType === t
                          ? "border-white/20 bg-white/10 text-white"
                          : "border-white/[0.07] bg-white/[0.03] text-white/50",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {/* Reporting currency — a Subway in Ontario rings up CAD; Helm converts to USD for
                    combined totals. Defaults to USD; pick the store's native currency here. */}
                <div className="flex items-center gap-2.5">
                  <span className="shrink-0 px-1 text-[12px] font-medium text-white/45">Reports in</span>
                  <div className="flex flex-1 gap-2">
                    {(["USD", "CAD", "INR"] as Currency[]).map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewCurrency(c)}
                        className={cx(
                          "flex-1 rounded-2xl border py-2.5 text-[13px] font-semibold",
                          newCurrency === c
                            ? "border-white/20 bg-white/10 text-white"
                            : "border-white/[0.07] bg-white/[0.03] text-white/50",
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={commitImport}
              className="mt-5 w-full rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
            >
              {targetId === "new" ? "Add business" : `Update ${targetBusiness?.shortName ?? targetBusiness?.name}`}
            </button>
          </>
        )}

        {/* ── SNAP — real camera/file capture → Claude-vision extraction ─────────── */}
        {view === "capture" && (
          <>
            <BackBar onBack={() => setView("home")} />
            <h2 className="text-[19px] font-bold tracking-tight text-white">Snap your daily close</h2>
            <p className="mt-1 text-[13px] text-white/50">
              Photograph your register Z-report or hotel folio — Helm reads the numbers and lets you confirm them.
            </p>
            <button
              onClick={() => snapRef.current?.click()}
              className="relative mt-5 flex w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.02] py-12 transition active:scale-[0.99]"
            >
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brass/15 text-brass">
                <Camera size={26} />
              </div>
              <p className="text-[14px] font-semibold text-white">Take a photo or choose one</p>
              <p className="px-8 text-center text-[12px] text-white/40">
                Line up the whole report. You'll review every number before it's saved.
              </p>
            </button>

            {snapError && (
              <div className="mt-4 rounded-2xl border border-brass/20 bg-brass/[0.07] p-3.5 text-[12.5px] leading-relaxed text-white/65">
                {snapError}
              </div>
            )}

            {/* Always-available honest fallbacks (and the only path on a static deploy). */}
            <div className="mt-4 space-y-2.5">
              <button
                onClick={() => openFilePicker("new")}
                className="flex w-full items-center gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-left transition active:scale-[0.99]"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-info/15 text-info">
                  <Upload size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-[14.5px] font-semibold text-white">Upload a sales report instead</p>
                  <p className="text-[12px] text-white/45">CSV or Excel from any POS</p>
                </div>
                <ChevronRight size={18} className="text-white/25" />
              </button>
              <button
                onClick={() => setView("hotel")}
                className="flex w-full items-center gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-left transition active:scale-[0.99]"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-white/70">
                  <Sparkles size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-[14.5px] font-semibold text-white">Enter the numbers by hand</p>
                  <p className="text-[12px] text-white/45">Add a property and type today's key numbers</p>
                </div>
                <ChevronRight size={18} className="text-white/25" />
              </button>
            </div>
          </>
        )}

        {view === "scanning" && <Spinner title="Reading your numbers…" sub="Extracting what's clearly visible — you'll confirm each one" />}

        {view === "snapReview" && snap && snap.kind !== "unavailable" && (
          <>
            <BackBar onBack={() => setView("capture")} />
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-brass" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-brass">Extracted</span>
            </div>
            <h2 className="mt-2 text-[19px] font-bold tracking-tight text-white">Confirm what I read</h2>
            <p className="mt-1 text-[13px] text-white/50">
              I only fill in what's clearly on the photo — check and fix anything before saving.
            </p>

            <div className="mt-4 space-y-2.5">
              <Field
                label={snap.kind === "hotel" ? "Property name" : "Business name"}
                value={snapName}
                onChange={setSnapName}
                placeholder={snap.kind === "hotel" ? "e.g. Seaside Inn" : "e.g. Sunrise Coffee"}
              />

              {snap.kind === "hotel" ? (
                <>
                  <div className="flex gap-2.5">
                    <div className="flex-1">
                      <Field label="ADR ($)" value={snapAdr} onChange={setSnapAdr} placeholder="142" type="number" />
                    </div>
                    <div className="flex-1">
                      <Field label="Occupancy (%)" value={snapOcc} onChange={setSnapOcc} placeholder="78" type="number" />
                    </div>
                    <div className="w-24">
                      <Field label="Rooms" value={snapRooms} onChange={setSnapRooms} placeholder="120" type="number" />
                    </div>
                  </div>
                  <p className="px-1 text-[11.5px] leading-relaxed text-white/35">
                    Add your room count so Helm can build RevPAR and the rest. Upload real history anytime to replace it.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex gap-2.5">
                    <div className="flex-1">
                      <Field label="Gross sales ($)" value={snapGross} onChange={setSnapGross} placeholder="1847" type="number" />
                    </div>
                    <div className="flex-1">
                      <Field label="Net sales ($)" value={snapNet} onChange={setSnapNet} placeholder="1695" type="number" />
                    </div>
                  </div>
                  <Field label="Transactions" value={snapTxns} onChange={setSnapTxns} placeholder="96" type="number" />
                  <div className="flex gap-2">
                    {(["retail", "restaurant"] as BusinessType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setSnapType(t)}
                        className={cx(
                          "flex-1 rounded-2xl border py-2.5 text-[13px] font-semibold capitalize",
                          snapType === t
                            ? "border-white/20 bg-white/10 text-white"
                            : "border-white/[0.07] bg-white/[0.03] text-white/50",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {snapError && <p className="mt-3 text-[12px] text-down">{snapError}</p>}

            <button
              onClick={commitSnap}
              className="mt-6 w-full rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
            >
              Add to Helm
            </button>
            <button
              onClick={() => snapRef.current?.click()}
              className="mt-2 w-full py-2 text-[13px] font-medium text-white/45"
            >
              Retake the photo
            </button>
          </>
        )}

        {/* ── DONE (import) ──────────────────────────────────────── */}
        {view === "done" && parsed && (
          <div className="flex flex-col items-center py-12">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-up/15">
              <Check size={32} className="text-up" strokeWidth={3} />
            </div>
            <p className="mt-5 text-[17px] font-bold text-white">{savedName} is live</p>
            <p className="mt-1 px-6 text-center text-[13px] text-white/50">
              {parsed.series.length} days imported. It's in your brief and net-worth view now.
            </p>
            <button
              onClick={onClose}
              className="mt-6 w-full rounded-full bg-white/10 py-3 text-[14px] font-semibold text-white active:scale-[0.98]"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TallyConnectView({
  onBack,
  onImported,
  onToast,
  onClose,
  onUpload,
}: {
  onBack: () => void;
  onImported: (b: Business) => void;
  onToast: (m: string) => void;
  onClose: () => void;
  onUpload: () => void;
}) {
  const [stage, setStage] = useState<"intro" | "connecting" | "review" | "error">("intro");
  const [res, setRes] = useState<TallyResult | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  async function connect() {
    setStage("connecting");
    setErr("");
    try {
      const r = await tallySync(90);
      setRes(r);
      setName(r.company);
      setStage("review");
    } catch (e) {
      setErr((e as Error).message);
      setStage("error");
    }
  }

  function add() {
    if (!res) return;
    const { native, display } = tallyToBusiness(res, { name });
    upsertImported(native);
    onImported(display);
    onToast(`${display.name} connected from Tally ✓`);
    onClose();
  }

  return (
    <>
      <BackBar onBack={onBack} />
      <div className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "#34c79a22", color: "#34c79a" }}>
        <BookText size={22} />
      </div>
      <h2 className="mt-3 text-[19px] font-bold tracking-tight text-white">Connect TallyPrime</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-white/55">
        Pull daily sales straight from Tally's local HTTP-XML gateway. Helm reads your Day Book —
        nothing is written back. Reports in ₹ and converts to your display currency.
      </p>

      {stage === "intro" && (
        <>
          <button
            onClick={connect}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
          >
            <Link2 size={17} strokeWidth={2.4} /> Connect TallyPrime
          </button>
          <p className="mt-2 text-center text-[11px] text-white/35">
            No gateway configured? Connecting shows a demo pharmacy so you can see the flow.
          </p>
          <button onClick={onUpload} className="mt-3 w-full py-2 text-[13px] font-medium text-white/45">
            Or upload a Tally export (Day Book → Excel)
          </button>
        </>
      )}

      {stage === "connecting" && (
        <div className="flex flex-col items-center py-12">
          <Loader2 size={26} className="animate-spin text-up" />
          <p className="mt-3 text-[13px] text-white/50">Reading your Day Book…</p>
        </div>
      )}

      {stage === "review" && res && (
        <>
          {res.demo && (
            <div className="mt-4 rounded-2xl border border-brass/15 bg-brass/[0.06] p-3 text-[12px] leading-relaxed text-white/55">
              {res.note || "Demo mode — set TALLY_URL in .env to pull your real Day Book from TallyPrime."}
            </div>
          )}
          <label className="mt-4 block rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5">
            <span className="text-[11px] font-medium text-white/40">Business name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-0.5 w-full bg-transparent text-[15px] font-semibold text-white outline-none"
            />
          </label>
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            <Stat big={money(res.totals.revenue, "INR")} label="Total sales" />
            <Stat big={String(res.totals.days)} label="Days" />
            <Stat big={res.totals.transactions.toLocaleString()} label="Transactions" />
          </div>
          <p className="mt-2 px-1 text-[11px] text-white/35">
            Reported in ₹ · shown in USD across Helm (≈ {money(toUSD(res.totals.revenue, "INR"), "USD")} total).
          </p>
          <button
            onClick={add}
            className="mt-5 w-full rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
          >
            Add to Helm
          </button>
        </>
      )}

      {stage === "error" && (
        <div className="mt-4 rounded-2xl border border-down/15 bg-down/[0.06] p-4">
          <p className="text-[13px] font-semibold text-down">Couldn't reach Tally</p>
          <p className="mt-1 text-[12px] leading-relaxed text-white/55">{err}</p>
          <button onClick={() => setStage("intro")} className="mt-3 w-full rounded-full bg-white/10 py-2.5 text-[13px] font-semibold text-white active:scale-95">
            Try again
          </button>
        </div>
      )}
    </>
  );
}

type HotelStep = "intro" | "setup" | "method" | "manual" | "parsing" | "review";

function HotelConnectView({
  businesses,
  onBack,
  onAdd,
}: {
  businesses: Business[];
  onBack: () => void;
  onAdd: (b: Business) => void;
}) {
  const present = new Set(businesses.map((b) => b.id));
  const available = buildSampleHotels().filter((h) => !present.has(h.id));

  const [step, setStep] = useState<HotelStep>("intro");
  // Property profile (collected before any data so every metric can derive cleanly).
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [location, setLocation] = useState("");
  const [rooms, setRooms] = useState("");
  const [stars, setStars] = useState(3);
  // Manual key-numbers path.
  const [adr, setAdr] = useState("");
  const [occ, setOcc] = useState("");
  // Upload path.
  const [parsed, setParsed] = useState<ParsedHotelImport | null>(null);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const roomCount = Math.max(0, Math.round(parseFloat(rooms) || 0));
  const meta = {
    name: name.trim(),
    brand: brand.trim() || undefined,
    location: location.trim() || undefined,
    rooms: roomCount,
    stars,
  };

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setErr("");
    setStep("parsing");
    try {
      const result = await parseHotelFile(file, { rooms: roomCount });
      setParsed(result);
      setStep("review");
    } catch (e) {
      setErr((e as Error).message || "Couldn't read that file.");
      setStep("method");
    }
  }

  function addManual() {
    const a = parseFloat(adr);
    const o = parseFloat(occ);
    if (!meta.name || !roomCount || !(a > 0) || !(o > 0)) {
      setErr("Enter a name, room count, ADR and occupancy.");
      return;
    }
    onAdd(manualHotel({ ...meta, adr: a, occupancy: o }));
  }

  function addUploaded() {
    if (!parsed) return;
    onAdd(buildHotelFromImport(parsed, meta));
  }

  // ── INTRO ────────────────────────────────────────────────────────────────────────
  if (step === "intro") {
    return (
      <>
        <BackBar onBack={onBack} />
        <div className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "#e0ae4922", color: "#e0ae49" }}>
          <BedDouble size={22} />
        </div>
        <h2 className="mt-3 text-[19px] font-bold tracking-tight text-white">Add a property</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-white/55">
          Bring your numbers in and the full hospitality command center switches on — RevPAR, ADR,
          occupancy, comp-set and GOP across every property.
        </p>
        <button
          onClick={() => setStep("setup")}
          className="mt-4 w-full rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
        >
          Add your property
        </button>
        <a
          href="/helm-hotel-template.csv"
          download
          className="mt-2 flex w-full items-center justify-center gap-1.5 py-2 text-[12.5px] font-medium text-brass active:opacity-70"
        >
          <FileSpreadsheet size={14} /> Download the upload template
        </a>

        {available.length > 0 && (
          <>
            <p className="mb-2 mt-5 px-1 text-[12px] font-medium text-white/45">Or try a sample property</p>
            <div className="space-y-2">
              {available.slice(0, 3).map((h) => {
                const o = h.hotelSeries?.at(-1)?.occupancy ?? 0;
                const revpar = h.hotelSeries?.at(-1)?.revpar ?? 0;
                return (
                  <button
                    key={h.id}
                    onClick={() => onAdd(h)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition active:scale-[0.99]"
                  >
                    <div
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[15px] font-bold"
                      style={{ background: `${h.accent}22`, color: h.accent }}
                    >
                      {h.brand?.[0] ?? h.name[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-white">{h.shortName ?? h.name}</p>
                      <p className="flex items-center gap-1 truncate text-[11.5px] text-white/45">
                        <MapPin size={10} /> {h.location} · {h.rooms} rooms
                        <span className="inline-flex items-center gap-0.5">
                          · {h.stars}
                          <Star size={9} className="fill-brass text-brass" />
                        </span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-semibold text-white tabular-nums">${revpar.toFixed(0)}</p>
                      <p className="text-[10px] text-white/40">{pct(o, 0)} occ</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </>
    );
  }

  // ── SETUP (property profile) ───────────────────────────────────────────────────────
  if (step === "setup") {
    return (
      <>
        <BackBar onBack={() => setStep("intro")} />
        <h2 className="text-[19px] font-bold tracking-tight text-white">Property details</h2>
        <p className="mt-1 text-[13px] text-white/50">A few basics so Helm reads your numbers correctly.</p>
        <div className="mt-4 space-y-2.5">
          <Field label="Property name" value={name} onChange={setName} placeholder="e.g. Seaside Inn Clearwater" />
          <div className="flex gap-2.5">
            <div className="flex-1">
              <Field label="Brand (optional)" value={brand} onChange={setBrand} placeholder="Hilton, IHG, Independent" />
            </div>
            <div className="w-28">
              <Field label="Rooms" value={rooms} onChange={setRooms} placeholder="120" type="number" />
            </div>
          </div>
          <Field label="Location (optional)" value={location} onChange={setLocation} placeholder="Clearwater, FL" />
          <div>
            <p className="mb-1 px-1 text-[11px] font-medium text-white/40">Class</p>
            <div className="flex gap-1.5">
              {[2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setStars(s)}
                  className={cx(
                    "flex flex-1 items-center justify-center gap-0.5 rounded-2xl border py-2.5 text-[13px] font-semibold",
                    stars === s ? "border-white/20 bg-white/10 text-white" : "border-white/[0.07] bg-white/[0.03] text-white/50",
                  )}
                >
                  {s} <Star size={11} className={cx(stars === s ? "fill-brass text-brass" : "text-white/40")} />
                </button>
              ))}
            </div>
          </div>
        </div>
        {err && <p className="mt-3 text-[12px] text-down">{err}</p>}
        <button
          onClick={() => {
            if (!meta.name || !roomCount) {
              setErr("Enter a property name and room count.");
              return;
            }
            setErr("");
            setStep("method");
          }}
          className="mt-5 w-full rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
        >
          Continue
        </button>
      </>
    );
  }

  // ── METHOD (upload vs manual) ───────────────────────────────────────────────────────
  if (step === "method") {
    return (
      <>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <BackBar onBack={() => setStep("setup")} />
        <h2 className="text-[19px] font-bold tracking-tight text-white">How do you have your numbers?</h2>
        <p className="mt-1 text-[13px] text-white/50">
          {meta.name} · {roomCount} rooms. Upload your history, or just enter today's key numbers.
        </p>
        <div className="mt-4 space-y-2.5">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-left transition active:scale-[0.99]"
          >
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brass/15 text-brass">
              <Upload size={20} />
            </div>
            <div className="flex-1">
              <p className="text-[14.5px] font-semibold text-white">Upload my data (CSV / Excel)</p>
              <p className="text-[12px] text-white/45">A PMS export or STR report — daily or monthly</p>
            </div>
            <ChevronRight size={18} className="text-white/25" />
          </button>
          <button
            onClick={() => setStep("manual")}
            className="flex w-full items-center gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-left transition active:scale-[0.99]"
          >
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-info/15 text-info">
              <Sparkles size={20} />
            </div>
            <div className="flex-1">
              <p className="text-[14.5px] font-semibold text-white">Enter key numbers</p>
              <p className="text-[12px] text-white/45">Just ADR + occupancy — see it in seconds</p>
            </div>
            <ChevronRight size={18} className="text-white/25" />
          </button>
        </div>
        {err && (
          <div className="mt-3 rounded-2xl border border-down/20 bg-down/[0.06] p-3 text-[12px] leading-relaxed text-white/60">
            {err}
          </div>
        )}
        <a
          href="/helm-hotel-template.csv"
          download
          className="mt-4 flex w-full items-center justify-center gap-1.5 py-2 text-[12.5px] font-medium text-brass active:opacity-70"
        >
          <FileSpreadsheet size={14} /> Download the upload template
        </a>
      </>
    );
  }

  // ── MANUAL (key numbers) ────────────────────────────────────────────────────────────
  if (step === "manual") {
    return (
      <>
        <BackBar onBack={() => setStep("method")} />
        <h2 className="text-[19px] font-bold tracking-tight text-white">Key numbers</h2>
        <p className="mt-1 text-[13px] text-white/50">{meta.name}'s typical performance. Helm builds the rest.</p>
        <div className="mt-4 flex gap-2.5">
          <div className="flex-1">
            <Field label="Typical ADR ($)" value={adr} onChange={setAdr} placeholder="142" type="number" />
          </div>
          <div className="flex-1">
            <Field label="Occupancy (%)" value={occ} onChange={setOcc} placeholder="78" type="number" />
          </div>
        </div>
        <p className="mt-2 px-1 text-[11.5px] leading-relaxed text-white/35">
          Helm anchors a believable trailing series to these so you see your command center now. Upload real
          history anytime to replace it.
        </p>
        {err && <p className="mt-3 text-[12px] text-down">{err}</p>}
        <button
          onClick={addManual}
          className="mt-5 w-full rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
        >
          Add {meta.name || "property"}
        </button>
      </>
    );
  }

  // ── PARSING ─────────────────────────────────────────────────────────────────────────
  if (step === "parsing") {
    return <Spinner title="Reading your hotel data…" sub="Mapping RevPAR, ADR, occupancy, comp-set & GOP" />;
  }

  // ── REVIEW (uploaded) ───────────────────────────────────────────────────────────────
  if (step === "review" && parsed) {
    return (
      <>
        <BackBar onBack={() => setStep("method")} />
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-brass" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-brass">Parsed</span>
        </div>
        <h2 className="mt-2 text-[19px] font-bold tracking-tight text-white">{parsed.totals.days} days of data found</h2>
        <p className="mt-1 text-[13px] text-white/50">
          {shortDate(parsed.range.from)} → {shortDate(parsed.range.to)} · {meta.name}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <Stat big={`$${parsed.totals.avgRevpar.toFixed(0)}`} label="Avg RevPAR" />
          <Stat big={`$${parsed.totals.avgAdr.toFixed(0)}`} label="Avg ADR" />
          <Stat big={pct(parsed.totals.avgOccupancy, 0)} label="Avg Occ" />
        </div>
        {parsed.derived.length > 0 && (
          <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-white/40">Helm filled in</p>
            <ul className="space-y-1">
              {parsed.derived.map((d, i) => (
                <li key={i} className="flex gap-1.5 text-[12px] leading-snug text-white/55">
                  <Check size={13} className="mt-0.5 shrink-0 text-brass" /> {d}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          onClick={addUploaded}
          className="mt-5 w-full rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
        >
          Add {meta.name}
        </button>
      </>
    );
  }

  return null;
}

type FuelStep = "setup" | "method" | "manual" | "parsing" | "review";

function FuelConnectView({ onBack, onAdd }: { onBack: () => void; onAdd: (b: Business) => void }) {
  const [step, setStep] = useState<FuelStep>("setup");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [location, setLocation] = useState("");
  const [pumps, setPumps] = useState("");
  // Manual key numbers.
  const [gallons, setGallons] = useState("");
  const [cpg, setCpg] = useState("");
  const [inside, setInside] = useState("");
  const [parsed, setParsed] = useState<ParsedFuelImport | null>(null);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const meta = {
    name: name.trim(),
    brand: brand.trim() || undefined,
    location: location.trim() || undefined,
    pumps: Math.max(0, Math.round(parseFloat(pumps) || 0)) || undefined,
  };

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setErr("");
    setStep("parsing");
    try {
      const result = await parseFuelFile(file);
      setParsed(result);
      setStep("review");
    } catch (e) {
      setErr((e as Error).message || "Couldn't read that file.");
      setStep("method");
    }
  }

  function addManual() {
    const g = parseFloat(gallons);
    const c = parseFloat(cpg);
    const ins = parseFloat(inside);
    if (!meta.name || !(g > 0) || !(c > 0) || !(ins >= 0)) {
      setErr("Enter a name, gallons/day, CPG and inside sales/day.");
      return;
    }
    onAdd(manualFuel({ ...meta, gallonsPerDay: g, cpg: c, insidePerDay: ins }));
  }

  if (step === "setup") {
    return (
      <>
        <BackBar onBack={onBack} />
        <div className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "#0061a822", color: "#3b9ae0" }}>
          <Fuel size={22} />
        </div>
        <h2 className="mt-3 text-[19px] font-bold tracking-tight text-white">Add a gas station</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-white/55">
          Helm reads your Passport / back-office export — gallons, cents-per-gallon, and inside (c-store) sales —
          and shows where your profit actually comes from.
        </p>
        <div className="mt-4 space-y-2.5">
          <Field label="Station name" value={name} onChange={setName} placeholder="e.g. Marathon — Highway 40" />
          <div className="flex gap-2.5">
            <div className="flex-1">
              <Field label="Brand (optional)" value={brand} onChange={setBrand} placeholder="Marathon, BP, Shell" />
            </div>
            <div className="w-28">
              <Field label="Pumps" value={pumps} onChange={setPumps} placeholder="8" type="number" />
            </div>
          </div>
          <Field label="Location (optional)" value={location} onChange={setLocation} placeholder="Columbus, OH" />
        </div>
        {err && <p className="mt-3 text-[12px] text-down">{err}</p>}
        <button
          onClick={() => {
            if (!meta.name) {
              setErr("Enter a station name.");
              return;
            }
            setErr("");
            setStep("method");
          }}
          className="mt-5 w-full rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
        >
          Continue
        </button>
      </>
    );
  }

  if (step === "method") {
    return (
      <>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        <BackBar onBack={() => setStep("setup")} />
        <h2 className="text-[19px] font-bold tracking-tight text-white">How do you have your numbers?</h2>
        <p className="mt-1 text-[13px] text-white/50">{meta.name}. Upload your export, or enter today's key numbers.</p>
        <div className="mt-4 space-y-2.5">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-left transition active:scale-[0.99]"
          >
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brass/15 text-brass">
              <Upload size={20} />
            </div>
            <div className="flex-1">
              <p className="text-[14.5px] font-semibold text-white">Upload my data (CSV / Excel)</p>
              <p className="text-[12px] text-white/45">Passport or back-office daily summary</p>
            </div>
            <ChevronRight size={18} className="text-white/25" />
          </button>
          <button
            onClick={() => setStep("manual")}
            className="flex w-full items-center gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-left transition active:scale-[0.99]"
          >
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-info/15 text-info">
              <Sparkles size={20} />
            </div>
            <div className="flex-1">
              <p className="text-[14.5px] font-semibold text-white">Enter key numbers</p>
              <p className="text-[12px] text-white/45">Gallons/day + CPG + inside sales</p>
            </div>
            <ChevronRight size={18} className="text-white/25" />
          </button>
        </div>
        {err && (
          <div className="mt-3 rounded-2xl border border-down/20 bg-down/[0.06] p-3 text-[12px] leading-relaxed text-white/60">{err}</div>
        )}
      </>
    );
  }

  if (step === "manual") {
    return (
      <>
        <BackBar onBack={() => setStep("method")} />
        <h2 className="text-[19px] font-bold tracking-tight text-white">Key numbers</h2>
        <p className="mt-1 text-[13px] text-white/50">{meta.name}'s typical day. Helm builds the rest.</p>
        <div className="mt-4 space-y-2.5">
          <div className="flex gap-2.5">
            <div className="flex-1">
              <Field label="Gallons / day" value={gallons} onChange={setGallons} placeholder="4500" type="number" />
            </div>
            <div className="w-28">
              <Field label="CPG (¢)" value={cpg} onChange={setCpg} placeholder="28" type="number" />
            </div>
          </div>
          <Field label="Inside sales / day ($)" value={inside} onChange={setInside} placeholder="3500" type="number" />
        </div>
        {err && <p className="mt-3 text-[12px] text-down">{err}</p>}
        <button
          onClick={addManual}
          className="mt-5 w-full rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
        >
          Add {meta.name || "station"}
        </button>
      </>
    );
  }

  if (step === "parsing") {
    return <Spinner title="Reading your station data…" sub="Mapping gallons, CPG and inside sales" />;
  }

  if (step === "review" && parsed) {
    return (
      <>
        <BackBar onBack={() => setStep("method")} />
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-brass" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-brass">Parsed</span>
        </div>
        <h2 className="mt-2 text-[19px] font-bold tracking-tight text-white">{parsed.totals.days} days of data found</h2>
        <p className="mt-1 text-[13px] text-white/50">
          {shortDate(parsed.range.from)} → {shortDate(parsed.range.to)} · {meta.name}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <Stat big={`${Math.round(parsed.totals.avgGallonsDay).toLocaleString()}`} label="Gal / day" />
          <Stat big={`${parsed.totals.avgCpg.toFixed(0)}¢`} label="Avg CPG" />
          <Stat big={usdCompact(parsed.totals.avgInsideDay)} label="Inside / day" />
        </div>
        {parsed.derived.length > 0 && (
          <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-white/40">Helm filled in</p>
            <ul className="space-y-1">
              {parsed.derived.map((d, i) => (
                <li key={i} className="flex gap-1.5 text-[12px] leading-snug text-white/55">
                  <Check size={13} className="mt-0.5 shrink-0 text-brass" /> {d}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          onClick={() => onAdd(buildStationFromImport(parsed, meta))}
          className="mt-5 w-full rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
        >
          Add {meta.name}
        </button>
      </>
    );
  }

  return null;
}

function ConnectRow({ provider, onClick }: { provider: Provider; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-left transition active:scale-[0.99]"
    >
      <div
        className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
        style={{ background: `${provider.accent}22`, color: provider.accent }}
      >
        <Link2 size={20} />
      </div>
      <div className="flex-1">
        <p className="text-[14.5px] font-semibold text-white">Connect {provider.label}</p>
        <p className="text-[12px] text-white/45">{provider.sub}</p>
      </div>
      <ChevronRight size={18} className="text-white/25" />
    </button>
  );
}

function OptionRow({
  icon: Icon,
  title,
  sub,
  onClick,
}: {
  icon: typeof Camera;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-left transition active:scale-[0.99]"
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-white/70">
        <Icon size={20} />
      </div>
      <div className="flex-1">
        <p className="text-[14.5px] font-semibold text-white">{title}</p>
        <p className="text-[12px] text-white/45">{sub}</p>
      </div>
      <ChevronRight size={18} className="text-white/25" />
    </button>
  );
}

function PickRow({
  label,
  sub,
  color,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition",
        active ? "border-white/25 bg-white/[0.07]" : "border-white/[0.06] bg-white/[0.02]",
      )}
    >
      <span className="h-8 w-8 shrink-0 rounded-xl" style={{ background: `${color}22` }} />
      <div className="flex-1">
        <p className="text-[14px] font-semibold text-white">{label}</p>
        <p className="text-[11px] text-white/40">{sub}</p>
      </div>
      <span
        className={cx(
          "grid h-5 w-5 place-items-center rounded-full border",
          active ? "border-white bg-white" : "border-white/25",
        )}
      >
        {active && <Check size={12} className="text-black" strokeWidth={3} />}
      </span>
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5">
      <span className="text-[11px] font-medium text-white/40">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-0.5 w-full bg-transparent text-[15px] font-medium text-white outline-none placeholder:text-white/25"
      />
    </label>
  );
}

function Stat({ big, label }: { big: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3 py-3 text-center">
      <p className="text-[16px] font-bold text-white tabular-nums">{big}</p>
      <p className="mt-0.5 text-[10px] text-white/45">{label}</p>
    </div>
  );
}

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack} className="mb-2 -ml-1 flex items-center gap-1 text-[13px] font-medium text-white/45">
      <ChevronLeft size={17} /> Back
    </button>
  );
}

function Spinner({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center py-16">
      <div className="relative grid h-20 w-20 place-items-center">
        <div className="absolute inset-0 animate-ping rounded-full bg-brass/20" />
        <div className="grid h-16 w-16 place-items-center rounded-3xl bg-brass/15">
          <Loader2 size={30} className="animate-spin text-brass" />
        </div>
      </div>
      <p className="mt-6 text-[15px] font-semibold text-white">{title}</p>
      <p className="mt-1 text-[13px] text-white/45">{sub}</p>
    </div>
  );
}
