import { useState, useMemo, useCallback } from "react";
import { Plus, Download, RefreshCw, X, Pencil, TrendingUp, TrendingDown } from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
  ComposedChart, Area, Line,
} from "recharts";
import { Card, SectionTitle, cx } from "./ui";
import { usd, usdCompact, signedUsd } from "../lib/format";

// ── Types ─────────────────────────────────────────────────────

interface PHolding {
  ticker: string; name: string; sector: string;
  shares: number; cost: number; price: number;
  pe: number; pb: number; div: number;
  roe: number; margin: number; de: number;
  revG: number; epsG: number; mom12: number;
  beta: number; vol: number;
}

interface FactorWeights {
  value: number; quality: number; momentum: number; growth: number;
}

// ── Constants ─────────────────────────────────────────────────

const SERIES = ["#e0ae49","#e0ae49","#e0ae49","#0a263e","#6fa8dc","#34c79a","#0a263e","#f7dc95"];
const GAIN_COL  = "#34c79a";
const LOSS_COL  = "#e2685c";
const ACCENT_COL = "#e0ae49";
const GRID_COL  = "rgba(255,255,255,0.07)";
const TICK_COL  = "rgba(233,234,240,0.45)";
const TICKY_COL = "rgba(233,234,240,0.7)";
const STORAGE_KEY = "helm:stocks:v1";

const SAMPLE: PHolding[] = [
  {ticker:"AAPL",name:"Apple",                  sector:"Technology",       shares:25,cost:165,price:195,pe:30,pb:12,  div:0.5, roe:45,margin:25,de:1.4, revG:6, epsG:9, mom12:18,beta:1.20,vol:26},
  {ticker:"MSFT",name:"Microsoft",              sector:"Technology",       shares:15,cost:310,price:420,pe:33,pb:11,  div:0.8, roe:38,margin:36,de:0.40,revG:14,epsG:16,mom12:22,beta:0.95,vol:24},
  {ticker:"NVDA",name:"Nvidia",                 sector:"Technology",       shares:10,cost:90, price:130,pe:45,pb:25,  div:0.03,roe:55,margin:50,de:0.30,revG:60,epsG:80,mom12:60,beta:1.60,vol:50},
  {ticker:"VOO", name:"Vanguard S&P 500 ETF",   sector:"Index / ETF",      shares:30,cost:380,price:500,pe:22,pb:4,   div:1.4, roe:18,margin:12,de:1.0, revG:8, epsG:10,mom12:15,beta:1.00,vol:16},
  {ticker:"JPM", name:"JPMorgan Chase",          sector:"Financials",       shares:20,cost:140,price:200,pe:12,pb:1.8, div:2.4, roe:16,margin:30,de:1.3, revG:5, epsG:6, mom12:25,beta:1.10,vol:24},
  {ticker:"JNJ", name:"Johnson & Johnson",       sector:"Healthcare",       shares:18,cost:160,price:155,pe:15,pb:5,   div:3.2, roe:22,margin:18,de:0.50,revG:3, epsG:4, mom12:-8,beta:0.60,vol:16},
  {ticker:"XOM", name:"Exxon Mobil",             sector:"Energy",           shares:22,cost:100,price:115,pe:11,pb:1.9, div:3.4, roe:17,margin:10,de:0.25,revG:2, epsG:-5,mom12:8, beta:0.90,vol:28},
  {ticker:"KO",  name:"Coca-Cola",               sector:"Consumer Staples", shares:40,cost:58, price:62, pe:24,pb:10,  div:3.0, roe:40,margin:23,de:1.6, revG:4, epsG:5, mom12:6, beta:0.55,vol:14},
];

const TOOLTIP_STYLE = {
  background: "#0e3052", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12, fontSize: 12, color: "#f4f7fa",
};

// ── Persistence ───────────────────────────────────────────────

function loadHoldings(): PHolding[] {
  try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s); } catch {}
  return SAMPLE;
}
function saveHoldings(h: PHolding[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(h)); } catch {}
}

// ── Math helpers ──────────────────────────────────────────────

const n0    = (n: number) => (Number.isFinite(n) ? n : 0);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const band  = (x: number, lo: number, hi: number) => (Number.isFinite(x) ? clamp(((x - lo) / (hi - lo)) * 100, 0, 100) : 0);

function rowCalc(h: PHolding) {
  const value = n0(h.shares) * n0(h.price);
  const basis = n0(h.shares) * n0(h.cost);
  const gain  = value - basis;
  return { value, basis, gain, gainPct: basis ? (gain / basis) * 100 : 0 };
}

