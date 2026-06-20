import { useId } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { signedPct } from "../lib/format";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Green/red change pill with a directional arrow. */
export function Delta({
  value,
  text,
  size = "sm",
  className,
}: {
  value: number;
  text?: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full font-semibold tabular-nums",
        up ? "bg-up/12 text-up" : "bg-down/12 text-down",
        size === "lg" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs",
        className,
      )}
    >
      <Icon size={size === "lg" ? 15 : 12} strokeWidth={2.5} />
      {text ?? signedPct(value)}
    </span>
  );
}

/** Lightweight inline-SVG sparkline (no chart lib needed for tiny trends). */
export function Sparkline({
  data,
  color,
  width = 120,
  height = 36,
  strokeWidth = 2,
  fill = true,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  fill?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  if (data.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 5) - 3;
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.32} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#spark-${id})`} />}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SectionTitle({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between px-1">
      <h2 className="text-[15px] font-semibold tracking-tight text-white/90">{children}</h2>
      {right}
    </div>
  );
}

export function Card({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cx(
        "rounded-3xl border border-white/[0.06] bg-white/[0.03] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]",
        onClick && "cursor-pointer active:scale-[0.985] transition-transform",
        className,
      )}
    >
      {children}
    </div>
  );
}
