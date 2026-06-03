import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  Upload,
  RefreshCw,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  Link2,
  AlertCircle,
} from "lucide-react";
import { usePlaidLink } from "react-plaid-link";
import type { Business, Holding } from "../types";
import { fetchQuotes, knownName, type Quote } from "../lib/quotes";
import { parseHoldingsFile, buildPortfolioBusiness, type ParsedHoldings } from "../lib/holdings";
import { plaidStatus, plaidCreateLinkToken, plaidExchange, plaidHoldings } from "../lib/plaid";
import { upsertImported } from "../data/source";
import { usd, usdCompact, signedPct, signedUsd } from "../lib/format";
import { cx } from "./ui";

type View = "home" | "plaid" | "manual" | "upload" | "review" | "syncing" | "saving" | "done";
interface Row {
  ticker: string;
  shares: string;
  cost: string;
}

interface Brokerage {
  id: string;
  label: string;
  sub: string;
  accent: string;
  mode: "manual" | "upload" | "plaid";
}
const BROKERS: Brokerage[] = [
  { id: "plaid", label: "Bank or brokerage", sub: "Securely link via Plaid — Fidelity, Schwab, Robinhood & more", accent: "#0a85ea", mode: "plaid" },
  { id: "yahoo", label: "Yahoo Finance", sub: "Link your portfolio — live prices by ticker or CSV export", accent: "#7c6cf5", mode: "manual" },
  { id: "robinhood", label: "Robinhood", sub: "Upload your positions export", accent: "#22c55e", mode: "upload" },
  { id: "fidelity", label: "Fidelity / Schwab / E*Trade", sub: "Upload your positions CSV", accent: "#38bdf8", mode: "upload" },
  { id: "manual", label: "Enter manually", sub: "Type tickers, shares, and cost", accent: "#e0913a", mode: "manual" },
];

