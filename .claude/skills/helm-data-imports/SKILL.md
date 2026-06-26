---
name: helm-data-imports
description: Use when adding a new data source, wiring real data in place of mock, or touching the import pipelines (CSV/XLSX upload, Snap-a-report vision, manual entry, holdings) — or when you need the Business/DayPoint/HotelDay/FuelDay type contracts. The plug-and-play layer that lets any source light Helm up.
---

# Helm — data sources & imports

Goal: any source becomes a `Business[]` and merges into the same pipeline. Plug-and-play is the whole point — the UI/AI don't care where data came from.

## The contracts (`src/types.ts`)
- **`Business`** — `id`, `name`, `type`, `location`, `currency?`, `capitalDeployed`, `netMargin?`, `series: DayPoint[]`, plus type-specific: `holdings?`/`annualReturn?` (portfolio), `hotelSeries?`/`brand?`/`rooms?`/`pipItems?`/`independent?`/`channelMix?`/`pms?` (hotel/motel), `fuelSeries?`/`pumps?` (fuel).
- **`DayPoint`** = `{ date: ISO, revenue: number, transactions: number }` — the universal operating series.
- **`HotelDay`** (occupancy/ADR/RevPAR/GOP/labor/compSetRevpar/RGI), **`FuelDay`** (gallons/CPG/inside/margins), **`Holding`** (ticker/shares/price/costBasis), **`ChannelMix`**, **`PipItem`**.

## Adding a data source (the recipe)
1. Produce `Business[]` whose `series` passes `isValidBusiness` (`id` + non-empty `series` with `date`/`revenue`). `normalizeSeries` coerces + sorts.
2. **Convert to the display currency before merging into state** — uploads arrive native (a CAD shop); the rest of state is USD, so an unconverted insert skews empire totals (`mergeBusiness` in `App.tsx`).
3. Persist via `upsertImported` (localStorage `helm:imported:v1`, merge by id). It then flows through the standard loader (see [[helm-architecture]]).

## Import pipelines
- **CSV/XLSX** (`src/lib/import.ts`): auto-detects columns by synonym (`DATE_KEYS`, `NET/GROSS/REV_KEYS`, `TXN_KEYS`), infers the date format **once per column** (Excel serial / YYYY-MM-DD / month name / MDY vs DMY), flags `revenueLooksGross`.
- **Hotel** (`src/lib/hotelImport.ts`): parses STR/PMS exports; `manualHotel(meta)` synthesizes a believable series from rooms+ADR+occupancy. **Honesty flags** `hasComp`/`hasCost` → UI shows "estimated" instead of faking precision (RGI defaults to 100, margins estimated).
- **Fuel** (`src/lib/fuelImport.ts`), **Holdings** (`src/lib/holdings.ts`) — same synonym-detect pattern.
- **Snap a report (vision)** — `handleVision` in `server/agent.mjs`: a photo → strict JSON (sales or hotel shape), **null for anything not clearly visible** (never fabricated), degrades to manual entry with no key. See [[helm-ai-brain]].

## Gotchas
- Honesty over precision: if comp-set/labor data is absent, log it in `derived[]` and set the estimated flags — don't silently invent.
- Date inference is per-column, not per-cell; Excel serials are UTC-midnight (decode to avoid TZ shift).
- Independent-motel data stays CAD end-to-end — don't convert it (see [[helm-domain-verticals]]).
- Real `/data.json` overrides sample by id; imports override `/data.json`; overrides patch display fields; removed hides — know which layer you're writing (see [[helm-architecture]]).