function portfolioTotals(hs: PHolding[]) {
  return hs.reduce((t, h) => { const c = rowCalc(h); t.value += c.value; t.basis += c.basis; t.gain += c.gain; return t; }, { value: 0, basis: 0, gain: 0 });
}

function holdingWeights(hs: PHolding[]) {
  const tot = hs.reduce((s, h) => s + n0(h.shares) * n0(h.price), 0) || 1;
  return hs.map(h => (n0(h.shares) * n0(h.price)) / tot);
}

function factorScores(h: PHolding) {
  const peS  = n0(h.pe) <= 0 ? 0 : band(h.pe, 40, 8);
  const pbS  = n0(h.pb) <= 0 ? 0 : band(h.pb, 8, 1);
  const value = 0.5 * peS + 0.3 * pbS + 0.2 * band(h.div, 0, 4);
  const quality = 0.4 * band(h.roe, 0, 25) + 0.35 * band(h.margin, 0, 25) + 0.25 * band(Math.max(0, n0(h.de)), 2.5, 0.2);
  const momentum = band(h.mom12, -30, 40);
  const growth = 0.5 * band(h.revG, 0, 30) + 0.5 * band(h.epsG, 0, 30);
  return { value, quality, momentum, growth };
}

function compositeScore(h: PHolding, fw: FactorWeights) {
  const f = factorScores(h);
  const s = (fw.value + fw.quality + fw.momentum + fw.growth) || 1;
  return (f.value * fw.value + f.quality * fw.quality + f.momentum * fw.momentum + f.growth * fw.growth) / s;
}

function calcRisk(hs: PHolding[], rho: number) {
  const w = holdingWeights(hs), sig = hs.map(h => n0(h.vol) / 100), n = hs.length;
  let varP = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      varP += w[i] * w[j] * sig[i] * sig[j] * (i === j ? 1 : rho);
  const volP = Math.sqrt(Math.max(varP, 0));
  const contrib = hs.map((_, i) => { let s = 0; for (let j = 0; j < n; j++) s += w[j] * sig[i] * sig[j] * (i === j ? 1 : rho); return volP > 0 ? w[i] * s / volP : 0; });
  const hhi = w.reduce((s, x) => s + x * x, 0);
  const beta = hs.reduce((s, h, i) => s + w[i] * n0(h.beta), 0);
  const sec: Record<string, number> = {};
  hs.forEach((h, i) => { sec[h.sector] = (sec[h.sector] || 0) + w[i]; });
  const sorted = [...w].sort((a, b) => b - a);
  return { volP, contrib, w, effN: hhi ? 1 / hhi : 0, beta, sec, top1: sorted[0] ?? 0, top3: sorted.slice(0, 3).reduce((s, x) => s + x, 0) };
}

function gauss() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function runGBM(V0: number, mu: number, sg: number, yrs: number, contrib: number) {
  const sims = 1000, dt = 1 / 12, steps = yrs * 12;
  const drift = (mu - sg * sg / 2) * dt, vstep = sg * Math.sqrt(dt), cm = contrib / 12;
  const cols: number[][] = Array.from({ length: steps + 1 }, () => new Array(sims));
  for (let s = 0; s < sims; s++) {
    let V = V0; cols[0][s] = V0;
    for (let m = 1; m <= steps; m++) { V = V * Math.exp(drift + vstep * gauss()) + cm; cols[m][s] = V; }
  }
  const pctile = (arr: number[], p: number) => arr[clamp(Math.floor(p * (arr.length - 1)), 0, arr.length - 1)];
  const points: { t: number; p10: number; p50: number; p90: number; diff: number }[] = [];
  for (let m = 0; m <= steps; m++) {
    if (m % 3 !== 0 && m !== steps) continue;
    const col = cols[m].slice().sort((a, b) => a - b);
    const p10 = pctile(col, 0.10), p50 = pctile(col, 0.50), p90 = pctile(col, 0.90);
    points.push({ t: +(m / 12).toFixed(2), p10, p50, p90, diff: p90 - p10 });
  }
  const finals = cols[steps].slice().sort((a, b) => a - b);
  return { points, fp10: pctile(finals, 0.10), fp50: pctile(finals, 0.50), fp90: pctile(finals, 0.90), belowStart: finals.filter(v => v < V0).length / sims * 100, V0, yrs };
}

const scoreColor = (s: number) => `hsl(250,75%,${(38 + clamp(s, 0, 100) / 100 * 30).toFixed(0)}%)`;

type SubTab = "overview" | "scores" | "risk" | "projection";

