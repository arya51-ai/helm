---
name: helm-domain-verticals
description: Use when writing or reviewing anything that speaks a business's language — metrics, insights, AI copy, or UI labels for restaurants/retail, hotels vs independent motels, fuel stations, or the investment portfolio. Getting the vocabulary right (RevPAR vs occupancy, USD vs CAD) is the product's soul.
---

# Helm — domain verticals (speak each owner's language)

`BusinessType = "restaurant" | "retail" | "portfolio" | "hotel" | "fuel"`. The hospitality split is driven by one flag: **`independent`** on a `hotel` flips the entire read from chain language to owner-operator language.

## Restaurant / Retail (Subway, Riverside smoke shop)
Generic `DayPoint` series. Lead metrics: **ROIC** (annualized profit ÷ capital deployed — the apples-to-apples yardstick across every business), **vsExpected** (today vs a typical SAME weekday — isolates real anomalies from weekly rhythm), `wow`, `avgTicket`. `src/lib/analytics.ts`.

## Flagged/chain hotel (`.hotel` block — `src/lib/hotelAnalytics.ts`)
Chain language: **RevPAR** (= occupancy × ADR, the headline), **RGI** (RevPAR Index vs the STR comp set, 100 = fair share; <100 losing share — the sharpest "are we winning?"), **ADR**, **occupancy**, **GOP margin**, **laborPct**, **PIP** (Property Improvement Plan = brand-mandated capital work; overdue = franchise-compliance risk). Always reconcile rate vs volume before prescribing (high ADR + soft occupancy + RGI<100 → trim BAR on weak days).

## Independent motel (`.motel` block — `src/lib/motelInsights.ts`; Northwood, `src/data/northwood.ts`)
Owner-operator language — these owners do **not** think in RevPAR Index / GOP / PIP; never use those terms here. Lead with:
- **How full tonight** (occupancy), the **nightly rate (ADR)**, and the two levers they pull: **price** and **where the booking comes from**.
- **Channels** are the heart: `directShare` is the prize (no commission); `bookingCom`/`expedia`/OTA shares flow through a cut. `monthCommissionCad` is the real money lost; `shift10pctToDirect…` quantifies moving 1-in-10 OTA stays to direct. Lead with this for any fee/margin/commission question.
- **Seasonality** is everything on a tourist island — `daysToSummerfestWeekend` (Aug 1–4 sellout = pure pricing power).
- **ALL motel money is CAD — say CA$ and NEVER convert to USD.** Reference "from Little Hotelier" (the channel manager).

## Fuel (`.fuel` series — `src/lib/fuelAnalytics.ts`)
Two-engine economics: thin-margin fuel + fat-margin c-store. Lead numbers: **CPG** (cents-per-gallon — what fuel retailers live by), gallons, and the **inside attach** (c-store $ per gallon).

## Portfolio
`holdings[]`, market value, total return, day change. Its ROIC (~9%) is the **benchmark** the operating businesses are measured against — the cross-empire capital-allocation move (pull idle cash from low-ROIC into high-ROIC, or out of the market into a 37% smoke shop) is the differentiator. See `reallocate_what_if` in [[helm-ai-brain]].

## The differentiator (why Helm exists)
One view across every business + investments on **one yardstick (ROIC)**, plus a cross-empire σ-anomaly feed (`anomalies.ts`) no single-POS tool can assemble. Always reason at the level of the whole empire, not one business in isolation.

## Gotchas
- Never mix chain and independent vocabulary; check `b.independent` before choosing terms.
- Motel CAD is never converted; chain hotels and everything else convert to USD.
- PIP overdue / low review score = reputational/compliance flags worth surfacing.
- See [[helm-architecture]] for where these metrics are computed and [[helm-data-imports]] for the type contracts.
