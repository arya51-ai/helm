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
  Lock,
  ShieldCheck,
  Upload,
  TrendingUp,
  BookText,
} from "lucide-react";
import type { Business, BusinessType, DayPoint } from "../types";
import { parseSalesFile, slugId, type ParsedImport } from "../lib/import";
import { tallySync, tallyToBusiness, type TallyResult } from "../lib/tally";
import { toUSD } from "../lib/currency";
import { upsertImported } from "../data/source";
import { usd, usdCompact, money, shortDate } from "../lib/format";
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
    accent: "#2bb673",
    sub: "Net sales, customer count, daily close",
    targetId: "subway-espanola",
  },
  retailz: {
    id: "retailz",
    label: "Retailz POS",
    url: "retailzpos.com",
    accent: "#e0913a",
    sub: "Sales summary by date",
    targetId: "riverside-columbus",
  },
};

const NEW_COLORS = ["#2bb673", "#e0913a", "#7c6cf5", "#38bdf8", "#f472b6", "#f59e0b"];

const EXTRACTED = { name: "Sunrise Coffee Co.", location: "Santa Fe, NM", date: "Today", gross: 1847, transactions: 96 };

export function AddBusinessSheet({
  businesses,
  onClose,
  onImported,
  onConnectInvestments,
  onToast,
}: {
  businesses: Business[];
  onClose: () => void;
  onImported: (b: Business) => void;
  onConnectInvestments: () => void;
  onToast: (m: string) => void;
}) {
  const [view, setView] = useState<View>("home");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [targetId, setTargetId] = useState<string>("new");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<BusinessType>("retail");
  const [savedName, setSavedName] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const pendingTarget = useRef<string>("new");

  useEffect(() => {
    if (view === "scanning") {
      const t = setTimeout(() => setView("snapReview"), 1900);
      return () => clearTimeout(t);
    }
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
      };
    }
    upsertImported(biz);
    setSavedName(biz.name);
    onImported(biz);
    setView("done");
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-sheet-up relative max-h-[90%] overflow-y-auto rounded-t-[2rem] border-t border-white/10 bg-[#101218] px-5 pb-9 pt-3">
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
                sub="Photograph your register Z-report"
                onClick={() => setView("capture")}
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

        {/* ── CONNECT (login) ────────────────────────────────────── */}
        {view === "connect" && provider && (
          <>
            <BackBar onBack={() => setView("home")} />
            <div
              className="mt-1 grid h-12 w-12 place-items-center rounded-2xl"
              style={{ background: `${provider.accent}22`, color: provider.accent }}
            >
              <Link2 size={22} />
            </div>
            <h2 className="mt-3 text-[19px] font-bold tracking-tight text-white">
              Connect {provider.label}
            </h2>
            <p className="mt-1 text-[13px] text-white/50">
              Sign in once and Helm keeps your sales in sync automatically.
            </p>

            <div className="mt-5 space-y-2.5">
              <Field label="Email" value={email} onChange={setEmail} placeholder={`you@${provider.url}`} type="email" />
              <Field label="Password" value={password} onChange={setPassword} placeholder="••••••••" type="password" />
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
              <Lock size={14} className="mt-0.5 shrink-0 text-white/40" />
              <p className="text-[12px] leading-relaxed text-white/45">
                Read-only — Helm only pulls sales reports. It never moves money or changes settings.
              </p>
            </div>

            <button
              onClick={() => setView("connecting")}
              className="mt-4 w-full rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
            >
              Connect securely
            </button>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-white/35">
              Direct auto-connect is in private beta. Today you can go live in seconds by uploading an
              export — same data, your hands on it.
            </p>
          </>
        )}

        {view === "connecting" && provider && (
          <Spinner title={`Connecting to ${provider.label}…`} sub="Establishing a secure session" />
        )}

        {/* Honest beta fallback → upload */}
        {view === "connectBeta" && provider && (
          <>
            <BackBar onBack={() => setView("connect")} />
            <div className="mt-1 grid h-12 w-12 place-items-center rounded-2xl bg-amber-400/12 text-amber-400">
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
              <Sparkles size={16} className="text-violet-300" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-violet-300">Parsed</span>
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
                color="#94a3b8"
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

        {/* ── SNAP (demo) ────────────────────────────────────────── */}
        {view === "capture" && (
          <>
            <BackBar onBack={() => setView("home")} />
            <h2 className="text-[19px] font-bold tracking-tight text-white">Snap your daily close</h2>
            <p className="mt-1 text-[13px] text-white/50">Line up the register receipt — Helm reads the rest.</p>
            <div className="relative mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black p-6">
              <div className="pointer-events-none absolute inset-3 rounded-xl border-2 border-dashed border-white/20" />
              <div className="mx-auto w-[200px] rotate-[-1.5deg] rounded-sm bg-[#f4f1ea] p-4 font-mono text-[10px] leading-[1.7] text-black shadow-2xl">
                <div className="text-center font-bold">SUNRISE COFFEE CO.</div>
                <div className="text-center text-[8px]">Santa Fe, NM · Term 01</div>
                <div className="my-2 border-t border-dashed border-black/30" />
                <div className="flex justify-between"><span>DATE</span><span>06/02/26</span></div>
                <div className="flex justify-between"><span>GUESTS</span><span>96</span></div>
                <div className="flex justify-between"><span>GROSS</span><span>$1,847.00</span></div>
                <div className="my-2 border-t border-dashed border-black/30" />
                <div className="flex justify-between font-bold"><span>NET</span><span>$1,694.62</span></div>
              </div>
            </div>
            <button
              onClick={() => setView("scanning")}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
            >
              <Camera size={18} strokeWidth={2.4} /> Scan receipt
            </button>
          </>
        )}

        {view === "scanning" && <Spinner title="Reading your numbers…" sub="Extracting sales, transactions, and date" />}

        {view === "snapReview" && (
          <>
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-violet-300" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-violet-300">Extracted</span>
            </div>
            <h2 className="mt-2 text-[19px] font-bold tracking-tight text-white">Here's what I found</h2>
            <div className="mt-5 space-y-2.5">
              <ReadRow label="Business" value={EXTRACTED.name} />
              <ReadRow label="Location" value={EXTRACTED.location} />
              <div className="grid grid-cols-3 gap-2.5">
                <Stat big={usd(EXTRACTED.gross)} label="Gross sales" />
                <Stat big={String(EXTRACTED.transactions)} label="Transactions" />
                <Stat big={usd(EXTRACTED.gross / EXTRACTED.transactions, true)} label="Avg ticket" />
              </div>
            </div>
            <button
              onClick={() => {
                onToast(`${EXTRACTED.name} added ✓`);
                onClose();
              }}
              className="mt-6 w-full rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
            >
              Add to Helm
            </button>
          </>
        )}

        {/* ── DONE (import) ──────────────────────────────────────── */}
        {view === "done" && parsed && (
          <div className="flex flex-col items-center py-12">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-400/15">
              <Check size={32} className="text-emerald-400" strokeWidth={3} />
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
      <div className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "#10b98122", color: "#10b981" }}>
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
          <Loader2 size={26} className="animate-spin text-emerald-300" />
          <p className="mt-3 text-[13px] text-white/50">Reading your Day Book…</p>
        </div>
      )}

      {stage === "review" && res && (
        <>
          {res.demo && (
            <div className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] p-3 text-[12px] leading-relaxed text-white/55">
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
        <div className="mt-4 rounded-2xl border border-rose-400/15 bg-rose-400/[0.06] p-4">
          <p className="text-[13px] font-semibold text-rose-300">Couldn't reach Tally</p>
          <p className="mt-1 text-[12px] leading-relaxed text-white/55">{err}</p>
          <button onClick={() => setStage("intro")} className="mt-3 w-full rounded-full bg-white/10 py-2.5 text-[13px] font-semibold text-white active:scale-95">
            Try again
          </button>
        </div>
      )}
    </>
  );
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

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
      <span className="text-[13px] text-white/45">{label}</span>
      <span className="text-[14px] font-semibold text-white">{value}</span>
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
        <div className="absolute inset-0 animate-ping rounded-full bg-violet-500/20" />
        <div className="grid h-16 w-16 place-items-center rounded-3xl bg-violet-500/15">
          <Loader2 size={30} className="animate-spin text-violet-300" />
        </div>
      </div>
      <p className="mt-6 text-[15px] font-semibold text-white">{title}</p>
      <p className="mt-1 text-[13px] text-white/45">{sub}</p>
    </div>
  );
}
