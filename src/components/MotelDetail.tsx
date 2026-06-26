import { useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Star,
  CalendarClock,
  ArrowUpRight,
  BedDouble,
  Upload,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import type { Business, HotelDay } from "../types";
import { hotelMetricsFor } from "../lib/hotelAnalytics";
import { motelChannelStats, daysToSummerfest } from "../lib/motelInsights";
import { parseHotelFile, refreshMotelFromImport } from "../lib/hotelImport";
import { upsertImported } from "../data/source";
import { money, pct, shortDate, weekday } from "../lib/format";
import { Card, Delta, cx } from "./ui";
import { AreaTrend } from "./charts";
import { ReviewsSheet } from "./ReviewsSheet";
import { HousekeepingBoard } from "./HousekeepingBoard";
import { NORTHWOOD_ROOMS, housekeepingSummary } from "../data/housekeeping";

const RANGES = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
];

type KpiMode = "occupancy" | "adr" | "revpar" | "rooms";

const ca = (n: number) => money(n, "CAD");

/**
 * The independent-motel deep dive — the owner-operator's view. Leads with how full and at what
 * rate, then the thing a motel owner actually feels: where the bookings come from and what the
 * OTAs take. No RevPAR Index, no GOP, no brand PIP — those are chain concepts. Everything in CAD.
 */
