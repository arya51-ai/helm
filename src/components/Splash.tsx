import { useEffect, useState } from "react";
import { HelmTile } from "./Brand";
import { cx } from "./ui";

/** Brief branded launch screen shown once on app open. */
export function Splash({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 950);
    const t2 = setTimeout(onDone, 1450);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  return (
    <div
      className={cx(
        "absolute inset-0 z-[80] flex flex-col items-center justify-center bg-[#0a263e] transition-opacity duration-500",
        leaving ? "opacity-0" : "opacity-100",
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-brass/25 blur-[100px]" />
      </div>
      <div className="animate-fade-up flex flex-col items-center">
        <HelmTile size={84} rx={28} className="shadow-2xl shadow-brass/40" />
        <p className="mt-5 text-[27px] font-bold tracking-tight text-white">Helm</p>
        <p className="mt-1 text-[13px] font-medium text-white/45">your AI COO</p>
      </div>
    </div>
  );
}
