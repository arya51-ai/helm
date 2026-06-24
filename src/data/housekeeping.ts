/**
 * Housekeeping / room-readiness board for an independent motel — the thing Northwood runs on PAPER
 * today. From discovery (Sam, Jun 2026): the front desk can't see whether a room is clean
 * without walking up or radioing the cleaners, and the "what needs doing" report is a printed sheet.
 *
 * This is the digital version of that sheet. Each room carries its cleaning status and its turnover
 * context for tonight (who checked out, who's arriving). A housekeeper taps a room when they finish
 * it; the front desk and the owner see "Ready" the moment they do — no walk, no phone call.
 *
 * A 21-room single-strip motel on a busy summer turnover day: ~19 of 21 sold tonight, a stack of
 * morning checkouts to flip before the 3 pm check-in, 2–3 housekeepers on shift.
 */

export type RoomHkStatus = "toClean" | "inProgress" | "ready" | "stayover" | "outOfOrder";

export interface Room {
  /** Room number, used as the label and key. */
  id: string;
  type: "Standard" | "Kitchenette" | "Family";
  status: RoomHkStatus;
  /** A guest is in this room tonight (a stayover or an arrival). Drives the sold count and is
   *  independent of cleaning progress — it doesn't change as the room gets cleaned. */
  occupiedTonight: boolean;
  /** A new guest checks in here today — the room MUST be Ready before they arrive. */
  arrival: boolean;
  /** Tonight's prior guest checked out this morning (the room turns over). */
  departed: boolean;
  /** Housekeeper currently on it (set while inProgress). */
  cleaner?: string;
  /** Today's light clean done. Only meaningful for `stayover` rooms: the guest stays, but the room
   *  still gets a daily towel/tidy service. Orthogonal to `status` — a stayover is a stayover whether
   *  or not it's been serviced yet, so this rides alongside the status instead of replacing it. */
  serviced?: boolean;
  /** Short context line: checkout time, arrival ETA, or length of stay. */
  note?: string;
}

export const HK_CLEANERS = ["Rosa", "Maya", "Tom"] as const;

/** The current snapshot — late morning on a peak-season turnover day. */
export const NORTHWOOD_ROOMS: Room[] = [
  { id: "1", type: "Standard", status: "ready", occupiedTonight: true, arrival: true, departed: true, note: "Arrives 3:00 pm" },
  { id: "2", type: "Standard", status: "ready", occupiedTonight: true, arrival: true, departed: false, note: "Arrives 4:00 pm" },
  { id: "3", type: "Standard", status: "inProgress", occupiedTonight: true, arrival: true, departed: true, cleaner: "Rosa", note: "Arrives 3:30 pm" },
  { id: "4", type: "Standard", status: "toClean", occupiedTonight: true, arrival: true, departed: true, note: "Checked out 10:40 · arr. 3 pm" },
  { id: "5", type: "Kitchenette", status: "stayover", occupiedTonight: true, arrival: false, departed: false, serviced: true, note: "2 more nights" },
  { id: "6", type: "Standard", status: "ready", occupiedTonight: true, arrival: true, departed: true, note: "Arrives 5:00 pm" },
  { id: "7", type: "Standard", status: "inProgress", occupiedTonight: true, arrival: true, departed: true, cleaner: "Maya", note: "Arrives 4:00 pm" },
  { id: "8", type: "Standard", status: "stayover", occupiedTonight: true, arrival: false, departed: false, serviced: false, note: "Checks out tomorrow" },
  { id: "9", type: "Standard", status: "toClean", occupiedTonight: true, arrival: true, departed: true, note: "Checked out 11:05 · arr. 3 pm" },
  { id: "10", type: "Family", status: "stayover", occupiedTonight: true, arrival: false, departed: false, serviced: true, note: "1 more night" },
  { id: "11", type: "Standard", status: "ready", occupiedTonight: true, arrival: true, departed: false, note: "Early arrival · 2:00 pm" },
  { id: "12", type: "Standard", status: "toClean", occupiedTonight: true, arrival: true, departed: true, note: "Checked out 10:15 · arr. 4 pm" },
  { id: "13", type: "Standard", status: "inProgress", occupiedTonight: true, arrival: true, departed: true, cleaner: "Tom", note: "Arrives 3:00 pm" },
  { id: "14", type: "Standard", status: "stayover", occupiedTonight: true, arrival: false, departed: false, serviced: false, note: "Checks out tomorrow" },
  { id: "15", type: "Kitchenette", status: "ready", occupiedTonight: true, arrival: true, departed: true, note: "Arrives 6:00 pm" },
  { id: "16", type: "Standard", status: "toClean", occupiedTonight: false, arrival: false, departed: true, note: "Checked out · no arrival (no rush)" },
  { id: "17", type: "Standard", status: "stayover", occupiedTonight: true, arrival: false, departed: false, serviced: true, note: "Checks out tomorrow" },
  { id: "18", type: "Standard", status: "ready", occupiedTonight: true, arrival: true, departed: true, note: "Arrives 3:30 pm" },
  { id: "19", type: "Family", status: "stayover", occupiedTonight: true, arrival: false, departed: false, serviced: false, note: "2 more nights" },
  { id: "20", type: "Standard", status: "outOfOrder", occupiedTonight: false, arrival: false, departed: false, note: "AC repair — flagged by owner" },
  { id: "21", type: "Standard", status: "stayover", occupiedTonight: true, arrival: false, departed: false, serviced: false, note: "Checks out tomorrow" },
];

export interface HkSummary {
  total: number;
  toClean: number;
  inProgress: number;
  ready: number;
  stayover: number;
  /** Stayover rooms whose daily light clean is already done. */
  stayoverServiced: number;
  outOfOrder: number;
  /** Sold tonight (occupiedTonight). */
  sold: number;
  /** Rooms with an arrival today. */
  arrivalsTotal: number;
  /** Arrival rooms already Ready. */
  arrivalsReady: number;
  /** Arrival rooms still dirty / mid-clean — must be flipped before check-in. */
  toFlip: number;
}

export function housekeepingSummary(rooms: Room[]): HkSummary {
  const count = (s: RoomHkStatus) => rooms.filter((r) => r.status === s).length;
  const arrivals = rooms.filter((r) => r.arrival);
  return {
    total: rooms.length,
    toClean: count("toClean"),
    inProgress: count("inProgress"),
    ready: count("ready"),
    stayover: count("stayover"),
    stayoverServiced: rooms.filter((r) => r.status === "stayover" && r.serviced).length,
    outOfOrder: count("outOfOrder"),
    sold: rooms.filter((r) => r.occupiedTonight).length,
    arrivalsTotal: arrivals.length,
    arrivalsReady: arrivals.filter((r) => r.status === "ready").length,
    toFlip: arrivals.filter((r) => r.status === "toClean" || r.status === "inProgress").length,
  };
}

/** Tapping a room in the cleaning queue advances it: To clean → Cleaning → Ready → (back to start,
 *  for a re-clean). Stayover and out-of-order rooms aren't part of this queue — stayovers toggle
 *  `serviced` instead (see the board's tap handler), out-of-order rooms don't cycle at all. */
export function advanceStatus(status: RoomHkStatus): RoomHkStatus {
  switch (status) {
    case "toClean": return "inProgress";
    case "inProgress": return "ready";
    case "ready": return "toClean";
    default: return status;
  }
}