export function MotelDetail({
  business,
  onClose,
  onSynced,
}: {
  business: Business;
  onClose: () => void;
  /** Called after a real Little Hotelier export is uploaded, with the refreshed business. */
  onSynced?: (b: Business) => void;
}) {
  const [range, setRange] = useState(1);
  const [kpiMode, setKpiMode] = useState<KpiMode>("occupancy");
  const [sheet, setSheet] = useState<null | "reviews" | "hk">(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hk = housekeepingSummary(NORTHWOOD_ROOMS);
  const m = hotelMetricsFor(business);
  const stats = motelChannelStats(business);

  // Drop your real Little Hotelier export onto the existing motel: occupancy / rate / revenue
  // become real, the booking-mix estimate + everything else stays. Degrades honestly on a bad file.
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-uploading the same file
    if (!file) return;
    setUploading(true);
    setUploadErr(null);
    try {
      const parsed = await parseHotelFile(file, { rooms: business.rooms ?? 21 });
      const refreshed = refreshMotelFromImport(business, parsed);
      upsertImported(refreshed);
      onSynced?.(refreshed);
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "Couldn't read that file. Check the columns and try again.");
    } finally {
      setUploading(false);
    }
  }

  if (!m || !business.hotelSeries) return null;

  const hs = business.hotelSeries;
  const slice = hs.slice(-RANGES[range].days);
  const today = hs[hs.length - 1];

  const chartData = slice.map((d) => ({
    date: d.date,
    revenue:
      kpiMode === "occupancy" ? d.occupancy * 100 :
      kpiMode === "adr" ? d.adr :
      kpiMode === "revpar" ? d.revpar :
      d.roomsSold,
  }));

  const hw = daysToSummerfest();

  return (
    <div className="fixed inset-0 z-40 mx-auto flex max-w-[440px] flex-col bg-[#0a263e]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.06] active:scale-90"
          >
            <ChevronLeft size={20} className="text-white" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[16px] font-bold leading-tight text-white">{business.name}</h1>
            <p className="flex items-center gap-1 text-[11px] text-white/40">
              <MapPin size={10} /> {business.location} · {business.rooms} rooms
            </p>
          </div>
        </div>
        {business.reviewScore && (
          <button
            onClick={() => setSheet("reviews")}
            className="flex items-center gap-1 rounded-full bg-brass/12 px-2.5 py-1.5 active:scale-95"
          >
            <Star size={12} className="text-brass" fill="#e0ae49" />
            <span className="text-[12px] font-bold text-brass">{business.reviewScore.toFixed(1)}</span>
            <ChevronRight size={12} className="text-brass/50" />
          </button>
        )}
      </div>

      <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-4 pb-10">
        {/* Real-data sync — drop the Little Hotelier export and the motel runs on the owner's
            real occupancy/rate/revenue. Honest about modeled-vs-real either way. */}
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={onFile} className="hidden" />
        {business.dataReal ? (
          <div className="flex items-center gap-2 rounded-2xl border border-up/25 bg-up/[0.08] px-3 py-2.5">
            <CheckCircle2 size={15} className="shrink-0 text-up" />
            <span className="min-w-0 flex-1 text-[12px] font-medium text-white/75">
              Your real numbers · from <span className="font-semibold text-white">{business.pms ?? "your PMS"}</span>{" "}
              <span className="text-white/45">
                ({shortDate(hs[0].date)}–{shortDate(today.date)})
              </span>
            </span>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="shrink-0 text-[11px] font-semibold text-up/80 active:scale-95 disabled:opacity-50"
            >
              {uploading ? "Reading…" : "Update"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center gap-3 rounded-2xl border border-brass/25 bg-brass/[0.07] px-3.5 py-3 text-left active:scale-[0.99] disabled:opacity-60"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brass/15">
              {uploading ? <Loader2 size={17} className="animate-spin text-brass" /> : <Upload size={17} className="text-brass" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-white">
                {uploading ? "Reading your export…" : `Upload your ${business.pms ?? "PMS"} export`}
              </p>
              <p className="text-[11.5px] leading-snug text-white/45">
                These numbers are modeled — drop your real occupancy, rate &amp; revenue to make it yours
              </p>
            </div>
            <ChevronRight size={18} className="shrink-0 text-white/30" />
          </button>
        )}
        {uploadErr && <p className="-mt-2 px-1 text-[11.5px] text-down/90">{uploadErr}</p>}

        {/* Hero — tonight */}
        <div className="px-1">
          <p className="text-[12px] font-medium text-white/45">Tonight</p>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="text-[38px] font-bold tracking-tight text-white tabular-nums">
              {pct(m.todayOcc, 0)}
            </span>
            <span className="text-[15px] font-medium text-white/50">full</span>
            <Delta value={m.occVsExpected} />
          </div>
          <p className="mt-1 text-[13px] text-white/45">
            {today.roomsSold} of {business.rooms} rooms · {ca(m.todayAdr)} avg rate · {ca(m.todayRevpar)} per room
          </p>
        </div>

        {/* Housekeeping board — the daily-driver: kills the paper sheet, front desk sees Ready live */}
        <Card onClick={() => setSheet("hk")} className="flex items-center gap-3 p-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-up/12">
            <BedDouble size={20} className="text-up" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-white">Housekeeping board</p>
            <p className="text-[12px] text-white/45">
              {hk.toFlip > 0
                ? `${hk.toFlip} rooms to flip before check-in · ${hk.ready} ready`
                : `All set for tonight · ${hk.ready} ready`}
            </p>
          </div>
          <ChevronRight size={18} className="shrink-0 text-white/30" />
        </Card>

        {/* KPI switcher */}
        <div className="flex gap-1.5 rounded-full bg-white/[0.05] p-1">
          {(["occupancy", "adr", "revpar", "rooms"] as KpiMode[]).map((k) => (
            <button
              key={k}
              onClick={() => setKpiMode(k)}
              className={cx(
                "flex-1 rounded-full py-1.5 text-[11px] font-semibold capitalize transition",
                kpiMode === k ? "bg-white text-black" : "text-white/50",
              )}
            >
              {k === "adr" ? "Rate" : k === "revpar" ? "Per room" : k}
            </button>
          ))}
        </div>

        {/* Range selector */}
        <div className="flex gap-1.5 rounded-full bg-white/[0.05] p-1">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRange(i)}
              className={cx(
                "flex-1 rounded-full py-1.5 text-[12px] font-semibold transition",
                i === range ? "bg-white text-black" : "text-white/50",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Trend chart */}
        <Card className="p-3 pt-4">
          <AreaTrend data={chartData} color={business.accent} height={180} showAxis />
        </Card>

        {/* Core KPIs — the motel owner's dashboard, no chain jargon */}
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Occupancy" value={pct(m.monthOcc, 0)} trend={m.occTrend7} sub="30-day avg" />
          <Kpi label="Avg rate" value={ca(m.monthAdr)} trend={m.adrTrend7} sub="ADR" />
          <Kpi label="Per room" value={ca(m.monthRevpar)} trend={m.revparTrend7} sub="RevPAR" />
        </div>
        {stats && (
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Rooms / night" value={Math.round(m.monthOcc * (business.rooms ?? 22)).toString()} sub="avg sold" />
            <Kpi label="Room revenue" value={ca(stats.monthRoomRev)} sub="last 30 days" />
            <Kpi label="Direct" value={pct(stats.directShare, 0)} accent="text-up" sub="commission-free" />
          </div>
        )}

        {/* WHERE YOUR BOOKINGS COME FROM — the hero of the demo */}
        {stats && (
          <Section
            title="Where your bookings come from"
            hint={business.channelEstimated ? "estimated · last 30 days" : "last 30 days"}
          >
            <Card className="p-5">
              {business.channelEstimated && (
                <p className="mb-4 rounded-xl bg-white/[0.04] px-3 py-2 text-[11px] leading-snug text-white/45">
                  Estimated booking mix — your {business.pms ?? "PMS"} export carries occupancy &amp; revenue, not the
                  per-channel split. Tell us your real sources and this commission read gets exact.
                </p>
              )}
              <Channel label="Direct" share={business.channelMix!.direct} rev={stats.directRev} fee={0} color="#34c79a" note="yours — no commission" />
              <Channel label="Booking.com" share={business.channelMix!.bookingCom} rev={stats.bookingComRev} fee={stats.bookingComFee} color="#1f6fb2" />
              <Channel label="Expedia" share={business.channelMix!.expedia} rev={stats.expediaRev} fee={stats.expediaFee} color="#b4793a" />
              <Channel label="Airbnb & others" share={business.channelMix!.other} rev={stats.otherRev} fee={stats.otherFee} color="#9a5b9c" />

              <div className="mt-4 flex items-end justify-between border-t border-white/[0.06] pt-4">
                <div>
                  <p className="text-[12px] text-white/45">Commission paid · last 30 days</p>
                  <p className="mt-0.5 text-[26px] font-bold tracking-tight text-down tabular-nums">{ca(stats.commission)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[12px] text-white/45">Booked via OTAs</p>
                  <p className="mt-0.5 text-[18px] font-bold text-white tabular-nums">{pct(stats.otaShare, 0)}</p>
                </div>
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-2xl bg-up/[0.06] px-3 py-2.5">
                <ArrowUpRight size={15} className="mt-0.5 shrink-0 text-up" />
                <p className="text-[12px] leading-relaxed text-white/70">
                  Move just 1 in 10 OTA stays to direct and you keep ~<span className="font-semibold text-white">{ca(stats.shift10Monthly)}/mo</span> —
                  about <span className="font-semibold text-white">{ca(stats.shift10Season)}</span> across your Jun–Sep season.
                </p>
              </div>
            </Card>
          </Section>
        )}

        {/* PEAK SEASON / SUMMERFEST */}
        <Section title="You're entering peak" hint="the island's summer">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brass/15">
                <CalendarClock size={19} className="text-brass" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-white">Summerfest Weekend · {hw.label}</p>
                <p className="text-[12px] text-white/45">Pinecrest's biggest weekend — the town sells out</p>
              </div>
              <div className="text-right">
                <p className="text-[20px] font-bold text-brass tabular-nums">{hw.days}</p>
                <p className="text-[10px] uppercase tracking-wide text-white/35">days out</p>
              </div>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-white/55">
              Jun–Sep is the bulk of your year — you're pacing <span className="font-semibold text-white">{m.revparTrend30 >= 0 ? "+" : ""}{(m.revparTrend30 * 100).toFixed(0)}%</span> over
              30 days as demand climbs. Hold rate discipline on weekends (don't discount into a sellout), put a 2-night minimum on the long weekends, and bank the summer.
            </p>
          </Card>
        </Section>

        {/* Occupancy by weekday */}
        <Section title="When you fill up" hint="by night, last 4 weeks">
          <Card className="p-5">
            <DowOccupancy series={hs} color={business.accent} />
          </Card>
        </Section>

        {/* Recent nights */}
        <Section title="Recent nights" hint="last 7">
          <Card className="divide-y divide-white/[0.05]">
            {hs.slice(-7).reverse().map((d) => (
              <div key={d.date} className="flex items-center gap-3 p-3.5">
                <div className="w-12 shrink-0">
                  <p className="text-[13px] font-semibold text-white">{weekday(d.date)}</p>
                  <p className="text-[11px] text-white/40">{shortDate(d.date)}</p>
                </div>
                <div className="flex-1 text-center">
                  <p className="text-[12px] font-semibold text-white tabular-nums">{pct(d.occupancy, 0)}</p>
                  <p className="text-[9px] text-white/30">FULL</p>
                </div>
                <div className="flex-1 text-center">
                  <p className="text-[12px] font-semibold text-white tabular-nums">{ca(d.adr)}</p>
                  <p className="text-[9px] text-white/30">RATE</p>
                </div>
                <div className="flex-1 text-center">
                  <p className="text-[12px] font-semibold text-white tabular-nums">{d.roomsSold}/{d.roomsAvailable}</p>
                  <p className="text-[9px] text-white/30">ROOMS</p>
                </div>
              </div>
            ))}
          </Card>
        </Section>

        <p className="px-1 text-[11px] leading-relaxed text-white/35">
          {business.dataReal ? (
            <>
              Running on your real occupancy, rate &amp; revenue from {business.pms ?? "your channel manager"}. Booking
              mix is still estimated — confirm your sources and Helm reads the rest every morning, you type nothing.
            </>
          ) : (
            <>
              Modeled on {business.name}'s public profile. Upload your {business.pms ?? "channel manager"} export above —
              Helm then reads your real occupancy, rate, and revenue every morning, you type nothing.
            </>
          )}
        </p>
      </div>

      {sheet === "reviews" && <ReviewsSheet business={business} onClose={() => setSheet(null)} />}
      {sheet === "hk" && <HousekeepingBoard business={business} onClose={() => setSheet(null)} />}
    </div>
  );
}

function Channel({
  label,
  share,
  rev,
  fee,
  color,
  note,
}: {
  label: string;
  share: number;
  rev: number;
  fee: number;
  color: string;
  note?: string;
}) {
  return (
    <div className="mb-3.5 last:mb-0">
      <div className="flex items-center justify-between text-[12.5px]">
        <span className="font-medium text-white/80">{label}</span>
        <span className="font-semibold text-white/90 tabular-nums">
          {pct(share, 0)} <span className="text-white/35">· {ca(rev)}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: color }} />
      </div>
      <p className={cx("mt-1 text-[11px]", fee > 0 ? "text-down/80" : "text-up/80")}>
        {fee > 0 ? `−${ca(fee)} commission` : note ?? "no commission"}
      </p>
    </div>
  );
}

function DowOccupancy({ series, color }: { series: HotelDay[]; color: string }) {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const recent = series.slice(-28);
  const byDow = labels.map((_, i) => {
    const days = recent.filter((d) => new Date(`${d.date}T00:00:00`).getDay() === i);
    return days.length ? days.reduce((a, d) => a + d.occupancy, 0) / days.length : 0;
  });
  const max = Math.max(...byDow, 0.5);
  const bestIdx = byDow.indexOf(Math.max(...byDow));
  const worstIdx = byDow.indexOf(Math.min(...byDow.filter((v) => v > 0)));

  return (
    <div>
      <div className="flex h-[100px] items-end justify-between gap-1.5">
        {byDow.map((occ, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end">
            <div
              className="w-full rounded-t-md"
              style={{
                height: `${occ ? Math.max(4, (occ / max) * 100) : 0}%`,
                background: i === bestIdx ? color : i === worstIdx ? "#e2685caa" : `${color}59`,
              }}
            />
            <span className={cx("mt-1 text-[10px]", i === bestIdx ? "font-bold text-white/80" : "text-white/40")}>
              {labels[i]}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-white/40">
        {labels[bestIdx]} runs fullest at {pct(byDow[bestIdx], 0)} · {labels[worstIdx]} is quietest at {pct(byDow[worstIdx], 0)} — where a midweek deal earns its keep.
      </p>
    </div>
  );
}

function Kpi({ label, value, trend, accent, sub }: { label: string; value: string; trend?: number; accent?: string; sub?: string }) {
  return (
    <Card className="p-3.5">
      <p className="text-[11px] font-medium text-white/45">{label}</p>
      <p className={cx("mt-1 text-[18px] font-bold tracking-tight tabular-nums", accent ?? "text-white")}>{value}</p>
      {trend != null ? <Delta value={trend} className="mt-1" /> : sub ? <p className="mt-1 text-[10px] text-white/30">{sub}</p> : null}
    </Card>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-[14px] font-semibold text-white/90">{title}</h2>
        {hint && <span className="text-[11px] text-white/35">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
