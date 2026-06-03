// Helm — Tally (TallyPrime) connector
// ─────────────────────────────────────────────────────────────────────────────
// TallyPrime is the dominant SMB accounting system in India. It runs locally and
// exposes an HTTP-XML gateway (default http://localhost:9000 when "Enable XML/HTTP"
// is on). This connector pulls a Day Book / sales summary from there and normalizes
// it to Helm's daily series. Two modes, like the Plaid connector:
//   • CONFIGURED (TALLY_URL set + reachable) → real pull from the gateway.
//   • DEMO (no URL / unreachable) → a realistic INR pharmacy series, so the flow is
//     demoable today and flips to real the moment Tally is reachable.
// Mounted at /api/tally (Vite dev plugin + standalone server/index.mjs).
import "dotenv/config";
import express from "express";
import cors from "cors";

const TALLY_URL = process.env.TALLY_URL?.trim();

// ── Deterministic demo series (stable across reloads) ────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function demoSeries(days = 90) {
  const rnd = mulberry32(73);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Sun..Sat — a pharmacy is steady, with a mild weekend lift and slow Sundays.
  const dow = [0.82, 1.0, 1.03, 1.0, 1.04, 1.14, 1.12];
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const trend = 1 + 0.12 * ((days - 1 - i) / (days - 1)); // gentle growth
    const noise = 1 + (rnd() - 0.5) * 0.18;
    const revenue = Math.round(52000 * dow[d.getDay()] * trend * noise); // ₹/day
    const ticket = 240 * (1 + (rnd() - 0.5) * 0.1);
    out.push({ date: isoDate(d), revenue, transactions: Math.max(1, Math.round(revenue / ticket)) });
  }
  return out;
}

// ── Best-effort real pull from the Tally HTTP-XML gateway ────────────────────
// NOTE: Tally's XML shape varies by version/configuration. This requests the Day
// Book as XML and aggregates Sales vouchers by date. Tune selectors against your
// own export if needed; any failure falls back to demo so the UX never breaks.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function tallyDate(d) {
  return `${d.getDate()}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}
async function fetchFromTally(url, days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days + 1);
  const xml =
    `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA>` +
    `<REQUESTDESC><REPORTNAME>Day Book</REPORTNAME><STATICVARIABLES>` +
    `<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>` +
    `<SVFROMDATE>${tallyDate(from)}</SVFROMDATE><SVTODATE>${tallyDate(to)}</SVTODATE>` +
    `</STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml;charset=utf-8" },
    body: xml,
    signal: AbortSignal.timeout(8000),
  });
  const text = await r.text();
  const byDate = new Map();
  // Each <VOUCHER ...>…</VOUCHER>; keep Sales, read <DATE>YYYYMMDD</DATE> + first <AMOUNT>.
  const vouchers = text.match(/<VOUCHER\b[\s\S]*?<\/VOUCHER>/g) || [];
  for (const v of vouchers) {
    if (!/sales/i.test((v.match(/VCHTYPE="([^"]*)"/)?.[1] || "") + (v.match(/<VOUCHERTYPENAME>([^<]*)</)?.[1] || ""))) continue;
    const ymd = v.match(/<DATE>(\d{8})<\/DATE>/)?.[1];
    const amt = parseFloat((v.match(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/)?.[1] || "0"));
    if (!ymd || !amt) continue;
    const date = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    const cur = byDate.get(date) || { revenue: 0, transactions: 0 };
    cur.revenue += Math.abs(amt);
    cur.transactions += 1;
    byDate.set(date, cur);
  }
  const series = [...byDate.entries()]
    .map(([date, v]) => ({ date, revenue: Math.round(v.revenue), transactions: v.transactions }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!series.length) throw new Error("No Sales vouchers parsed from Day Book");
  return series;
}

function totals(series) {
  return {
    days: series.length,
    revenue: Math.round(series.reduce((a, p) => a + p.revenue, 0)),
    transactions: series.reduce((a, p) => a + p.transactions, 0),
  };
}

export async function createTallyApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/status", (_req, res) => {
    res.json({ configured: Boolean(TALLY_URL), demo: !TALLY_URL, url: TALLY_URL || null });
  });

  // Pull daily sales. Body: { days?: number, url?: string }.
  app.post("/sync", async (req, res) => {
    const days = Math.min(370, Math.max(7, Number(req.body?.days) || 90));
    const url = (req.body?.url || TALLY_URL || "").trim();
    if (url) {
      try {
        const series = await fetchFromTally(url, days);
        return res.json({ company: "Tally company", currency: "INR", series, totals: totals(series), demo: false });
      } catch (err) {
        // fall through to demo, but tell the client what happened
        const series = demoSeries(days);
        return res.json({
          company: "Demo Pharmacy",
          currency: "INR",
          series,
          totals: totals(series),
          demo: true,
          note: `Couldn't read Tally at ${url} (${err?.message || "unreachable"}). Showing a demo series.`,
        });
      }
    }
    const series = demoSeries(days);
    res.json({ company: "Demo Pharmacy", currency: "INR", series, totals: totals(series), demo: true });
  });

  return app;
}
