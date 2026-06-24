import { useState } from "react";
import { ChevronLeft, Star, ThumbsUp, TriangleAlert } from "lucide-react";
import type { Business } from "../types";
import {
  northwoodReviews,
  toFive,
  type ReviewPlatform,
} from "../data/reviews";
import { shortDate } from "../lib/format";
import { Card, cx } from "./ui";

/**
 * "All your reviews, one place." A motel owner is rated on Google, Tripadvisor, Booking.com and
 * Expedia — four apps, four scales. This sheet blends them into one score and one recent feed, and
 * surfaces what guests bring up the most. Opened from the star pill in the motel header.
 */
export function ReviewsSheet({ business, onClose }: { business: Business; onClose: () => void }) {
  const data = northwoodReviews();
  const [filter, setFilter] = useState<ReviewPlatform | "all">("all");

  const feed = filter === "all" ? data.reviews : data.reviews.filter((r) => r.platform === filter);

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
          <h1 className="truncate text-[16px] font-bold leading-tight text-white">Reviews</h1>
          <p className="text-[11px] text-white/40">{business.name} · all your platforms, one place</p>
        </div>
      </div>

      <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-4 pb-10">
        {/* Blended hero */}
        <div className="flex items-center gap-4 px-1 pt-1">
          <div className="text-center">
            <p className="text-[44px] font-bold leading-none tracking-tight text-white tabular-nums">
              {data.blended.toFixed(1)}
            </p>
            <Stars value={data.blended} className="mt-1.5 justify-center" />
          </div>
          <div className="flex-1 border-l border-white/[0.08] pl-4">
            <p className="text-[13px] leading-relaxed text-white/70">
              <span className="font-semibold text-white">{data.totalCount} reviews</span> across{" "}
              {data.platforms.length} sites, blended into one score.
            </p>
            <p className="mt-1 text-[11px] text-white/40">Refreshed daily — you check nothing.</p>
          </div>
        </div>

        {/* Per-platform — tap to filter the feed */}
        <div className="grid grid-cols-2 gap-3">
          {data.platforms.map((p) => {
            const active = filter === p.platform;
            return (
              <Card
                key={p.platform}
                onClick={() => setFilter(active ? "all" : p.platform)}
                className={cx("p-3.5", active && "ring-1 ring-white/30")}
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                  <span className="text-[12px] font-semibold text-white/80">{p.label}</span>
                </div>
                <div className="mt-1.5 flex items-baseline gap-1">
                  <span className="text-[22px] font-bold tracking-tight text-white tabular-nums">
                    {p.score.toFixed(1)}
                  </span>
                  <span className="text-[12px] font-medium text-white/35">/{p.scale}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <Stars value={toFive(p.score, p.scale)} size={11} />
                  <span className="text-[10px] text-white/35">{p.count} reviews</span>
                </div>
              </Card>
            );
          })}
        </div>

        {/* What guests mention */}
        <div>
          <h2 className="mb-2 px-1 text-[14px] font-semibold text-white/90">What guests mention</h2>
          <div className="flex flex-wrap gap-2">
            {data.highlights.map((h) => {
              const love = h.sentiment === "love";
              const Icon = love ? ThumbsUp : TriangleAlert;
              return (
                <span
                  key={h.label}
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium",
                    love ? "bg-up/[0.10] text-up" : "bg-brass/[0.12] text-brass",
                  )}
                >
                  <Icon size={12} strokeWidth={2.5} />
                  {h.label}
                  <span className="text-white/35">{h.count}</span>
                </span>
              );
            })}
          </div>
        </div>

        {/* Unified recent feed */}
        <div>
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 className="text-[14px] font-semibold text-white/90">Recent reviews</h2>
            {filter !== "all" && (
              <button onClick={() => setFilter("all")} className="text-[11px] font-semibold text-info">
                Show all
              </button>
            )}
          </div>
          <div className="space-y-3">
            {feed.map((r) => {
              const meta = data.platforms.find((p) => p.platform === r.platform)!;
              return (
                <Card key={r.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                      style={{ background: `${meta.color}22`, color: meta.color }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
                      {meta.label}
                    </span>
                    <span className="text-[11px] text-white/35">{shortDate(r.date)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Stars value={toFive(r.rating, r.scale)} size={12} />
                    <span className="text-[12px] font-semibold text-white/85">{r.title}</span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/55">{r.text}</p>
                  <p className="mt-2 text-[11px] text-white/35">— {r.author}</p>
                </Card>
              );
            })}
          </div>
        </div>

        <p className="px-1 text-[11px] leading-relaxed text-white/35">
          Pulled together from Google, Tripadvisor, Booking.com and Expedia. One score, one feed —
          instead of four apps you check separately.
        </p>
      </div>
    </div>
  );
}

/** Five stars with the rating filled in (rounded to the nearest half looks fussy at this size —
 *  we fill whole stars and dim the rest). */
function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  const filled = Math.round(value);
  return (
    <span className={cx("inline-flex items-center gap-0.5", className)}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={size}
          className={i < filled ? "text-brass" : "text-white/15"}
          fill={i < filled ? "#e0ae49" : "transparent"}
          strokeWidth={i < filled ? 0 : 1.5}
        />
      ))}
    </span>
  );
}
