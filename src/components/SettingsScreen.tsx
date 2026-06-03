import { useState } from "react";
import {
  RefreshCw,
  Trash2,
  RotateCcw,
  Share,
  ChevronRight,
  Check,
  Landmark,
} from "lucide-react";
import type { Business } from "../types";
import type { DataSource } from "../data/source";
import { clearImported } from "../data/source";
import { clearOverrides } from "../data/overrides";
import { readRemoved, clearRemoved } from "../data/removed";
import { RATES_TO_USD, setRateToUSD, resetRates } from "../lib/currency";
import { longDate, shortDate, daysAgo } from "../lib/format";
import { Card, SectionTitle, cx } from "./ui";
import { HelmMark } from "./Brand";

export function SettingsScreen({
  owner,
  businesses,
  dataSource,
  asOf,
  onReload,
  onToast,
}: {
  owner: string;
  businesses: Business[];
  dataSource: DataSource;
  asOf: string;
  onReload: () => void;
  onToast: (m: string) => void;
}) {
  const [cad, setCad] = useState(String(RATES_TO_USD.CAD));
  const removedCount = readRemoved().length;
  const live = dataSource === "real";
  const lag = asOf ? daysAgo(asOf) : 0;
  const freshness = !asOf
    ? "—"
    : lag <= 0
      ? "as of today"
      : lag === 1
        ? "as of yesterday"
        : `as of ${shortDate(asOf)}`;

  function saveFx() {
    const r = parseFloat(cad);
    if (!(r > 0)) {
      onToast("Enter a valid rate");
      return;
    }
    setRateToUSD("CAD", r);
    onReload();
    onToast("FX rate updated ✓");
  }

  return (
    <div className="animate-fade-up space-y-7 px-4 pb-6 pt-2">
      {/* Profile */}
      <header className="flex items-center gap-3.5 px-1 pt-1">
        <div
          className="grid h-14 w-14 place-items-center rounded-full text-[22px] font-bold text-white shadow-lg"
          style={{ background: "linear-gradient(135deg,#8b5cf6,#4f46e5)" }}
        >
          {owner[0]}
        </div>
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-white">{owner}</h1>
          <p className="text-[13px] text-white/45">
            Owner · {businesses.length} {businesses.length === 1 ? "business" : "businesses"}
          </p>
        </div>
      </header>

      {/* Data status */}
      <section>
        <SectionTitle>Data</SectionTitle>
        <Card className="divide-y divide-white/[0.05]">
          <div className="flex items-center gap-3 p-4">
            <span className={cx("h-2.5 w-2.5 rounded-full", live ? "bg-emerald-400" : "bg-amber-400")} />
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-white">{live ? "Live data" : "Sample data"}</p>
              <p className="text-[12px] text-white/40">
                {live ? `Connected · ${freshness}` : "Demo numbers — connect a source to go live"}
              </p>
            </div>
            <button
              onClick={() => {
                onReload();
                onToast("Refreshed ✓");
              }}
              className="flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 py-2 text-[12px] font-semibold text-white active:scale-95"
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          {businesses.map((b) => (
            <div key={b.id} className="flex items-center gap-3 p-4">
              <span
                className="grid h-8 w-8 place-items-center rounded-lg text-[12px] font-bold"
                style={{ background: `${b.accent}22`, color: b.accent }}
              >
                {b.name[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-white">{b.name}</p>
                <p className="text-[11px] text-white/40">
                  {b.type === "portfolio"
                    ? `${b.holdings?.length ?? 0} holdings`
                    : `through ${b.series.at(-1) ? shortDate(b.series.at(-1)!.date) : "—"}`}
                </p>
              </div>
              {b.currency && b.currency !== "USD" && (
                <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-bold text-white/60">
                  {b.currency}
                </span>
              )}
            </div>
          ))}
        </Card>
      </section>

      {/* Currency */}
      <section>
        <SectionTitle>Display &amp; currency</SectionTitle>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Landmark size={15} className="text-white/45" />
            <p className="text-[13px] font-medium text-white/80">Exchange rate</p>
            <span className="ml-auto text-[12px] text-white/40">Totals shown in USD</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[14px] font-semibold text-white/70">1 CAD =</span>
            <div className="flex items-center rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2">
              <span className="text-[15px] font-semibold text-white/50">$</span>
              <input
                value={cad}
                onChange={(e) => setCad(e.target.value)}
                inputMode="decimal"
                className="w-16 bg-transparent text-[15px] font-semibold text-white outline-none"
              />
            </div>
            <button
              onClick={saveFx}
              className="ml-auto rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black active:scale-95"
            >
              Save
            </button>
          </div>
          <p className="mt-2 text-[11px] text-white/35">
            Your Subway reports in CAD; everything is converted to USD for combined totals. Swap for a live
            feed later.
          </p>
        </Card>
      </section>

      {/* Manage data */}
      <section>
        <SectionTitle>Your data</SectionTitle>
        <Card className="divide-y divide-white/[0.05]">
          <Row
            icon={RotateCcw}
            label="Reset economics to defaults"
            sub="Clears your capital / margin edits"
            onClick={() => {
              clearOverrides();
              onReload();
              onToast("Economics reset ✓");
            }}
          />
          {removedCount > 0 && (
            <Row
              icon={RotateCcw}
              label="Restore removed businesses"
              sub={`Bring back ${removedCount} you removed`}
              onClick={() => {
                clearRemoved();
                onReload();
                onToast("Removed businesses restored ✓");
              }}
            />
          )}
          <Row
            icon={Trash2}
            label="Remove imported & synced data"
            sub="Back to connected/sample sources"
            danger
            onClick={() => {
              clearImported();
              onReload();
              onToast("Imported data removed ✓");
            }}
          />
        </Card>
      </section>

      {/* Install */}
      <section>
        <SectionTitle>Install</SectionTitle>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Share size={15} className="text-violet-300" />
            <p className="text-[13px] font-semibold text-white">Add Helm to your home screen</p>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-white/50">
            <b className="text-white/70">iPhone:</b> tap the Share button, then "Add to Home Screen."{" "}
            <b className="text-white/70">Android:</b> tap the ⋮ menu, then "Install app." Helm opens full-screen,
            like a native app.
          </p>
        </Card>
      </section>

      <div className="flex flex-col items-center gap-2 pb-1 pt-3">
        <HelmMark size={24} className="text-white/25" />
        <p className="text-[11px] text-white/25">Helm · your AI COO · v0.5</p>
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  sub,
  danger,
  onClick,
}: {
  icon: typeof Trash2;
  label: string;
  sub: string;
  danger?: boolean;
  onClick: () => void;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        onClick();
        setDone(true);
        window.setTimeout(() => setDone(false), 1500);
      }}
      className="flex w-full items-center gap-3 p-4 text-left active:bg-white/[0.02]"
    >
      <Icon size={16} className={danger ? "text-rose-400" : "text-white/50"} />
      <div className="flex-1">
        <p className={cx("text-[13.5px] font-semibold", danger ? "text-rose-300" : "text-white")}>{label}</p>
        <p className="text-[11px] text-white/40">{sub}</p>
      </div>
      {done ? <Check size={16} className="text-emerald-400" strokeWidth={3} /> : <ChevronRight size={16} className="text-white/25" />}
    </button>
  );
}