export function InvestmentsSheet({
  existing,
  onClose,
  onImported,
  onToast,
}: {
  existing: Business | undefined;
  onClose: () => void;
  onImported: (b: Business) => void;
  onToast: (m: string) => void;
}) {
  const [view, setView] = useState<View>("home");
  const [broker, setBroker] = useState<Brokerage>(BROKERS[0]);
  const [rows, setRows] = useState<Row[]>(() =>
    existing?.holdings?.length
      ? existing.holdings.map((h) => ({ ticker: h.ticker, shares: String(h.shares), cost: String(h.costBasis) }))
      : [{ ticker: "", shares: "", cost: "" }],
  );
  const [quotes, setQuotes] = useState<Record<string, Quote>>(() => {
    const seed: Record<string, Quote> = {};
    for (const h of existing?.holdings ?? [])
      seed[h.ticker] = { ticker: h.ticker, name: h.name, price: h.price, changePct: h.dayChangePct, source: "reference" };
    return seed;
  });
  const [synced, setSynced] = useState(false);
  const [srcLabel, setSrcLabel] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedHoldings | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { ticker: "", shares: "", cost: "" }]);
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));
  }

  function holdingsFromRows(): Holding[] {
    return rows
      .filter((r) => r.ticker.trim() && parseFloat(r.shares) > 0)
      .map((r) => {
        const ticker = r.ticker.trim().toUpperCase();
        const shares = parseFloat(r.shares) || 0;
        const cost = parseFloat(r.cost) || 0;
        const q = quotes[ticker];
        const price = q?.price || cost || 0;
        return {
          ticker,
          name: q?.name || knownName(ticker),
          shares,
          price,
          dayChangePct: q?.changePct || 0,
          costBasis: cost || price,
        };
      });
  }

  async function syncPrices() {
    const tickers = rows.map((r) => r.ticker.trim().toUpperCase()).filter(Boolean);
    if (!tickers.length) {
      onToast("Add a ticker first");
      return;
    }
    setView("syncing");
    const q = await fetchQuotes(tickers);
    setQuotes((prev) => ({ ...prev, ...q }));
    const sources = Object.values(q).map((x) => x.source);
    setSrcLabel(
      sources.includes("live") ? "Live prices · just now" : sources.some((s) => s === "reference") ? "Reference prices" : "",
    );
    setSynced(true);
    setView("manual");
  }

  function saveHoldings(holdings: Holding[]) {
    if (!holdings.length) {
      onToast("Add at least one holding");
      return;
    }
    const biz = buildPortfolioBusiness(existing, holdings);
    upsertImported(biz);
    onImported(biz);
    setSavedCount(holdings.length);
    setView("done");
  }

  // Holdings arriving from Plaid (real or sandbox) → prefill the manual grid, so the
  // existing review + Save path is reused unchanged.
  function applyHoldings(holdings: Holding[], label: string) {
    if (!holdings.length) {
      onToast("No holdings came back from Plaid.");
      setView("home");
      return;
    }
    setRows(
      holdings.map((h) => ({
        ticker: h.ticker,
        shares: String(h.shares),
        cost: String(Math.round(h.costBasis * 100) / 100),
      })),
    );
    setQuotes(() => {
      const q: Record<string, Quote> = {};
      for (const h of holdings)
        q[h.ticker] = { ticker: h.ticker, name: h.name, price: h.price, changePct: h.dayChangePct, source: "reference" };
      return q;
    });
    setSynced(true);
    setSrcLabel(label);
    setView("manual");
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setView("syncing");
    try {
      const result = await parseHoldingsFile(file);
      setParsed(result);
      setView("review");
    } catch (e) {
      onToast((e as Error).message || "Couldn't read that file.");
      setView("upload");
    }
  }

  const manualHoldings = holdingsFromRows();
  const mv = manualHoldings.reduce((a, h) => a + h.shares * h.price, 0);
  const cost = manualHoldings.reduce((a, h) => a + h.shares * h.costBasis, 0);
  const dayGain = manualHoldings.reduce((a, h) => a + h.shares * h.price * h.dayChangePct, 0);

  return (
    <div className="fixed inset-0 z-[55] mx-auto flex max-w-[440px] flex-col justify-end">
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-sheet-up relative max-h-[92%] overflow-y-auto rounded-t-[2rem] border-t border-white/10 bg-[#101218] px-5 pb-9 pt-3">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/15" />

        {/* HOME — choose source */}
        {view === "home" && (
          <>
            <h2 className="text-[19px] font-bold tracking-tight text-white">Sync your investments</h2>
            <p className="mt-1 text-[13px] text-white/50">Pull your real holdings so your net worth is live.</p>
            <div className="mt-5 space-y-2.5">
              {BROKERS.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    setBroker(b);
                    setView(b.mode);
                  }}
                  className="flex w-full items-center gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-left transition active:scale-[0.99]"
                >
                  <div
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[15px] font-bold"
                    style={{ background: `${b.accent}22`, color: b.accent }}
                  >
                    {b.label[0]}
                  </div>
                  <div className="flex-1">
                    <p className="text-[14.5px] font-semibold text-white">{b.label}</p>
                    <p className="text-[12px] text-white/45">{b.sub}</p>
                  </div>
                  <ChevronRight size={18} className="text-white/25" />
                </button>
              ))}
            </div>
          </>
        )}

        {/* PLAID — secure bank/brokerage link */}
        {view === "plaid" && (
          <PlaidConnectView onBack={() => setView("home")} onHoldings={applyHoldings} />
        )}

        {/* MANUAL — ticker entry + live sync */}
        {view === "manual" && (
          <>
            <BackBar onBack={() => setView("home")} />
            <h2 className="text-[19px] font-bold tracking-tight text-white">
              {broker.id === "yahoo" ? "Link Yahoo Finance" : "Your holdings"}
            </h2>
            <p className="mt-1 text-[13px] text-white/50">
              {broker.id === "yahoo"
                ? "Add your tickers (or upload your Yahoo export), then pull live prices. Cost is your average buy price."
                : "Enter your positions, then pull live prices. Cost is your average buy price."}
            </p>

            <div className="mt-4 space-y-2">
              <div className="grid grid-cols-[1fr_1fr_1fr_28px] gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-white/35">
                <span>Ticker</span>
                <span>Shares</span>
                <span>Avg cost</span>
                <span />
              </div>
              {rows.map((r, i) => {
                const q = quotes[r.ticker.trim().toUpperCase()];
                return (
                  <div key={i}>
                    <div className="grid grid-cols-[1fr_1fr_1fr_28px] items-center gap-2">
                      <input
                        value={r.ticker}
                        onChange={(e) => setRow(i, { ticker: e.target.value.toUpperCase() })}
                        placeholder="AAPL"
                        className="w-full min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.03] px-2.5 py-2 text-[14px] font-semibold uppercase text-white outline-none placeholder:text-white/25 focus:border-white/25"
                      />
                      <input
                        value={r.shares}
                        onChange={(e) => setRow(i, { shares: e.target.value })}
                        inputMode="decimal"
                        placeholder="100"
                        className="w-full min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.03] px-2.5 py-2 text-[14px] font-medium text-white outline-none placeholder:text-white/25 focus:border-white/25"
                      />
                      <input
                        value={r.cost}
                        onChange={(e) => setRow(i, { cost: e.target.value })}
                        inputMode="decimal"
                        placeholder="150"
                        className="w-full min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.03] px-2.5 py-2 text-[14px] font-medium text-white outline-none placeholder:text-white/25 focus:border-white/25"
                      />
                      <button onClick={() => removeRow(i)} className="grid h-7 w-7 place-items-center rounded-lg text-white/30 active:scale-90">
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {q && q.price > 0 && r.shares && (
                      <p className="mt-1 px-1 text-[11px] text-white/40 tabular-nums">
                        {q.name} · {usd(q.price, true)}{" "}
                        <span className={cx(q.changePct >= 0 ? "text-emerald-400" : "text-rose-400")}>{signedPct(q.changePct)}</span>{" "}
                        → <span className="font-semibold text-white/70">{usd((parseFloat(r.shares) || 0) * q.price)}</span>
                      </p>
                    )}
                  </div>
                );
              })}
              <button onClick={addRow} className="flex items-center gap-1.5 px-1 pt-1 text-[13px] font-medium text-violet-300">
                <Plus size={15} /> Add holding
              </button>
            </div>

            <button
              onClick={syncPrices}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white/10 py-3 text-[14px] font-semibold text-white active:scale-[0.98]"
            >
              <RefreshCw size={16} /> {synced ? "Refresh live prices" : "Sync live prices"}
            </button>

            {synced && mv > 0 && (
              <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                {srcLabel && (
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-white/45">
                    <span className={cx("h-1.5 w-1.5 rounded-full", srcLabel.startsWith("Live") ? "bg-emerald-400" : "bg-amber-400")} />
                    {srcLabel}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat big={usdCompact(mv)} label="Market value" />
                  <Stat big={signedUsd(dayGain)} label="Day" accent={dayGain >= 0 ? "text-emerald-400" : "text-rose-400"} />
                  <Stat big={signedUsd(mv - cost)} label="Total gain" accent={mv - cost >= 0 ? "text-emerald-400" : "text-rose-400"} />
                </div>
              </div>
            )}

            <button
              onClick={() => saveHoldings(manualHoldings)}
              className="mt-4 w-full rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
            >
              Save portfolio
            </button>
            <button onClick={() => setView("upload")} className="mt-2 w-full py-2 text-[13px] font-medium text-white/45">
              Upload a CSV export instead
            </button>
          </>
        )}

        {/* UPLOAD */}
        {view === "upload" && (
          <>
            <BackBar onBack={() => setView("home")} />
            <h2 className="text-[19px] font-bold tracking-tight text-white">Upload your positions</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-white/55">
              Export your holdings from {broker.label} (Portfolio → export / download) and drop the CSV here.
              Helm reads symbol, shares, price, and cost automatically.
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
            >
              <Upload size={17} strokeWidth={2.4} /> Choose file
            </button>
            <button onClick={() => setView("manual")} className="mt-2 w-full py-2 text-[13px] font-medium text-white/45">
              Or enter holdings manually
            </button>
          </>
        )}

        {(view === "syncing" || view === "saving") && (
          <div className="flex flex-col items-center py-16">
            <div className="relative grid h-20 w-20 place-items-center">
              <div className="absolute inset-0 animate-ping rounded-full bg-violet-500/20" />
              <div className="grid h-16 w-16 place-items-center rounded-3xl bg-violet-500/15">
                <Loader2 size={30} className="animate-spin text-violet-300" />
              </div>
            </div>
            <p className="mt-6 text-[15px] font-semibold text-white">Pulling live market data…</p>
            <p className="mt-1 text-[13px] text-white/45">Fetching prices and day changes</p>
          </div>
        )}

        {/* REVIEW (from upload) */}
        {view === "review" && parsed && (
          <>
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-violet-300" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-violet-300">Parsed</span>
            </div>
            <h2 className="mt-2 text-[19px] font-bold tracking-tight text-white">{parsed.holdings.length} holdings found</h2>
            <p className="mt-1 text-[13px] text-white/50">
              Mapped <b className="text-white/70">{parsed.detected.ticker}</b>, <b className="text-white/70">{parsed.detected.shares}</b>
              {parsed.detected.price ? (
                <>
                  , <b className="text-white/70">{parsed.detected.price}</b>
                </>
              ) : null}
              .
            </p>
            <ReviewTotals holdings={parsed.holdings} />
            <div className="mt-3 max-h-52 space-y-1.5 overflow-y-auto">
              {parsed.holdings.map((h) => (
                <div key={h.ticker} className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                  <span className="grid h-7 w-12 place-items-center rounded-lg bg-white/[0.06] text-[10px] font-bold text-white">{h.ticker}</span>
                  <span className="flex-1 text-[12px] text-white/45 tabular-nums">
                    {h.shares} sh · {usd(h.price, true)}
                  </span>
                  <span className="text-[13px] font-semibold text-white tabular-nums">{usd(h.shares * h.price)}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => saveHoldings(parsed.holdings)}
              className="mt-5 w-full rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
            >
              Save portfolio
            </button>
          </>
        )}

        {/* DONE */}
        {view === "done" && (
          <div className="flex flex-col items-center py-12">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-400/15">
              <Check size={32} className="text-emerald-400" strokeWidth={3} />
            </div>
            <p className="mt-5 text-[17px] font-bold text-white">Portfolio synced</p>
            <p className="mt-1 px-6 text-center text-[13px] text-white/50">
              {savedCount} holdings are now in your net worth and capital view.
            </p>
            <button onClick={onClose} className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-full bg-white/10 py-3 text-[14px] font-semibold text-white active:scale-[0.98]">
              <TrendingUp size={16} /> Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewTotals({ holdings }: { holdings: Holding[] }) {
  const mv = holdings.reduce((a, h) => a + h.shares * h.price, 0);
  const cost = holdings.reduce((a, h) => a + h.shares * h.costBasis, 0);
  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      <Stat big={usd(mv)} label="Market value" />
      <Stat big={signedUsd(mv - cost)} label="Total gain" accent={mv - cost >= 0 ? "text-emerald-400" : "text-rose-400"} />
    </div>
  );
}

function Stat({ big, label, accent }: { big: string; label: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3 py-3 text-center">
      <p className={cx("text-[16px] font-bold tabular-nums", accent ?? "text-white")}>{big}</p>
      <p className="mt-0.5 text-[10px] text-white/45">{label}</p>
    </div>
  );
}

function PlaidConnectView({
  onBack,
  onHoldings,
}: {
  onBack: () => void;
  onHoldings: (h: Holding[], label: string) => void;
}) {
  type S = "checking" | "ready" | "demo" | "unavailable" | "working" | "error";
  const [status, setStatus] = useState<S>("checking");
  const [err, setErr] = useState("");
  const [linkToken, setLinkToken] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    plaidStatus().then((s) => {
      if (!on) return;
      setStatus(!s.reachable ? "unavailable" : s.demo ? "demo" : "ready");
    });
    return () => {
      on = false;
    };
  }, []);

  // Plaid Link (used only when real keys are configured). Empty token = not initialized.
  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess: async (publicToken) => {
      setStatus("working");
      try {
        const itemId = await plaidExchange(publicToken);
        const { holdings, institution } = await plaidHoldings(itemId ?? undefined);
        onHoldings(holdings, `Plaid · ${institution}`);
      } catch (e) {
        setErr((e as Error).message);
        setStatus("error");
      }
    },
    onExit: (e) => {
      if (e?.error_message) {
        setErr(e.display_message || e.error_message);
        setStatus("error");
      } else {
        setStatus("ready");
      }
    },
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  async function connect() {
    setErr("");
    setStatus("working");
    try {
      const s = await plaidStatus();
      if (!s.reachable) {
        setStatus("unavailable");
        return;
      }
      if (s.demo) {
        const { holdings, institution } = await plaidHoldings();
        onHoldings(holdings, `Plaid · ${institution}`);
        return;
      }
      const token = await plaidCreateLinkToken();
      if (!token) throw new Error("Couldn't start Plaid — check the connector keys.");
      setLinkToken(token); // the effect opens Link once it's ready
    } catch (e) {
      setErr((e as Error).message);
      setStatus("error");
    }
  }

  return (
    <>
      <BackBar onBack={onBack} />
      <div className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "#0a85ea22", color: "#0a85ea" }}>
        <ShieldCheck size={22} />
      </div>
      <h2 className="mt-3 text-[19px] font-bold tracking-tight text-white">Link via Plaid</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-white/55">
        A bank-grade connection to 12,000+ institutions. Helm reads your holdings only — never your
        password. Same rails Venmo and SoFi run on.
      </p>

      {(status === "checking" || status === "working") && (
        <MiniSpinner label={status === "checking" ? "Checking connection…" : "Connecting to Plaid…"} />
      )}

      {status === "ready" && (
        <>
          <button
            onClick={connect}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
          >
            <Link2 size={17} strokeWidth={2.4} /> Connect with Plaid
          </button>
          <p className="mt-2 text-center text-[11px] text-white/35">Sandbox login: user_good / pass_good</p>
        </>
      )}

      {status === "demo" && (
        <>
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] p-3">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-400" />
            <p className="text-[12px] leading-relaxed text-white/55">
              Connector is in <b className="text-white/75">demo mode</b> (no Plaid keys yet) — connecting loads a
              realistic sandbox portfolio so you can see the full flow. Drop free Plaid sandbox keys into{" "}
              <b className="text-white/75">.env</b> to link real accounts.
            </p>
          </div>
          <button
            onClick={connect}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
          >
            <Link2 size={17} strokeWidth={2.4} /> Connect Plaid Sandbox
          </button>
        </>
      )}

      {status === "unavailable" && (
        <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
          <p className="text-[13px] font-semibold text-white">Connector not running</p>
          <p className="mt-1 text-[12px] leading-relaxed text-white/50">
            Plaid needs the local connector. Start the app with <b className="text-white/70">npm run dev</b> (it mounts
            automatically), or use Yahoo Finance / CSV upload instead.
          </p>
          <button onClick={onBack} className="mt-3 w-full rounded-full bg-white/10 py-2.5 text-[13px] font-semibold text-white active:scale-95">
            Use Yahoo or CSV instead
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="mt-4 rounded-2xl border border-rose-400/15 bg-rose-400/[0.06] p-4">
          <p className="text-[13px] font-semibold text-rose-300">Couldn't connect</p>
          <p className="mt-1 text-[12px] leading-relaxed text-white/55">{err || "Something went wrong with Plaid."}</p>
          <button onClick={() => setStatus("ready")} className="mt-3 w-full rounded-full bg-white/10 py-2.5 text-[13px] font-semibold text-white active:scale-95">
            Try again
          </button>
        </div>
      )}
    </>
  );
}

function MiniSpinner({ label }: { label: string }) {
  return (
    <div className="mt-6 flex flex-col items-center py-8">
      <Loader2 size={26} className="animate-spin text-violet-300" />
      <p className="mt-3 text-[13px] text-white/50">{label}</p>
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
