import { useEffect, useState } from "react";
import {
  RefreshCw,
  Trash2,
  RotateCcw,
  Share,
  ChevronRight,
  Check,
  Landmark,
  Sparkles,
  Bell,
} from "lucide-react";
import { agentStatus } from "../lib/agent";
import type { Business } from "../types";
import type { DataSource } from "../data/source";
import { clearImported } from "../data/source";
import { clearOverrides } from "../data/overrides";
import { readRemoved, clearRemoved } from "../data/removed";
import { PROFILES, readProfileId, writeProfileId, type ProfileId } from "../data/profiles";
import { RATES_TO_USD, setRateToUSD, resetRates } from "../lib/currency";
import { longDate, shortDate, daysAgo, isoToday } from "../lib/format";
import { Card, SectionTitle, cx } from "./ui";
import { HelmMark } from "./Brand";
import { getFxTimestamp, updateFxRates } from "../lib/fxFeed";

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
  const [fxTimestamp, setFxTimestamp] = useState(getFxTimestamp());
  const [fxLoading, setFxLoading] = useState(false);
  const [brain, setBrain] = useState<{ available: boolean; askModel?: string } | null>(null);
  useEffect(() => {
    let alive = true;
    agentStatus().then((s) => alive && setBrain(s));
    return () => {
      alive = false;
    };
  }, []);
  const [pushOn, setPushOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem("helm:push:v1") === "1";
    } catch {
      return false;
    }
  });
  const [profileId, setProfileId] = useState<ProfileId>(() => readProfileId());
  const removedCount = readRemoved().length;

  function switchProfile(id: ProfileId) {
    if (id === profileId) return;
    writeProfileId(id);
    setProfileId(id);
    onReload();
    onToast(`Switched to ${PROFILES.find((p) => p.id === id)?.label} ✓`);
  }

  async function enablePush() {
    if (typeof Notification === "undefined") {
      onToast("Notifications aren't supported here");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      onToast("Allow notifications to get your morning Brief");
      return;
    }
    try {
      localStorage.setItem("helm:push:v1", "1");
    } catch {
      /* ignore */
    }
    setPushOn(true);
    // Demo: fire the morning Brief notification now so the owner sees the experience.
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const body = "3 things need you today. Tap to open your brief.";
      if (reg) reg.showNotification("Helm — good morning ☀️", { body, tag: "helm-brief" });
      else new Notification("Helm — good morning ☀️", { body });
    } catch {
      /* ignore */
    }
    onToast("Morning Brief alerts on ✓");
  }
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

  async function refreshFx() {
    setFxLoading(true);
    try {
      const ok = await updateFxRates();
      if (ok) {
        setFxTimestamp(getFxTimestamp());
        setCad(String(RATES_TO_USD.CAD));
        onReload();
        onToast("Live rates fetched ✓");
      } else {
        onToast("Couldn't reach rate feed — using cached rates");
      }
    } finally {
      setFxLoading(false);
    }
  }

  const fxAge =
    fxTimestamp === 0
      ? "—"
      : new Date().getTime() - fxTimestamp < 3600000
        ? "just now"
        : new Date().getTime() - fxTimestamp < 86400000
          ? "today"
          : `${daysAgo(isoToday(new Date(fxTimestamp)))}d ago`;

  return (
    <div className="animate-fade-up space-y-7 px-4 pb-6 pt-2">
      {/* Profile */}
      <header className="flex items-center gap-3.5 px-1 pt-1">
        <div
          className="grid h-14 w-14 place-items-center rounded-full text-[22px] font-bold text-white shadow-lg"
          style={{ background: "linear-gradient(135deg,#e0ae49,#0a263e)" }}
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

      {/* Demo persona — preview who Helm adapts to (hospitality switches on with a hotel) */}
      <section>
        <SectionTitle>Demo persona</SectionTitle>
        <Card className="space-y-2 p-3">
          {PROFILES.map((p) => {
            const active = p.id === profileId;
            return (
              <button
                key={p.id}
                onClick={() => switchProfile(p.id)}
                className={cx(
                  "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition",
                  active ? "border-brass/40 bg-brass/[0.09]" : "border-white/[0.06] bg-white/[0.02] active:scale-[0.99]",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-white">{p.label}</p>
                  <p className="truncate text-[12px] text-white/45">{p.sub}</p>
                </div>
                <span
                  className={cx(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                    active ? "border-brass bg-brass" : "border-white/25",
                  )}
                >
                  {active && <Check size={12} className="text-black" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
          <p className="px-1 pt-1 text-[11px] leading-relaxed text-white/35">
            {PROFILES.find((p) => p.id === profileId)?.blurb}
          </p>
        </Card>
      </section>

      {/* Data status */}
      <section>
        <SectionTitle>Data</SectionTitle>
        <Card className="divide-y divide-white/[0.05]">
          <div className="flex items-center gap-3 p-4">
            <span className={cx("h-2.5 w-2.5 rounded-full", live ? "bg-up" : "bg-brass")} />
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

      {/* Intelligence — which brain is answering */}
      <section>
        <SectionTitle>Intelligence</SectionTitle>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <span
              className={cx(
                "grid h-9 w-9 shrink-0 place-items-center rounded-2xl",
                brain?.available ? "bg-brass/15" : "bg-white/[0.06]",
              )}
            >
              <Sparkles size={17} className={brain?.available ? "text-brass" : "text-white/40"} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-white">
                {brain?.available ? "Claude — live" : "Offline — rule engine"}
              </p>
              <p className="text-[12px] text-white/40">
                {brain?.available
                  ? `Brief & Ask Helm reason with ${brain.askModel ?? "Claude"} over your real numbers`
                  : "Smart heuristics over your numbers. Add an Anthropic API key to switch on Claude."}
              </p>
            </div>
            <span
              className={cx(
                "h-2.5 w-2.5 shrink-0 rounded-full",
                brain?.available ? "bg-up" : "bg-brass",
              )}
            />
          </div>
        </Card>
      </section>

      {/* Notifications */}
      <section>
        <SectionTitle>Notifications</SectionTitle>
        <Card className="divide-y divide-white/[0.05]">
          <Row
            icon={Bell}
            label="Morning Brief alert"
            sub={
              pushOn
                ? "On — your top 3 each morning, after the night refresh"
                : "Wake me each morning with what needs me"
            }
            onClick={enablePush}
          />
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
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[11px] text-white/50">Live rates</p>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-white/40">Updated {fxAge}</span>
              <button
                onClick={refreshFx}
                disabled={fxLoading}
                className="flex items-center gap-1.5 rounded-full bg-white/[0.1] px-3 py-1.5 text-[11px] font-semibold text-white/70 active:scale-95 disabled:opacity-50"
              >
                {fxLoading && <RefreshCw size={12} className="animate-spin" />}
                {!fxLoading && "Fetch"}
              </button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-white/35">
            Your Subway reports in CAD; everything is converted to USD for combined totals. Rates auto-update
            on app start.
          </p>
        </Card>
      </section>

      {/* Manage data */}
      <section>
        <SectionTitle>Your data</SectionTitle>
        <Card className="divide-y divide-white/[0.05]">
          <Row
            icon={Sparkles}
            label="Start a fresh demo"
            sub="Clear everything → blank slate to upload into"
            onClick={() => {
              clearImported();
              clearOverrides();
              clearRemoved();
              try {
                localStorage.removeItem("helm:cash:v1");
              } catch {
                /* ignore */
              }
              writeProfileId("blank");
              location.reload();
            }}
          />
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
            <Share size={15} className="text-brass" />
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
      <Icon size={16} className={danger ? "text-down" : "text-white/50"} />
      <div className="flex-1">
        <p className={cx("text-[13.5px] font-semibold", danger ? "text-down" : "text-white")}>{label}</p>
        <p className="text-[11px] text-white/40">{sub}</p>
      </div>
      {done ? <Check size={16} className="text-up" strokeWidth={3} /> : <ChevronRight size={16} className="text-white/25" />}
    </button>
  );
}
