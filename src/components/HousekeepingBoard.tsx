import { useState } from "react";
import {
  ChevronLeft,
  BedDouble,
  Clock,
  CheckCheck,
  MoonStar,
  Wrench,
  RefreshCw,
  LogIn,
  CircleCheck,
  Check,
} from "lucide-react";
import type { Business } from "../types";
import {
  NORTHWOOD_ROOMS,
  HK_CLEANERS,
  housekeepingSummary,
  advanceStatus,
  type Room,
  type RoomHkStatus,
} from "../data/housekeeping";
import { weekday, shortDate, isoToday } from "../lib/format";
import { Card, cx } from "./ui";

/**
 * The room-readiness board — the paper housekeeping sheet, made live. A housekeeper taps a room as
 * they finish it (To clean → Cleaning → Ready); the front desk and the owner see the status change
 * instantly, so nobody walks up or radios to ask "is 12 ready yet?". This is the daily-driver the
 * owner asked for: glance the phone, know which rooms are good to check into.
 */

const STATUS: Record<RoomHkStatus, { label: string; color: string; Icon: typeof BedDouble }> = {
  toClean: { label: "To clean", color: "#e2685c", Icon: BedDouble },
  inProgress: { label: "Cleaning", color: "#e0ae49", Icon: Clock },
  ready: { label: "Ready", color: "#34c79a", Icon: CheckCheck },
  stayover: { label: "Staying", color: "#6fa8dc", Icon: MoonStar },
  outOfOrder: { label: "Repair", color: "#7d93a8", Icon: Wrench },
};

const QUEUE: RoomHkStatus[] = ["toClean", "inProgress", "ready"];
type Filter = "all" | RoomHkStatus;

export function HousekeepingBoard({ business, onClose }: { business: Business; onClose: () => void }) {
  const [rooms, setRooms] = useState<Room[]>(NORTHWOOD_ROOMS);
  const [filter, setFilter] = useState<Filter>("all");
  const s = housekeepingSummary(rooms);

  const todayIso = isoToday();
  const allSet = s.toFlip === 0;

  const tap = (room: Room) => {
    // Stayovers sit outside the clean→ready queue, but they still get a daily light service —
    // tapping one toggles whether today's service is done (tap again to undo).
    if (room.status === "stayover") {
      setRooms((rs) => rs.map((r) => (r.id === room.id ? { ...r, serviced: !r.serviced } : r)));
      return;
    }
    if (!QUEUE.includes(room.status)) return;
    setRooms((rs) => rs.map((r) => (r.id === room.id ? { ...r, status: advanceStatus(r.status) } : r)));
  };

  const shown = filter === "all" ? rooms : rooms.filter((r) => r.status === filter);

  const chips: { key: Filter; label: string; count: number; color?: string }[] = [
    { key: "all", label: "All", count: s.total },
    { key: "toClean", label: "To clean", count: s.toClean, color: STATUS.toClean.color },
    { key: "inProgress", label: "Cleaning", count: s.inProgress, color: STATUS.inProgress.color },
    { key: "ready", label: "Ready", count: s.ready, color: STATUS.ready.color },
    { key: "stayover", label: "Staying", count: s.stayover, color: STATUS.stayover.color },
  ];

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[440px] flex-col bg-[#0a263e] animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-5">
        <button
          onClick={onClose}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.06] active:scale-90"
        >
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-[16px] font-bold leading-tight text-white">Housekeeping</h1>
          <p className="text-[11px] text-white/40">
            {weekday(todayIso)}, {shortDate(todayIso)} · check-in 3:00 pm
          </p>
        </div>
      </div>

      <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-4 pb-10">
        {/* Hero — the one number that matters before check-in */}
        <Card className="p-5">
          {allSet ? (
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-up/15">
                <CircleCheck size={22} className="text-up" />
              </div>
              <div>
                <p className="text-[17px] font-bold text-white">All set for tonight</p>
                <p className="text-[12.5px] text-white/50">
                  {s.arrivalsTotal} arrival rooms ready · {s.sold} of {s.total} sold tonight
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[12px] font-medium text-white/45">Before 3:00 pm check-in</p>
              <div className="mt-1 flex items-baseline gap-2.5">
                <span className="text-[38px] font-bold tracking-tight text-white tabular-nums">{s.toFlip}</span>
                <span className="text-[15px] font-medium text-white/50">
                  {s.toFlip === 1 ? "room to flip" : "rooms to flip"}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-white/45">
                {s.arrivalsReady} of {s.arrivalsTotal} arrival rooms ready · {s.sold} of {s.total} sold tonight
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-up transition-[width] duration-500"
                  style={{ width: `${s.arrivalsTotal ? (s.arrivalsReady / s.arrivalsTotal) * 100 : 0}%` }}
                />
              </div>
            </>
          )}

          {/* Owner's glance at stayover service — subordinate to the check-in hero above, since a
              stayover's daily tidy is a housekeeping nicety, not a thing that blocks check-in. */}
          {s.stayover > 0 && (
            <div className="mt-4 flex items-center gap-1.5 border-t border-white/[0.06] pt-3 text-[12px] text-white/45">
              <MoonStar size={12} style={{ color: STATUS.stayover.color }} />
              <span>
                <span className="font-semibold tabular-nums text-white/70">
                  {s.stayoverServiced} of {s.stayover}
                </span>{" "}
                staying rooms serviced
              </span>
            </div>
          )}
        </Card>

        {/* Filter chips (double as the status legend) */}
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {chips.map((c) => {
            const active = filter === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setFilter(c.key)}
                className={cx(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
                  active ? "border-white/25 bg-white/[0.10] text-white" : "border-white/[0.07] text-white/55",
                )}
              >
                {c.color && <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />}
                {c.label}
                <span className="tabular-nums text-white/40">{c.count}</span>
              </button>
            );
          })}
        </div>

        {/* On shift */}
        <div className="flex items-center gap-2.5 px-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-white/35">On shift</span>
          {HK_CLEANERS.map((name) => {
            const room = rooms.find((r) => r.cleaner === name && r.status === "inProgress");
            return (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] py-1 pl-1 pr-2.5"
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-brass/20 text-[10px] font-bold text-brass">
                  {name[0]}
                </span>
                <span className="text-[11.5px] font-medium text-white/70">
                  {name} <span className="text-white/35">{room ? `· Rm ${room.id}` : "· free"}</span>
                </span>
              </span>
            );
          })}
        </div>

        {/* Room grid */}
        <div className="grid grid-cols-3 gap-2.5">
          {shown.map((room) => (
            <RoomTile key={room.id} room={room} onTap={() => tap(room)} />
          ))}
          {shown.length === 0 && (
            <p className="col-span-3 py-8 text-center text-[12px] text-white/35">No rooms in this view.</p>
          )}
        </div>

        <p className="px-1 text-[11px] leading-relaxed text-white/35">
          Replaces the paper sheet. Housekeeping taps a room the moment it's done — the front desk and
          you see <span className="text-white/55">Ready</span> live, with no walk-up or phone call. Tap
          any room to move it To&nbsp;clean → Cleaning → Ready — or a staying room to mark today's
          service done.
        </p>
      </div>
    </div>
  );
}

