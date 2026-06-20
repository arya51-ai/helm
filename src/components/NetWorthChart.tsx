import { useEffect, useRef, useState } from "react";
import { shortDate } from "../lib/format";
import type { NetWorthPoint, NetWorthBand } from "../lib/netWorthHistory";

/** Track an element's pixel width for crisp responsive SVG. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export interface ScrubInfo {
  value: number;
  date: string;
  projected: boolean;
}

/**
 * The net-worth hero chart: solid history flowing into a dashed projection with a shaded
 * confidence cone, a "today" divider, and a draggable scrubber that reports the value under
 * the finger back to the parent (so the big number tracks the touch). Pure SVG, no lib.
 */
export function NetWorthChart({
  history,
  projection,
  showProjection = true,
  color = "#e0ae49",
  height = 200,
  onScrub,
}: {
  history: Pick<NetWorthPoint, "date" | "netWorth">[];
  projection: NetWorthBand[];
  showProjection?: boolean;
  color?: string;
  height?: number;
  onScrub?: (info: ScrubInfo | null) => void;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const proj = showProjection ? projection.slice(1) : [];
  const nodes = [
    ...history.map((h) => ({ date: h.date, v: h.netWorth, lo: h.netWorth, hi: h.netWorth, projected: false })),
    ...proj.map((p) => ({ date: p.date, v: p.mean, lo: p.lo, hi: p.hi, projected: true })),
  ];
  const A = history.length;
  const N = nodes.length;

  const padT = 16;
  const padB = 22;
  const innerH = height - padT - padB;
  const vals = nodes.flatMap((n) => [n.v, n.lo, n.hi]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const x = (i: number) => (N > 1 ? (i / (N - 1)) * w : w / 2);
  const y = (v: number) => padT + innerH - ((v - min) / range) * innerH;

  const id = color.replace(/[^a-z0-9]/gi, "");

  // history line + area
  const histPts = history.map((h, i) => `${x(i).toFixed(1)},${y(h.netWorth).toFixed(1)}`);
  const histLine = A ? `M${histPts.join(" L")}` : "";
  const histArea = A ? `${histLine} L${x(A - 1).toFixed(1)},${height - padB} L0,${height - padB} Z` : "";

  // projection mean (anchored to last actual) + band cone
  const lastA = A ? history[A - 1].netWorth : 0;
  const anchor = `${x(A - 1).toFixed(1)},${y(lastA).toFixed(1)}`;
  const meanPts = proj.map((p, i) => `${x(A + i).toFixed(1)},${y(p.mean).toFixed(1)}`);
  const meanLine = proj.length ? `M${anchor} L${meanPts.join(" L")}` : "";
  const hiPts = proj.map((p, i) => `${x(A + i).toFixed(1)},${y(p.hi).toFixed(1)}`);
  const loPts = proj.map((p, i) => `${x(A + i).toFixed(1)},${y(p.lo).toFixed(1)}`).reverse();
  const cone = proj.length ? `M${anchor} L${hiPts.join(" L")} L${loPts.join(" L")} Z` : "";

  function pick(clientX: number) {
    const el = ref.current;
    if (!el || N < 2) return;
    const rect = el.getBoundingClientRect();
    const rel = Math.max(0, Math.min(w, clientX - rect.left));
    const i = Math.round((rel / w) * (N - 1));
    setActive(i);
    onScrub?.({ value: nodes[i].v, date: nodes[i].date, projected: nodes[i].projected });
  }
  function clear() {
    setActive(null);
    onScrub?.(null);
  }

  const a = active != null ? nodes[active] : null;

  return (
    <div
      ref={ref}
      style={{ height, touchAction: "pan-y" }}
      className="relative w-full select-none"
      onPointerDown={(e) => pick(e.clientX)}
      onPointerMove={(e) => (e.buttons ? pick(e.clientX) : undefined)}
      onPointerUp={clear}
      onPointerLeave={clear}
    >
      {w > 0 && N > 0 && (
        <svg width={w} height={height} role="img">
          <defs>
            <linearGradient id={`nw-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.34} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {/* today divider */}
          {proj.length > 0 && (
            <line
              x1={x(A - 1)}
              y1={padT}
              x2={x(A - 1)}
              y2={padT + innerH}
              stroke="rgba(255,255,255,0.14)"
              strokeDasharray="2 3"
            />
          )}

          <path d={histArea} fill={`url(#nw-${id})`} />
          {cone && <path d={cone} fill={color} fillOpacity={0.1} />}
          <path d={histLine} fill="none" stroke={color} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
          {meanLine && (
            <path
              d={meanLine}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeDasharray="4 3"
              strokeLinejoin="round"
              opacity={0.9}
            />
          )}

          {/* end dot */}
          {A > 0 && <circle cx={x(A - 1)} cy={y(lastA)} r={3.5} fill={color} />}

          {/* scrubber */}
          {a && (
            <g>
              <line x1={x(active!)} y1={padT} x2={x(active!)} y2={padT + innerH} stroke="rgba(255,255,255,0.3)" />
              <circle cx={x(active!)} cy={y(a.v)} r={4.5} fill="#fff" stroke={color} strokeWidth={2} />
            </g>
          )}

          {/* baseline date labels — only show "today" when it won't crowd the right edge */}
          <text x={2} y={height - 5} fontSize={9.5} fill="rgba(255,255,255,0.32)">
            {history[0] ? shortDate(history[0].date) : ""}
          </text>
          {proj.length > 0 && x(A - 1) < w * 0.82 && (
            <text x={x(A - 1)} y={height - 5} textAnchor="middle" fontSize={9.5} fill="rgba(255,255,255,0.4)">
              today
            </text>
          )}
          <text x={w - 2} y={height - 5} textAnchor="end" fontSize={9.5} fill="rgba(255,255,255,0.32)">
            {nodes[N - 1] ? shortDate(nodes[N - 1].date) : ""}
          </text>
        </svg>
      )}

      {/* floating scrub label */}
      {a && w > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-white/10 bg-[#0e3052] px-2 py-1 text-center shadow-xl"
          style={{ left: Math.max(38, Math.min(w - 38, x(active!))) }}
        >
          <div className="text-[10px] font-medium text-white/50">
            {shortDate(a.date)}
            {a.projected ? " · projected" : ""}
          </div>
          <div className="text-[12px] font-bold tabular-nums text-white">
            ${a.v >= 1_000_000 ? `${(a.v / 1_000_000).toFixed(2)}M` : `${Math.round(a.v / 1000)}k`}
          </div>
        </div>
      )}
    </div>
  );
}
