import { useMemo, useState } from "react";
import { SlidersHorizontal, RotateCcw, Trash2 } from "lucide-react";
import type { Business, Currency } from "../types";
import type { Metrics } from "../lib/analytics";
import { fromUSD, RATES_TO_USD } from "../lib/currency";
import { setOverride, clearOverride } from "../data/overrides";
import { usd, usdCompact, pct } from "../lib/format";
import { cx } from "./ui";

/** Currency symbol shown as the capital-field prefix. */
const CUR_SYMBOL: Record<Currency, string> = { USD: "$", CAD: "C$", INR: "₹" };
const CURRENCIES: Currency[] = ["USD", "CAD", "INR"];
/** Accent palette for the card + charts. */
const ACCENTS = ["#34c79a", "#e0ae49", "#e0ae49", "#34c79a", "#6fa8dc", "#e0ae49", "#e2685c", "#e0ae49"];

/**
 * Edit a business: its profile (name, location, category, color) and its economics
 * (capital, margin, reporting currency) — or remove it. Capital is entered in the
 * business's OWN reporting currency; everything is persisted as an override and
 * re-converted to USD at load like the rest of the app.
 */
export function EconomicsEditor({
  business,
  metrics,
  onClose,
  onSaved,
  onRemove,
  onToast,
}: {
  business: Business;
  metrics: Metrics;
  onClose: () => void;
  onSaved: () => void;
  onRemove: () => void;
  onToast: (m: string) => void;
}) {
  const startCurrency: Currency = business.currency ?? "USD";
  const [name, setName] = useState(business.name);
  const [location, setLocation] = useState(business.location);
  const [category, setCategory] = useState(business.category);
  const [accent, setAccent] = useState(business.accent);
  const [currency, setCurrency] = useState<Currency>(startCurrency);
  const nativeCapital = Math.round(fromUSD(business.capitalDeployed, startCurrency));
  const [capital, setCapital] = useState(String(nativeCapital));
  const [margin, setMargin] = useState(((business.netMargin ?? 0) * 100).toFixed(1));
  const [confirmRemove, setConfirmRemove] = useState(false);

  const swatches = ACCENTS.includes(accent) ? ACCENTS : [accent, ...ACCENTS];

  // Live preview: daily revenue run-rate is currency-converted (USD) already in metrics.
  const dailyAvgUsd = metrics.last30 / 30;
  const preview = useMemo(() => {
    const capNative = Math.max(0, parseFloat(capital.replace(/[^0-9.]/g, "")) || 0);
    const capUsd = capNative * (RATES_TO_USD[currency] ?? 1);
    const mar = Math.max(0, Math.min(100, parseFloat(margin) || 0)) / 100;
    const monthlyProfit = dailyAvgUsd * 30 * mar;
    const roic = capUsd > 0 ? (dailyAvgUsd * 365 * mar) / capUsd : 0;
    return { monthlyProfit, roic, capUsd };
  }, [capital, margin, currency, dailyAvgUsd]);

  function save() {
    const cap = Math.max(0, parseFloat(capital.replace(/[^0-9.]/g, "")) || 0);
    const mar = Math.max(0, Math.min(100, parseFloat(margin) || 0)) / 100;
    const cleanName = name.trim() || business.name;
    setOverride(business.id, {
      name: cleanName,
      shortName: cleanName.split(/\s+/)[0],
      location: location.trim() || business.location,
      category: category.trim() || business.category,
      accent,
      capitalDeployed: cap,
      netMargin: mar,
      currency,
    });
    onSaved();
    onToast(`${cleanName} updated ✓`);
    onClose();
  }

  function reset() {
    clearOverride(business.id);
    onSaved();
    onToast("Reset to defaults ✓");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[55] mx-auto flex max-w-[440px] flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-sheet-up relative max-h-[92%] overflow-y-auto rounded-t-[2rem] border-t border-white/10 bg-[#0e3052] px-5 pb-9 pt-3">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/15" />

        <div className="flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-brass" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-brass">Edit business</span>
        </div>
        <h2 className="mt-2 text-[19px] font-bold tracking-tight text-white">Edit {business.name}</h2>
        <p className="mt-1 text-[13px] text-white/50">
          Update the details and set your real capital and margin so return-on-capital and net worth are exact.
        </p>

        {/* Profile */}
        <p className="mb-2 mt-5 px-1 text-[12px] font-medium text-white/45">Details</p>
        <div className="space-y-2.5">
          <TextField label="Name" value={name} onChange={setName} placeholder={business.name} />
          <TextField label="Location" value={location} onChange={setLocation} placeholder="City, region" />
          <TextField label="Category" value={category} onChange={setCategory} placeholder="What it sells" />
        </div>

        {/* Accent color */}
        <p className="mb-2 mt-4 px-1 text-[12px] font-medium text-white/45">Color</p>
        <div className="flex flex-wrap gap-2.5 px-1">
          {swatches.map((c) => (
            <button
              key={c}
              onClick={() => setAccent(c)}
              aria-label={`Accent ${c}`}
              className={cx(
                "h-8 w-8 rounded-full transition active:scale-90",
                accent === c ? "ring-2 ring-white ring-offset-2 ring-offset-[#0e3052]" : "ring-1 ring-white/10",
              )}
              style={{ background: c }}
            />
          ))}
        </div>

        {/* Reporting currency */}
        <p className="mb-2 mt-5 px-1 text-[12px] font-medium text-white/45">Reporting currency</p>
        <div className="flex gap-1.5 rounded-full bg-white/[0.05] p-1">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={cx(
                "flex-1 rounded-full py-2 text-[13px] font-semibold transition",
                currency === c ? "bg-white text-black" : "text-white/50",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-2.5">
          <NumField
            label={`Capital deployed (${currency})`}
            hint="Buildout + inventory tied up in the business"
            value={capital}
            onChange={setCapital}
            prefix={CUR_SYMBOL[currency]}
          />
          <NumField
            label="Net profit margin"
            hint="After rent, labor, royalties, COGS"
            value={margin}
            onChange={setMargin}
            suffix="%"
          />
        </div>

        {/* Live preview */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
            <p className="text-[12px] font-medium text-white/45">Return on capital</p>
            <p className="mt-1 text-[22px] font-bold tracking-tight text-brass tabular-nums">
              {pct(preview.roic, 0)}
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
            <p className="text-[12px] font-medium text-white/45">Profit / mo</p>
            <p className="mt-1 text-[22px] font-bold tracking-tight text-white tabular-nums">
              {usd(preview.monthlyProfit)}
            </p>
          </div>
        </div>
        <p className="mt-2 px-1 text-[11px] text-white/35">
          Based on your last-30-day sales run-rate ({usdCompact(metrics.last30)}).
          {currency !== "USD" && ` Shown in USD; capital ≈ ${usdCompact(preview.capUsd)}.`}
        </p>

        <button
          onClick={save}
          className="mt-5 w-full rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
        >
          Save
        </button>
        <button
          onClick={reset}
          className="mt-2 flex w-full items-center justify-center gap-1.5 py-2 text-[13px] font-medium text-white/45"
        >
          <RotateCcw size={13} /> Reset to default
        </button>

        {/* Remove — destructive, two-tap confirm */}
        <div className="mt-4 border-t border-white/[0.07] pt-4">
          {confirmRemove ? (
            <div>
              <p className="mb-2 text-center text-[12px] text-white/55">
                Remove <b className="text-white/80">{business.name}</b> from your dashboard?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmRemove(false)}
                  className="flex-1 rounded-full bg-white/[0.08] py-3 text-[14px] font-semibold text-white/70 active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  onClick={onRemove}
                  className="flex-1 rounded-full bg-down/90 py-3 text-[14px] font-semibold text-white active:scale-[0.98]"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              className="flex w-full items-center justify-center gap-1.5 py-2 text-[13px] font-semibold text-down/80 active:scale-[0.98]"
            >
              <Trash2 size={14} /> Remove business
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5">
      <span className="text-[11px] font-medium text-white/40">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-0.5 w-full bg-transparent text-[16px] font-semibold text-white outline-none placeholder:text-white/25"
      />
    </label>
  );
}

function NumField({
  label,
  hint,
  value,
  onChange,
  prefix,
  suffix,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="block rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5">
      <span className="text-[11px] font-medium text-white/40">{label}</span>
      <div className="mt-0.5 flex items-center gap-1">
        {prefix && <span className="text-[15px] font-semibold text-white/50">{prefix}</span>}
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-[16px] font-semibold text-white outline-none"
        />
        {suffix && <span className="text-[15px] font-semibold text-white/50">{suffix}</span>}
      </div>
      {hint && <span className="text-[11px] text-white/30">{hint}</span>}
    </label>
  );
}