// ── Component ─────────────────────────────────────────────────

export function PortfolioScreen({ onToast }: { onToast: (m: string) => void }) {
  const [holdings, setHoldingsRaw] = useState<PHolding[]>(loadHoldings);
  const [subTab, setSubTab]   = useState<SubTab>("overview");
  const [allocMode, setAllocMode] = useState<"holding" | "sector">("holding");
  const [fw, setFw] = useState<FactorWeights>({ value: 25, quality: 25, momentum: 25, growth: 25 });
  const [rho, setRho] = useState(0.40);
  const [editMode, setEditMode] = useState(false);
  const [status, setStatus] = useState<{ text: string; state: "idle" | "busy" | "live" }>({ text: "Sample data", state: "idle" });

  // Projection state
  const [pRet,    setPRet]    = useState(7);
  const [pVol,    setPVol]    = useState<number | null>(null);
  const [pYears,  setPYears]  = useState(10);
  const [pContrib, setPContrib] = useState(0);
  const [sim, setSim] = useState<ReturnType<typeof runGBM> | null>(null);

  const setHoldings = useCallback((next: PHolding[] | ((p: PHolding[]) => PHolding[])) => {
    setHoldingsRaw(prev => { const u = typeof next === "function" ? next(prev) : next; saveHoldings(u); return u; });
  }, []);

  const t     = useMemo(() => portfolioTotals(holdings), [holdings]);
  const ws    = useMemo(() => holdingWeights(holdings), [holdings]);
  const risk  = useMemo(() => calcRisk(holdings, rho), [holdings, rho]);
  const totalPct = t.basis ? (t.gain / t.basis) * 100 : 0;

  // Holdings management
  function updateHolding(i: number, field: keyof PHolding, raw: string) {
    setHoldings(prev => {
      const next = [...prev];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (next[i] as any)[field] = (field === "ticker" || field === "name" || field === "sector") ? raw : (parseFloat(raw) || 0);
      return next;
    });
  }

  function addHolding() {
    setHoldings(prev => [...prev, { ticker: "", name: "", sector: "Other", shares: 0, cost: 0, price: 0, pe: 0, pb: 0, div: 0, roe: 0, margin: 0, de: 0, revG: 0, epsG: 0, mom12: 0, beta: 1, vol: 20 }]);
    setEditMode(true);
  }

  // Live prices
  async function fetchLive() {
    setStatus({ text: "Fetching…", state: "busy" });
    let ok = 0;
    const updated = [...holdings];
    for (let i = 0; i < updated.length; i++) {
      const h = updated[i]; if (!h.ticker) continue;
      try {
        const r = await fetch(`https://stooq.com/q/l/?s=${h.ticker.toLowerCase()}.us&f=sd2t2ohlcv&h&e=csv`, { signal: AbortSignal.timeout(7000) });
        if (!r.ok) throw new Error();
        const close = parseFloat((await r.text()).trim().split("\n")[1].split(",")[6]);
        if (close > 0) { updated[i] = { ...h, price: close }; ok++; }
      } catch {}
    }
    if (ok > 0) {
      setHoldings(updated); setSim(null);
      setStatus({ text: `Live · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, state: "live" });
      onToast(`Updated ${ok} price${ok > 1 ? "s" : ""} ✓`);
    } else {
      setStatus({ text: "Sample data", state: "idle" });
      onToast("Couldn't reach a price source from here — edit prices directly.");
    }
  }

  // CSV export
  function exportCSV() {
    const head = ["Ticker","Name","Sector","Shares","Avg Cost","Price","Market Value","Gain/Loss","Gain %","Beta","Vol%"];
    const rows = holdings.map(h => { const c = rowCalc(h); return [h.ticker, `"${h.name}"`, `"${h.sector}"`, h.shares, h.cost, h.price, c.value.toFixed(2), c.gain.toFixed(2), c.gainPct.toFixed(2), h.beta, h.vol].join(","); });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([[head.join(","), ...rows].join("\n")], { type: "text/csv" }));
    a.download = "portfolio.csv"; a.click(); URL.revokeObjectURL(a.href);
  }

  // Chart data
  const allocData = useMemo(() => {
    if (allocMode === "sector") {
      const m: Record<string, number> = {};
      holdings.forEach(h => { m[h.sector] = (m[h.sector] || 0) + rowCalc(h).value; });
      return Object.entries(m).map(([name, value]) => ({ name, value }));
    }
    return holdings.map(h => ({ name: h.ticker || "?", value: rowCalc(h).value }));
  }, [holdings, allocMode]);

  const gainData  = useMemo(() => holdings.map(h => { const c = rowCalc(h); return { name: h.ticker || "?", gain: c.gain }; }), [holdings]);

  const scoreData = useMemo(() =>
    holdings.map(h => ({ name: h.ticker || "?", score: +compositeScore(h, fw).toFixed(1), ...factorScores(h) }))
      .sort((a, b) => b.score - a.score),
    [holdings, fw]);

  const riskData = useMemo(() => {
    const total = risk.contrib.reduce((s, x) => s + x, 0) || 1;
    return holdings.map((h, i) => ({ name: h.ticker || "?", pct: +(risk.contrib[i] / total * 100).toFixed(1) }))
      .sort((a, b) => b.pct - a.pct);
  }, [holdings, risk]);

  const sectorData = useMemo(() =>
    Object.entries(risk.sec).map(([name, v]) => ({ name, value: +(v * 100).toFixed(1) })),
    [risk]);

  const autoVol = +(risk.volP * 100).toFixed(1);

  function runProjection() {
    const mu = pRet / 100, sg = Math.max(0, (pVol ?? autoVol) / 100);
    setSim(runGBM(t.value, mu, sg, clamp(Math.round(pYears), 1, 40), pContrib));
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="animate-fade-up space-y-5 px-4 pb-6 pt-2">

      {/* Header */}
      <header className="flex items-center gap-3 px-1 pt-1">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-white">Stocks</h1>
          <p className="text-[13px] text-white/45">Factor screening & risk analysis</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={fetchLive}
            className={cx(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
              status.state === "live"  && "border-up/40 bg-up/10 text-up",
              status.state === "busy"  && "border-brass/40  bg-brass/10  text-brass",
              status.state === "idle"  && "border-white/10        bg-white/[0.04]   text-white/50",
            )}
          >
            <RefreshCw size={11} className={cx(status.state === "busy" && "animate-spin")} />
            {status.text}
          </button>
          <button onClick={exportCSV} className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.05] text-white/50 active:scale-90" title="Export CSV">
            <Download size={14} />
          </button>
        </div>
      </header>

      {/* Sub-tabs */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto rounded-full bg-white/[0.05] p-1">
        {(["overview", "scores", "risk", "projection"] as SubTab[]).map(tab => (
          <button key={tab} onClick={() => setSubTab(tab)}
            className={cx("min-w-fit flex-1 whitespace-nowrap rounded-full px-3 py-2 text-[12px] font-semibold capitalize transition",
              subTab === tab ? "bg-white text-black" : "text-white/50")}>
            {tab}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {subTab === "overview" && (
        <>
          {/* Hero */}
          <Card className="bg-gradient-to-br from-brass/10 to-transparent p-5">
            <p className="text-[12px] font-medium text-white/45">Total market value</p>
            <p className="mt-1 text-[38px] font-bold tracking-tight text-white tabular-nums">{usdCompact(t.value)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums",
                t.gain >= 0 ? "bg-up/12 text-up" : "bg-down/12 text-down")}>
                {t.gain >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {signedUsd(t.gain)} ({totalPct >= 0 ? "+" : ""}{totalPct.toFixed(1)}%)
              </span>
              <span className="text-[12px] text-white/40">total return</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-4">
              <div><p className="text-[11px] text-white/40">Cost basis</p><p className="text-[15px] font-bold tabular-nums text-white">{usdCompact(t.basis)}</p></div>
              <div><p className="text-[11px] text-white/40">Holdings</p><p className="text-[15px] font-bold tabular-nums text-white">{holdings.length}</p></div>
            </div>
          </Card>

          {/* Holdings list */}
          <section>
            <SectionTitle
              right={
                <div className="flex items-center gap-3">
                  <button onClick={() => setEditMode(m => !m)}
                    className={cx("flex items-center gap-1 text-[12px] font-semibold", editMode ? "text-brass" : "text-white/40")}>
                    <Pencil size={11} />{editMode ? "Done" : "Edit"}
                  </button>
                  <button onClick={addHolding} className="flex items-center gap-1 text-[12px] font-semibold text-brass">
                    <Plus size={12} />Add
                  </button>
                </div>
              }
            >
              Holdings
            </SectionTitle>
            <Card className="divide-y divide-white/[0.04]">
              {holdings.length === 0 && (
                <p className="p-5 text-center text-[13px] text-white/40">No holdings — tap Add to get started.</p>
              )}
              {holdings.map((h, i) => {
                const c = rowCalc(h);
                return (
                  <div key={i} className="p-4">
                    {editMode ? (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <input className="w-20 rounded-lg bg-white/[0.06] px-2 py-1.5 text-[13px] font-bold uppercase text-white focus:outline-none focus:ring-1 focus:ring-brass"
                            value={h.ticker} onChange={e => updateHolding(i, "ticker", e.target.value)} placeholder="TICK" />
                          <button onClick={() => setHoldings(p => p.filter((_, j) => j !== i))} className="text-white/25 hover:text-down active:scale-90"><X size={16} /></button>
                        </div>
                        <input className="w-full rounded-lg bg-white/[0.06] px-2 py-1.5 text-[12px] text-white/70 focus:outline-none focus:ring-1 focus:ring-brass"
                          value={h.name} onChange={e => updateHolding(i, "name", e.target.value)} placeholder="Company name" />
                        <input className="w-full rounded-lg bg-white/[0.06] px-2 py-1.5 text-[12px] text-white/70 focus:outline-none focus:ring-1 focus:ring-brass"
                          value={h.sector} onChange={e => updateHolding(i, "sector", e.target.value)} placeholder="Sector" />
                        <div className="grid grid-cols-3 gap-2">
                          {([["shares","Shares"],["cost","Avg cost $"],["price","Price $"]] as const).map(([f, label]) => (
                            <div key={f}>
                              <p className="mb-1 text-[10px] text-white/35">{label}</p>
                              <input type="number" step="any"
                                className="w-full rounded-lg bg-white/[0.06] px-2 py-1.5 text-[12px] text-white tabular-nums focus:outline-none focus:ring-1 focus:ring-brass"
                                value={h[f]} onChange={e => updateHolding(i, f, e.target.value)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-[15px] font-bold uppercase text-white">{h.ticker || "?"}</span>
                              <span className="truncate text-[12px] text-white/40">{h.name}</span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-white/30">{h.sector} · {(ws[i] * 100).toFixed(1)}%</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[15px] font-bold tabular-nums text-white">{usdCompact(c.value)}</p>
                            <p className={cx("text-[12px] font-semibold tabular-nums", c.gain >= 0 ? "text-up" : "text-down")}>
                              {signedUsd(c.gain)} ({c.gainPct >= 0 ? "+" : ""}{c.gainPct.toFixed(1)}%)
                            </p>
                          </div>
                        </div>
                        <p className="mt-1.5 text-[11px] text-white/25 tabular-nums">{h.shares} sh × ${h.price} · cost ${h.cost}/sh</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          </section>

          {/* Charts */}
          <Card className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-white">Allocation</h3>
              <div className="flex rounded-xl bg-white/[0.05] p-0.5">
                {(["holding", "sector"] as const).map(m => (
                  <button key={m} onClick={() => setAllocMode(m)}
                    className={cx("rounded-lg px-3 py-1 text-[11px] font-semibold capitalize transition",
                      allocMode === m ? "bg-brass/30 text-brass" : "text-white/40")}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={allocData} dataKey="value" cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={2}>
                  {allocData.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [usd(v), ""]} />
                <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11, color: TICK_COL }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-4">
            <h3 className="mb-4 text-[14px] font-semibold text-white">Gain / Loss</h3>
            <ResponsiveContainer width="100%" height={Math.max(160, holdings.length * 36 + 24)}>
              <BarChart layout="vertical" data={gainData} margin={{ top: 0, right: 55, bottom: 0, left: 0 }}>
                <CartesianGrid horizontal={false} stroke={GRID_COL} />
                <XAxis type="number" tick={{ fill: TICK_COL, fontSize: 10 }} tickFormatter={v => usdCompact(+v)} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: TICKY_COL, fontSize: 11, fontWeight: 600 }} width={40} axisLine={false} tickLine={false} />
                <ReferenceLine x={0} stroke="rgba(255,255,255,0.2)" />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [usd(v), "Gain/Loss"]} />
                <Bar dataKey="gain" radius={4} label={{ position: "right", fill: TICK_COL, fontSize: 10, formatter: (v: number) => usdCompact(v) }}>
                  {gainData.map((e, i) => <Cell key={i} fill={e.gain >= 0 ? GAIN_COL : LOSS_COL} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Insights */}
          {holdings.length > 0 && (() => {
            const wc = holdings.map((h, i) => ({ h, c: rowCalc(h), w: ws[i] }));
            const best  = wc.reduce((a, b) => b.c.gainPct > a.c.gainPct ? b : a);
            const worst = wc.reduce((a, b) => b.c.gainPct < a.c.gainPct ? b : a);
            const top   = wc.reduce((a, b) => b.c.value   > a.c.value   ? b : a);
            return (
              <section>
                <SectionTitle>Insights</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Total return",     big: `${totalPct >= 0 ? "+" : ""}${totalPct.toFixed(1)}%`, sub: signedUsd(t.gain), pos: t.gain >= 0 ? true : false },
                    { label: "Best performer",   big: best.h.ticker  || "—", sub: `+${best.c.gainPct.toFixed(1)}%`,  pos: true  },
                    { label: "Worst performer",  big: worst.h.ticker || "—", sub: `${worst.c.gainPct.toFixed(1)}%`, pos: false },
                    { label: "Largest position", big: top.h.ticker   || "—", sub: `${(top.w * 100).toFixed(1)}% of portfolio`, pos: null },
                  ].map(({ label, big, sub, pos }) => (
                    <Card key={label} className="p-3.5">
                      <p className="text-[11px] text-white/40">{label}</p>
                      <p className={cx("mt-1 text-[20px] font-bold leading-none tabular-nums",
                        pos === true ? "text-up" : pos === false ? "text-down" : "text-white")}>
                        {big}
                      </p>
                      <p className="mt-1 text-[11px] text-white/40 tabular-nums">{sub}</p>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })()}
        </>
      )}

      {/* ── SCORES ── */}
      {subTab === "scores" && (
        <>
          <Card className="p-5">
            <h3 className="mb-1 text-[14px] font-semibold text-white">Factor weights</h3>
            <p className="mb-5 text-[12px] text-white/40">Tilt the composite toward what matters to you.</p>
            <div className="space-y-4">
              {(["value","quality","momentum","growth"] as const).map(k => {
                const total = (fw.value + fw.quality + fw.momentum + fw.growth) || 1;
                return (
                  <div key={k}>
                    <div className="mb-1.5 flex justify-between">
                      <span className="text-[13px] capitalize text-white/70">{k}</span>
                      <span className="text-[13px] font-bold tabular-nums text-brass">{Math.round(fw[k] / total * 100)}%</span>
                    </div>
                    <input type="range" min={0} max={100} value={fw[k]}
                      onChange={e => setFw(p => ({ ...p, [k]: +e.target.value }))}
                      className="h-1 w-full cursor-pointer accent-brass" />
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="mb-1 text-[14px] font-semibold text-white">Composite ranking</h3>
            <p className="mb-4 text-[12px] text-white/40">Higher screens better on your weights.</p>
            <ResponsiveContainer width="100%" height={Math.max(160, scoreData.length * 36 + 24)}>
              <BarChart layout="vertical" data={scoreData} margin={{ top: 0, right: 45, bottom: 0, left: 0 }}>
                <CartesianGrid horizontal={false} stroke={GRID_COL} />
                <XAxis type="number" domain={[0,100]} tick={{ fill: TICK_COL, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: TICKY_COL, fontSize: 11, fontWeight: 600 }} width={40} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v.toFixed(0), "Score"]} />
                <Bar dataKey="score" radius={4} label={{ position: "right", fill: TICK_COL, fontSize: 10, formatter: (v: number) => v.toFixed(0) }}>
                  {scoreData.map((e, i) => <Cell key={i} fill={scoreColor(e.score)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Score table */}
            <div className="-mx-1 mt-4 overflow-x-auto">
              <table className="min-w-full text-[12px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {["Ticker","Composite","Value","Quality","Momentum","Growth"].map(h => (
                      <th key={h} className={cx("pb-2 font-semibold text-white/35", h === "Ticker" ? "pr-3 text-left" : "px-2 text-right")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scoreData.map(r => (
                    <tr key={r.name} className="border-b border-white/[0.03]">
                      <td className="py-2 pr-3 font-bold uppercase text-white">{r.name}</td>
                      {[r.score, r.value, r.quality, r.momentum, r.growth].map((v, vi) => (
                        <td key={vi} className="px-2 py-2 text-right tabular-nums" style={{ color: scoreColor(v) }}>{v.toFixed(0)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="mb-1 text-[14px] font-semibold text-white">Scoring inputs</h3>
            <p className="mb-4 text-[12px] text-white/40">Edit to see scores update live.</p>
            <div className="-mx-1 overflow-x-auto">
              <table className="min-w-full text-[11px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {["Ticker","P/E","P/B","Div%","ROE%","Margin%","D/E","RevG%","EPSG%","12mo%"].map(h => (
                      <th key={h} className={cx("pb-2 font-semibold text-white/35", h === "Ticker" ? "pr-2 text-left" : "px-1 text-right")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h, i) => (
                    <tr key={i} className="border-b border-white/[0.03]">
                      <td className="py-1.5 pr-2 font-bold uppercase text-white">{h.ticker || "?"}</td>
                      {(["pe","pb","div","roe","margin","de","revG","epsG","mom12"] as const).map(f => (
                        <td key={f} className="px-1 py-1">
                          <input type="number" step="any"
                            className="w-14 rounded-lg bg-white/[0.06] px-1.5 py-1 text-right text-[11px] text-white tabular-nums focus:outline-none focus:ring-1 focus:ring-brass"
                            value={h[f]} onChange={e => updateHolding(i, f, e.target.value)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ── RISK ── */}
      {subTab === "risk" && (
        <>
          <Card className="p-5">
            <h3 className="mb-4 text-[14px] font-semibold text-white">Concentration & exposure</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label:"Effective holdings", big:risk.effN.toFixed(1),            sub:`of ${holdings.length} (1/HHI)` },
                { label:"Top position",        big:`${(risk.top1*100).toFixed(1)}%`, sub:"largest weight" },
                { label:"Top 3 weight",        big:`${(risk.top3*100).toFixed(1)}%`, sub:"concentration" },
                { label:"Portfolio beta",      big:risk.beta.toFixed(2),            sub:"vs market = 1.00" },
                { label:"Est. volatility",     big:`${(risk.volP*100).toFixed(1)}%`, sub:`annual, ρ=${rho.toFixed(2)}` },
                (() => { const [sec, v] = Object.entries(risk.sec).sort((a,b)=>b[1]-a[1])[0] ?? ["—",0]; return { label:"Top sector", big:sec, sub:`${(v*100).toFixed(1)}%` }; })(),
              ].map(({ label, big, sub }) => (
                <Card key={label} className="border-white/[0.04] p-3.5">
                  <p className="text-[11px] text-white/40">{label}</p>
                  <p className="mt-1 text-[18px] font-bold text-white">{big}</p>
                  <p className="mt-0.5 text-[11px] text-white/35">{sub}</p>
                </Card>
              ))}
            </div>
            <div className="mt-5">
              <div className="mb-2 flex justify-between text-[12px]">
                <span className="text-white/50">Avg correlation (ρ)</span>
                <span className="font-bold tabular-nums text-brass">{rho.toFixed(2)}</span>
              </div>
              <input type="range" min={0} max={90} value={Math.round(rho*100)}
                onChange={e => setRho(+e.target.value / 100)}
                className="h-1 w-full cursor-pointer accent-brass" />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-white/30">
              σ² = ΣΣ wᵢwⱼσᵢσⱼρ (ρ=1 on diagonal). Rough estimate — real pair correlations shift over time.
            </p>
          </Card>

          <Card className="p-4">
            <h3 className="mb-4 text-[14px] font-semibold text-white">Risk contribution</h3>
            <p className="mb-2 text-[12px] text-white/40">Share of portfolio volatility</p>
            <ResponsiveContainer width="100%" height={Math.max(160, riskData.length * 36 + 24)}>
              <BarChart layout="vertical" data={riskData} margin={{ top: 0, right: 45, bottom: 0, left: 0 }}>
                <CartesianGrid horizontal={false} stroke={GRID_COL} />
                <XAxis type="number" tick={{ fill: TICK_COL, fontSize: 10 }} tickFormatter={v => `${v}%`} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: TICKY_COL, fontSize: 11, fontWeight: 600 }} width={40} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v.toFixed(1)}%`, "Risk share"]} />
                <Bar dataKey="pct" fill={ACCENT_COL} radius={4} label={{ position: "right", fill: TICK_COL, fontSize: 10, formatter: (v: number) => `${v.toFixed(0)}%` }} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-4">
            <h3 className="mb-4 text-[14px] font-semibold text-white">Sector weight</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={sectorData} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {sectorData.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v.toFixed(1)}%`, ""]} />
                <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11, color: TICK_COL }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-4">
            <h3 className="mb-1 text-[14px] font-semibold text-white">Risk inputs</h3>
            <p className="mb-4 text-[12px] text-white/40">Per-holding beta & annual volatility %</p>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {["Ticker","Beta","Volatility %"].map(h => (
                      <th key={h} className={cx("pb-2 font-semibold text-white/35", h === "Ticker" ? "pr-3 text-left" : "px-2 text-right")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h, i) => (
                    <tr key={i} className="border-b border-white/[0.03]">
                      <td className="py-1.5 pr-3 font-bold uppercase text-white">{h.ticker || "?"}</td>
                      {(["beta","vol"] as const).map(f => (
                        <td key={f} className="px-2 py-1 text-right">
                          <input type="number" step="any"
                            className="w-16 rounded-lg bg-white/[0.06] px-2 py-1 text-right text-[11px] text-white tabular-nums focus:outline-none focus:ring-1 focus:ring-brass"
                            value={h[f]} onChange={e => updateHolding(i, f, e.target.value)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ── PROJECTION ── */}
      {subTab === "projection" && (
        <>
          <div className="rounded-2xl border border-brass/25 bg-brass/[0.08] p-4 text-[12px] leading-relaxed text-brass/80">
            <strong className="text-brass">Illustrative only.</strong> This simulates outcomes from your assumptions — not a forecast, recommendation, or promise. Markets can and do lose money.
          </div>

          <Card className="p-5">
            <h3 className="mb-4 text-[14px] font-semibold text-white">Assumptions</h3>
            <div className="grid grid-cols-2 gap-3">
              {([
                { label: "Expected return % / yr", val: pRet,    set: setPRet    },
                { label: `Volatility % / yr${pVol === null ? " (auto)" : ""}`, val: pVol ?? autoVol, set: (v: number) => setPVol(v) },
                { label: "Horizon (years)",         val: pYears,  set: setPYears  },
                { label: "Added per year ($)",       val: pContrib,set: setPContrib },
              ] as const).map(({ label, val, set }) => (
                <div key={label}>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</label>
                  <input type="number" step="any"
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] text-white tabular-nums focus:border-brass focus:outline-none"
                    value={val} onChange={e => set(parseFloat(e.target.value) || 0)} />
                </div>
              ))}
            </div>
            <button onClick={runProjection}
              className="mt-4 w-full rounded-2xl bg-gradient-to-b from-brass to-brass py-3 text-[14px] font-bold text-white shadow-lg shadow-brass/40 active:scale-[0.98]">
              Run projection
            </button>
          </Card>

          {!sim && (
            <Card className="p-8 text-center text-[13px] text-white/35">
              Set your assumptions above and tap <strong className="text-white/60">Run projection</strong> to simulate 1,000 paths.
            </Card>
          )}

          {sim && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Median outcome",  big: usdCompact(sim.fp50), sub: `in ${sim.yrs} yr (50th pct)` },
                  { label: "Downside (10th)", big: usdCompact(sim.fp10), sub: "1-in-10 worse" },
                  { label: "Upside (90th)",   big: usdCompact(sim.fp90), sub: "1-in-10 better" },
                  { label: "Below today",     big: `${sim.belowStart.toFixed(0)}%`, sub: `paths under ${usdCompact(sim.V0)}` },
                ].map(({ label, big, sub }) => (
                  <Card key={label} className="p-3.5">
                    <p className="text-[11px] text-white/40">{label}</p>
                    <p className="mt-1 text-[18px] font-bold tabular-nums text-white">{big}</p>
                    <p className="mt-0.5 text-[11px] text-white/35">{sub}</p>
                  </Card>
                ))}
              </div>

              <Card className="p-4">
                <h3 className="mb-4 text-[14px] font-semibold text-white">Simulated paths</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={sim.points} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid stroke={GRID_COL} vertical={false} />
                    <XAxis dataKey="t" tick={{ fill: TICK_COL, fontSize: 10 }} tickFormatter={v => `${v}y`} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: TICK_COL, fontSize: 10 }} tickFormatter={v => usdCompact(+v)} axisLine={false} tickLine={false} width={55} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelFormatter={v => `Year ${v}`}
                      formatter={(v: number, name: string) => {
                        if (name === "p10" || name === "diff") return [null, null];
                        return [usd(v), "Median"];
                      }}
                    />
                    {/* Band: invisible base (p10) + visible fill (diff = p90-p10) */}
                    <Area type="monotone" dataKey="p10" stackId="band" stroke="none" fillOpacity={0} />
                    <Area type="monotone" dataKey="diff" stackId="band" stroke="none" fill="rgba(124,108,245,0.18)" />
                    {/* Median */}
                    <Line type="monotone" dataKey="p50" stroke={ACCENT_COL} strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
                <p className="mt-3 text-[11px] leading-relaxed text-white/30">
                  1,000 GBM paths, monthly steps, lognormal returns. Band = 10th–90th percentile. The spread is the point.
                </p>
              </Card>
            </>
          )}
        </>
      )}

    </div>
  );
}
