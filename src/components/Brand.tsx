import { useId } from "react";
import { cx } from "./ui";

/**
 * Helm brand assets. The ship's-wheel mark — "at the helm of your businesses" —
 * carries a negative-space "H" in the hub so the mark is ownable (not a generic
 * wheel) and reads as the letter at a glance. Brass on deep navy = fintech trust.
 * Mirrors the geometry in scripts/gen-icons.mjs so the in-app logo and the app
 * icon stay consistent.
 */

const ANGLES = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4 + Math.PI / 8);

function Wheel({
  stroke,
  hub,
  hubLetter = false,
}: {
  stroke: string;
  /** Color knocked out of the hub (the "H", or the center dot). */
  hub: string;
  hubLetter?: boolean;
}) {
  const R = 25.5;
  const rimW = 3.6;
  const innerR = R * 0.46;
  const hubR = hubLetter ? 11 : 5.8;
  const sI = hubR * 0.55;
  const sO = R - rimW / 2;
  const hI = R + rimW / 2;
  const hO = R * 1.3;
  const cx = 50;
  const cy = 50;
  const pt = (r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  return (
    <g strokeLinecap="round">
      {ANGLES.map((a, i) => {
        const [x1, y1] = pt(hI, a);
        const [x2, y2] = pt(hO, a);
        return <line key={`h${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={3} />;
      })}
      {ANGLES.map((a, i) => {
        const [x1, y1] = pt(sI, a);
        const [x2, y2] = pt(sO, a);
        return <line key={`s${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={2.8} />;
      })}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={stroke} strokeWidth={rimW} />
      <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={stroke} strokeWidth={1.8} />
      <circle cx={cx} cy={cy} r={hubR} fill={stroke} />
      {hubLetter ? (
        // Negative-space capital "H" knocked out of the solid hub.
        <g fill={hub}>
          <rect x={45.4} y={43.2} width={2.7} height={13.6} rx={0.7} />
          <rect x={51.9} y={43.2} width={2.7} height={13.6} rx={0.7} />
          <rect x={45.4} y={48.6} width={9.2} height={2.8} rx={0.7} />
        </g>
      ) : (
        <circle cx={cx} cy={cy} r={2.3} fill={hub} />
      )}
    </g>
  );
}

/** Monochrome wheel in currentColor (used tiny — e.g. brass on the dark bg). */
export function HelmMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <Wheel stroke="currentColor" hub="currentColor" />
    </svg>
  );
}

/** The navy rounded-tile logo with the brass wheel + "H" hub — matches the app icon. */
export function HelmTile({ size = 28, rx = 26, className }: { size?: number; rx?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0e3052" />
          <stop offset="1" stopColor="#0a263e" />
        </linearGradient>
        <radialGradient id={`s${id}`} cx="0.3" cy="0.24" r="0.9">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.14" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" rx={rx} fill={`url(#g${id})`} />
      <rect width="100" height="100" rx={rx} fill={`url(#s${id})`} />
      <g transform="translate(10 10) scale(0.8)">
        <Wheel stroke="#e0ae49" hub="#0a263e" hubLetter />
      </g>
    </svg>
  );
}

/** Tile + "Helm" wordmark. `tag` optionally appends a small label, e.g. "AI COO". */
export function HelmLockup({
  size = 30,
  tag,
  className,
}: {
  size?: number;
  tag?: string;
  className?: string;
}) {
  return (
    <div className={cx("flex items-center gap-2", className)}>
      <HelmTile size={size} rx={28} />
      <span className="text-[19px] font-bold tracking-tight text-ink">Helm</span>
      {tag && (
        <span className="rounded-full bg-brass/[0.14] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brass-bright">
          {tag}
        </span>
      )}
    </div>
  );
}