function RoomTile({ room, onTap }: { room: Room; onTap: () => void }) {
  const meta = STATUS[room.status];
  const tappable = QUEUE.includes(room.status) || room.status === "stayover";

  // Corner turnover indicator
  const Flow =
    room.status === "outOfOrder" ? null
    : room.departed && room.arrival ? RefreshCw
    : room.arrival ? LogIn
    : null;

  return (
    <button
      onClick={onTap}
      className={cx(
        "relative flex flex-col rounded-2xl border p-3 text-left transition active:scale-[0.97]",
        tappable ? "cursor-pointer" : "cursor-default",
      )}
      style={{ background: `${meta.color}14`, borderColor: `${meta.color}3a` }}
    >
      <div className="flex items-start justify-between">
        <span className="text-[20px] font-bold leading-none text-white tabular-nums">{room.id}</span>
        {Flow && <Flow size={13} className="mt-0.5 text-white/35" />}
      </div>
      <span className="mt-0.5 text-[10px] text-white/35">{room.type}</span>

      <div className="mt-2 flex items-center gap-1" style={{ color: meta.color }}>
        <meta.Icon size={12} strokeWidth={2.5} />
        <span className="text-[11px] font-semibold">{meta.label}</span>
      </div>
      {/* Stayover service state — green ✓ Cleaned once done, muted "To service" until then. The tile
          stays blue (a staying room, not a turnover) so it's never mistaken for a green "Ready". */}
      {room.status === "stayover" &&
        (room.serviced ? (
          <span
            className="mt-0.5 flex items-center gap-0.5 text-[10px] font-semibold"
            style={{ color: STATUS.ready.color }}
          >
            <Check size={11} strokeWidth={3} /> Cleaned
          </span>
        ) : (
          <span className="mt-0.5 text-[10px] font-medium text-white/45">To service</span>
        ))}
      {room.status === "inProgress" && room.cleaner && (
        <span className="mt-0.5 text-[10px] text-white/40">{room.cleaner}</span>
      )}
      {room.note && room.status !== "inProgress" && (
        <span className="mt-0.5 line-clamp-1 text-[10px] text-white/40">{room.note}</span>
      )}
    </button>
  );
}
