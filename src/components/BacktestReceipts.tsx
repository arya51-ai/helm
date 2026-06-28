import { History, TrendingUp, TrendingDown } from "lucide-react";
import type { Business } from "../types";
import type { Metrics } from "../lib/analytics";
import { agedReceipts } from "../lib/backtest";
import { Card, SectionTitle, cx } from "./ui";

/**
 * Helm's track record — the receipt card. Joins a week-old Brief snapshot to where each business is
 * trending now ("flagged 8 days ago · since then, +6% week over week"). Renders nothing until
 * enough daily history has accrued (agedReceipts returns []), so it stays invisible on day one and
 * quietly lights up with use rather than showing an empty promise. Copy is deliberately hedged — a
 * trajectory read, never a causal claim about whether Helm's advice caused the move.
 */
export function BacktestReceipts({
  businesses,
  metricsBy,
}: {
  businesses: Business[];
  metricsBy: Record<string, Metrics>;
}) {
  const receipts = agedReceipts(businesses, metricsBy);
  if (!receipts.length) return null;

  return (
    <section>
      <SectionTitle>Helm's track record</SectionTitle>
      <p className="mb-3 px-1 text-[13px] text-white/45">What Helm flagged earlier — and where it stands now.</p>
      <div className="space-y-2.5">
        {receipts.map((r) => (
          <Card key={r.id} className="flex items-center gap-3 p-3.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-brass/12 text-brass">
              <History size={17} strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold text-white">{r.title}</p>
              <p className="truncate text-[12px] text-white/40">
                flagged {r.daysAgo}d ago{r.businessName ? ` · ${r.businessName}` : ""}
              </p>
            </div>
            <span
              className={cx(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold tabular-nums",
                r.improved ? "bg-up/10 text-up" : "bg-down/10 text-down",
              )}
            >
              {r.improved ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {r.moveLabel}
            </span>
          </Card>
        ))}
      </div>
    </section>
  );
}
