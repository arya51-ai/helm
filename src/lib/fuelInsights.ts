import type { Business, Insight } from "../types";
import { fuelMetricsFor } from "./fuelAnalytics";
import { usd, usdCompact, pct, signedPct } from "./format";

/**
 * The COO read for a fuel retailer. Speaks the language an operator actually runs on —
 * gallons, cents-per-gallon, and inside (c-store) attach — and connects the two engines:
 * fuel drives traffic, but inside drives profit. Cross-station comparison surfaces the
 * one doing it right so the rest can copy it.
 */
export function buildFuelInsights(stations: Business[]): Insight[] {
  const out: Insight[] = [];
  if (!stations.length) return out;

  const scored = stations
    .map((s) => ({ s, m: fuelMetricsFor(s) }))
    .filter((x): x is { s: Business; m: NonNullable<ReturnType<typeof fuelMetricsFor>> } => x.m != null);

  for (const { s, m } of scored) {
    const name = s.shortName ?? s.name;

    // ── Fuel margin compression ──
    if (m.cpgTrend7 <= -0.08) {
      out.push({
        id: `fuel-cpg-${s.id}`,
        businessId: s.id,
        kind: "alert",
        title: `${name}: fuel margin is compressing`,
        detail: `Cents-per-gallon fell ${signedPct(m.cpgTrend7)} this week to ${m.monthCpg.toFixed(1)}¢. On ${Math.round(
          m.avgGallonsDay,
        ).toLocaleString()} gal/day that's real money. Check your street price against the station down the road — you may be chasing volume you don't need to give away.`,
        priority: 86,
        metric: `${m.monthCpg.toFixed(0)}¢/gal`,
        metricUp: false,
        action: { label: "Review pricing", done: "Opening fuel pricing ✓" },
      });
    }

    // ── Inside attach low: lots of gallons, weak c-store pull-through ──
    if (m.insidePerGallon < 0.85 && m.avgGallonsDay > 3500) {
      const upliftCustomers = Math.round(m.avgGallonsDay / 11); // ~fuel transactions/day
      out.push({
        id: `fuel-attach-${s.id}`,
        businessId: s.id,
        kind: "opportunity",
        title: `${name} fills tanks but doesn't fill baskets`,
        detail: `Inside sales run just ${usd(m.insidePerGallon, true)} per gallon — below where a station this busy should be. You've got ~${upliftCustomers.toLocaleString()} fuel customers a day walking past the door. Even a $1 attach lift is ~${usdCompact(
          upliftCustomers * 30,
        )}/mo. Push the inside: pump-top offers, a coffee/food bundle, better cold-vault placement.`,
        priority: 80,
        metric: `${usd(m.insidePerGallon, true)}/gal`,
        metricUp: false,
        action: { label: "Draft attach plan", done: "Attach plan drafted ✓" },
      });
    }

    // ── Inside is the engine: most profit comes from the store, not the pump ──
    if (m.fuelProfitShare < 0.45 && m.monthInsideMarginPct > 0.3) {
      out.push({
        id: `fuel-inside-star-${s.id}`,
        businessId: s.id,
        kind: "win",
        title: `${name} makes its money inside`,
        detail: `Only ${pct(m.fuelProfitShare, 0)} of gross profit comes from fuel — the c-store carries it at ${pct(
          m.monthInsideMarginPct,
          0,
        )} margin. This is the model: fuel buys the traffic, inside banks the profit. Whatever merchandising works here, copy it to your other stations.`,
        priority: 64,
        metric: `${pct(m.monthInsideMarginPct, 0)} inside`,
        metricUp: true,
      });
    }

    // ── Gallons momentum ──
    if (m.gallonsTrend7 > 0.08) {
      out.push({
        id: `fuel-gal-up-${s.id}`,
        businessId: s.id,
        kind: "win",
        title: `${name} volume is up ${signedPct(m.gallonsTrend7, 0)} this week`,
        detail: `Now ~${Math.round(m.avgGallonsDay).toLocaleString()} gal/day at ${m.monthCpg.toFixed(
          1,
        )}¢. Hold your margin discipline while traffic is strong — and make sure the inside is staffed to convert the extra cars.`,
        priority: 58,
        metric: signedPct(m.gallonsTrend7, 0),
        metricUp: true,
      });
    }
  }

  // ── Cross-station: best vs worst inside attach (the replicable gap) ──
  if (scored.length >= 2) {
    const byAttach = [...scored].sort((a, b) => b.m.insidePerGallon - a.m.insidePerGallon);
    const best = byAttach[0];
    const worst = byAttach[byAttach.length - 1];
    if (best.s.id !== worst.s.id && best.m.insidePerGallon > worst.m.insidePerGallon * 1.25) {
      const gap = best.m.insidePerGallon - worst.m.insidePerGallon;
      const lift = Math.round(gap * worst.m.avgGallonsDay * 30);
      out.push({
        id: "fuel-attach-spread",
        kind: "capital",
        title: `${best.s.shortName ?? best.s.name}'s c-store playbook is worth copying`,
        detail: `${best.s.shortName ?? best.s.name} pulls ${usd(best.m.insidePerGallon, true)} inside per gallon vs ${usd(
          worst.m.insidePerGallon,
          true,
        )} at ${worst.s.shortName ?? worst.s.name}. Same customers walking in — different basket. Bring ${
          worst.s.shortName ?? worst.s.name
        } halfway to ${best.s.shortName ?? best.s.name} and that's ~${usdCompact(lift / 2)}/mo in inside sales.`,
        priority: 72,
        metric: `${usd(gap, true)}/gal gap`,
        metricUp: false,
        action: { label: "Compare stations", done: "Opening comparison ✓" },
      });
    }
  }

  return out.sort((a, b) => b.priority - a.priority);
}
