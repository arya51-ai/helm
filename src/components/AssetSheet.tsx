import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  type AssetKind,
  type LiabilityKind,
  type ManualAsset,
  type ManualLiability,
  type IncomeStream,
  ASSET_KINDS,
  LIABILITY_KINDS,
  newId,
  upsertAsset,
  removeAsset,
  upsertLiability,
  removeLiability,
  upsertIncome,
  removeIncome,
} from "../data/networth";
import { cx } from "./ui";

export type AssetSheetMode = "asset" | "liability" | "income";

/** Add or edit a manual asset, liability, or income stream — the things Helm can't see. */
export function AssetSheet({
  mode,
  initial,
  onClose,
  onSaved,
  onToast,
}: {
  mode: AssetSheetMode;
  initial?: ManualAsset | ManualLiability | IncomeStream | null;
  onClose: () => void;
  onSaved: () => void;
  onToast: (m: string) => void;
}) {
  const editing = !!initial;
  const a0 = initial as Partial<ManualAsset & ManualLiability & IncomeStream> | undefined;
  const [name, setName] = useState(a0?.name ?? "");
  const [kind, setKind] = useState<string>(
    a0?.kind ?? (mode === "asset" ? "real-estate" : "mortgage"),
  );
  const [amount, setAmount] = useState(
    String((mode === "liability" ? a0?.balance : mode === "income" ? a0?.monthly : a0?.value) ?? ""),
  );
  const [monthly, setMonthly] = useState(
    String((mode === "asset" ? a0?.monthlyIncome : mode === "liability" ? a0?.monthlyPayment : "") ?? ""),
  );
  const [apr, setApr] = useState(String(a0?.apr ?? ""));

  const num = (s: string) => Math.max(0, parseFloat(s.replace(/[^0-9.]/g, "")) || 0);
  const kinds = mode === "asset" ? ASSET_KINDS : mode === "liability" ? LIABILITY_KINDS : [];
  const eyebrow = mode === "asset" ? "Asset" : mode === "liability" ? "Liability" : "Income stream";
  const amountLabel = mode === "liability" ? "Balance owed" : mode === "income" ? "Amount / month" : "Current value";

  function save() {
    const cleanName = name.trim() || eyebrow;
    const id = a0?.id ?? newId(mode);
    if (mode === "asset") {
      upsertAsset({ id, name: cleanName, kind: kind as AssetKind, value: num(amount), monthlyIncome: num(monthly) || undefined });
    } else if (mode === "liability") {
      upsertLiability({
        id,
        name: cleanName,
        kind: kind as LiabilityKind,
        balance: num(amount),
        monthlyPayment: num(monthly) || undefined,
        apr: num(apr) || undefined,
      });
    } else {
      upsertIncome({ id, name: cleanName, monthly: num(amount) });
    }
    onSaved();
    onToast(`${cleanName} ${editing ? "updated" : "added"} ✓`);
    onClose();
  }

  function remove() {
    if (!a0?.id) return;
    if (mode === "asset") removeAsset(a0.id);
    else if (mode === "liability") removeLiability(a0.id);
    else removeIncome(a0.id);
    onSaved();
    onToast("Removed ✓");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[55] mx-auto flex max-w-[440px] flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-sheet-up relative max-h-[92%] overflow-y-auto rounded-t-[2rem] border-t border-white/10 bg-[#101218] px-5 pb-9 pt-3">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/15" />
        <span
          className={cx(
            "text-[11px] font-bold uppercase tracking-wide",
            mode === "liability" ? "text-rose-300" : "text-emerald-300",
          )}
        >
          {editing ? "Edit" : "Add"} {eyebrow.toLowerCase()}
        </span>
        <h2 className="mt-1 text-[19px] font-bold tracking-tight text-white">
          {mode === "income" ? "Monthly income Helm doesn't track" : `A ${eyebrow.toLowerCase()} Helm doesn't see`}
        </h2>

        <label className="mt-4 block rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5">
          <span className="text-[11px] font-medium text-white/40">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={mode === "asset" ? "e.g. Primary home" : mode === "liability" ? "e.g. Home mortgage" : "e.g. Rental income"}
            className="mt-0.5 w-full bg-transparent text-[16px] font-semibold text-white outline-none placeholder:text-white/25"
          />
        </label>

        {kinds.length > 0 && (
          <>
            <p className="mb-2 mt-4 px-1 text-[12px] font-medium text-white/45">Type</p>
            <div className="flex flex-wrap gap-2">
              {kinds.map((k) => (
                <button
                  key={k.key}
                  onClick={() => setKind(k.key)}
                  className={cx(
                    "rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition active:scale-95",
                    kind === k.key ? "bg-white text-black" : "bg-white/[0.06] text-white/55",
                  )}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-4 space-y-2.5">
          <NumField label={amountLabel} value={amount} onChange={setAmount} prefix="$" />
          {mode === "asset" && (
            <NumField label="Monthly income (optional)" hint="Rent or cash it throws off" value={monthly} onChange={setMonthly} prefix="$" />
          )}
          {mode === "liability" && (
            <div className="grid grid-cols-2 gap-2.5">
              <NumField label="Monthly payment" value={monthly} onChange={setMonthly} prefix="$" />
              <NumField label="APR (optional)" value={apr} onChange={setApr} suffix="%" />
            </div>
          )}
        </div>

        <button
          onClick={save}
          className="mt-5 w-full rounded-full bg-white py-3.5 text-[15px] font-semibold text-black active:scale-[0.98]"
        >
          {editing ? "Save changes" : `Add ${eyebrow.toLowerCase()}`}
        </button>
        {editing && (
          <button
            onClick={remove}
            className="mt-2 flex w-full items-center justify-center gap-1.5 py-2 text-[13px] font-semibold text-rose-300/80 active:scale-[0.98]"
          >
            <Trash2 size={14} /> Remove
          </button>
        )}
      </div>
    </div>
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
