import type { AskContext } from "./ask";
import { usd, usdCompact, pct } from "./format";
import { momentum } from "./patterns";

/**
 * The baked "Helm's read" — the morning narrative an AI COO would write, composed from the
 * same live signals the deep-insight cards use. This is what renders in the "Helm's read"
 * card when no ANTHROPIC_API_KEY is configured: not a canned string, but reasoning over the
 * current numbers, so it stays true as the data rolls forward. When a key *is* present,
 * agent.ts prefers the real model and this is the graceful fallback.
 */
export function bakedBrief(ctx: AskContext): string {
  const { businesses, metricsBy, empire, idleCash } = ctx;
  const ops = businesses.filter((b) => b.type !== "portfolio");
  if (!ops.length) return "";

  const ranked = [...ops].sort((a, b) => (metricsBy[b.id]?.roic ?? 0) - (metricsBy[a.id]?.roic ?? 0));
  const parts: string[] = [];

  // 1) Empire snapshot — what the month looks like at a glance.
  parts.push(
    `You're running about ${usd(empire.last30)} across the shops over the last 30 days, with net worth around ${usdCompact(
      empire.netWorth,
    )}.`,
  );

  // 2) The hardest-working asset.
  const star = ranked[0];
  const sm = star ? metricsBy[star.id] : undefined;
  if (star && sm && sm.roic > 0) {
    parts.push(
      `${star.shortName ?? star.name} is doing the heavy lifting — about ${pct(sm.roic, 0)} return on the capital in it, your most efficient dollar.`,
    );
  }

  // 3) The thing to actually watch — a year-over-year decliner, with the honest nuance.
  for (const b of ops) {
    const mom = momentum(b.series);
    if (mom.yoy != null && mom.yoy <= -0.05) {
      const name = b.shortName ?? b.name;
      if (mom.m90 >= 0.05) {
        parts.push(
          `Keep an eye on ${name}: still down ${pct(Math.abs(mom.yoy), 0)} year over year, though the last 90 days (+${pct(
            mom.m90,
            0,
          )}) say the bleeding has stopped — its strong days are pulling it back up.`,
        );
      } else {
        parts.push(
          `${name} needs a real look — down ${pct(Math.abs(mom.yoy), 0)} year over year, a slide the daily totals quietly hide.`,
        );
      }
      break;
    }
  }

  // 4) The capital nudge — idle cash has an opportunity cost you can name.
  if (idleCash > 0 && star && sm && sm.roic > 0) {
    parts.push(
      `And you've got ${usd(idleCash)} sitting idle — at ${star.shortName ?? star.name}'s ${pct(
        sm.roic,
        0,
      )} that's roughly ${usd(idleCash * sm.roic)}/yr you're leaving on the table.`,
    );
  }

  return parts.join(" ");
}
