import type { Business } from "../types";
import type { Metrics } from "./analytics";

/**
 * Peer benchmarking — Helm's compounding data moat. Until the real owner network
 * exists, we estimate a percentile from regional baselines (clearly labeled in the
 * UI). The interface is what matters: once many owners join, swap these baselines
 * for live anonymized cohort data keyed by vertical + region + size.
 */
const PEERS: Record<string, { median: number; top: number; label: string }> = {
  restaurant: { median: 1700, top: 2800, label: "sandwich franchises" },
  retail: { median: 2300, top: 3700, label: "tobacco & vape shops" },
};
const DEFAULT_PEER = { median: 2200, top: 3600, label: "similar businesses" };

export interface Benchmark {
  percentile: number;
  peerMedian: number;
  peerTop: number;
  yourDaily: number;
  label: string;
}

export function benchmarkFor(b: Business, m: Metrics): Benchmark | null {
  if (b.type === "portfolio") return null;
  const peers = PEERS[b.type] ?? DEFAULT_PEER;
  const yourDaily = m.last30 / 30; // USD/day (display currency)
  const ratio = peers.median > 0 ? yourDaily / peers.median : 1;
  // Smooth percentile around the median; capped so it always reads as an estimate.
  const percentile = Math.max(5, Math.min(97, Math.round(50 + 38 * Math.log2(Math.max(0.1, ratio)))));
  return { percentile, peerMedian: peers.median, peerTop: peers.top, yourDaily, label: peers.label };
}
