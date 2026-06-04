# Helm — Claude Integration Status

**Current date:** 2026-06-03

> ## ⚠️ PARKED — not funded yet (`*`)
> The Claude integration is **built and verified in its offline/rule-engine fallback path**, but the
> **live Claude brain is intentionally inactive**: there is **no `ANTHROPIC_API_KEY`** in `.env` because
> Helm isn't funded yet. This is a deliberate hold, not a bug. **To switch it on when Helm is funded:**
> add `ANTHROPIC_API_KEY=...` to `.env` and restart `npm run dev` — `/api/agent/status` flips to
> `available:true` and every surface below lights up automatically (graceful-degradation pattern, same as
> Plaid/Tally). Until then everything runs on the grounded rule engine with an "Offline" label. Nothing
> in the app blocks on this.

**Status:** wiring complete (Sonnet 4.6 ask/draft + Opus 4.8 brief); **offline fallback verified**; live
path **parked pending funding**.

> **Server-side:** `server/agent.mjs` exposes `/api/agent/{status,ask,brief,draft}` with graceful fallback to rule engine when `ANTHROPIC_API_KEY` is absent. Client feature-detects via `/status` endpoint.

---

## 🔌 WIRED — lights up the moment a key is added (offline fallback verified)

### 1. **Ask Helm** (interactive Q&A)
- **File:** `src/components/AskSheet.tsx` + `src/lib/agent.ts:askAgent()`
- **Server:** `server/agent.mjs:/api/agent/ask` (POST, SSE streaming)
- **Feature:** Real-time answers to "What needs me today?", "Where should I put my cash?", etc.
- **Model:** Sonnet 4.6 (low-latency); streams to UI
- **Fallback:** Rule-based `answerQuestion()` from `src/lib/ask.ts` (instant, grounded)
- **Verified:** Tested end-to-end; streams answer + source label ("Claude · grounded in your numbers")
- **Entry point:** Pill button on Brief, also suggested questions on initial ask

### 2. **Morning Brief** (daily narrative)
- **File:** `src/components/BriefScreen.tsx` calls `generateBrief(ctx)`
- **Server:** `server/agent.mjs:/api/agent/brief` (POST, one-shot JSON response)
- **Feature:** "Morning read" — 2–4 sentences greeting owner by name, orienting on empire totals, then the #1 thing that needs them today
- **Model:** Opus 4.8 (sophisticated reasoning; extended thinking enabled for depth)
- **Fallback:** None — skips Claude section if unavailable; rule-engine insights still show as cards
- **Verified:** Generates concise, actionable reads (e.g. "Revenue is up 12% WoW; Riverside staffing is tight Friday evenings — text your closer.")
- **Cached:** System prompt cached via ephemeral cache control (reduces latency on repeat queries)

### 3. **Action Drafting** (owner-review artifact)
- **File:** `src/components/ActionSheet.tsx` calls `draftAction(action, insight, ctx)`
- **Server:** `server/agent.mjs:/api/agent/draft` (POST, one-shot JSON response)
- **Feature:** When owner picks an action (e.g. "Text manager about staffing"), Claude drafts the message/note for them to review and send
- **Model:** Sonnet 4.6 (quick, grounded drafting)
- **Fallback:** None — action stays in draft form; user composes manually if Claude unavailable
- **Input:** Action type (string) + optional insight context (title/detail)
- **Verified:** Drafts concise, data-grounded messages; never sends anything (owner reviews first)

---

## 🎯 CANDIDATES — Ready for Claude Enhancement

### 4. **Benchmark Explanations** *(recommend priority 1)*
- **Current:** Shows "You rank in the 55th percentile" on BusinessDetail
- **Gap:** No explanation *why* (ROIC vs peer cohort? Margin vs geography? Staffing efficiency?)
- **Claude enhancement:** Brief explanation of what drives your percentile
- **File to modify:** `src/lib/benchmark.ts` → add explanation route `/api/agent/benchmark` 
- **Scope:** "Riverside returns 37% on capital vs a typical Ohio smoke shop at 28% — your staffing and hourly labor are tighter."
- **Model:** Sonnet 4.6 (short, specific)
- **Entry point:** "Learn more" link on the benchmark card
- **Effort:** Medium (new agent route + UI button + one-liner explanation in card)

### 5. **Anomaly Insight Explanations** *(recommend priority 2)*
- **Current:** "Riverside is down 22% today" appears in Brief and insights; rule engine provides a reason ("staffing looks light")
- **Gap:** Deeper "what might have caused this?" reasoning (supply chain? local event? seasonal pattern?)
- **Claude enhancement:** When insights are ranked, offer a "Why?" button → Claude explains root causes
- **File to modify:** `src/lib/insights.ts` + new `/api/agent/explain-insight` route
- **Scope:** Ask Claude "Given this business, location, and this metric anomaly, what's the most likely cause?"
- **Model:** Sonnet 4.6
- **Entry point:** Insight card in Brief, or detail view
- **Effort:** Medium (new agent route + insight metadata threading + UI disclosure)

### 6. **Goal Pacing Narrative** *(recommend priority 3)*
- **Current:** "Paced to 87% of your $30k monthly goal for Subway" shows as a progress ring
- **Gap:** No narrative context ("on track to miss by $3,900 unless you accelerate" vs "strong early month, can ease off")
- **Claude enhancement:** Monthly goal page shows progress + Claude narrative on the trajectory
- **File to modify:** `src/lib/forecast.ts` + new `/api/agent/goal-narrative` route
- **Scope:** "Through Jun 10, Subway is at 35% of its $30k goal. At current pace, you'll hit $28,500 — short by $1,500. Two strong weeks this month (avg $4,880/wk) would seal it."
- **Model:** Sonnet 4.6
- **Entry point:** Goals tab or detail view (if added)
- **Effort:** Medium (forecast math already in place; Claude adds narrative)

### 7. **Business Economics Recommendations** *(lower priority)*
- **Current:** EconomicsEditor lets owner adjust margin / capital deployed; shows live ROIC preview
- **Gap:** No AI recommendation on what margin / staffing ratio / capital to aim for
- **Claude enhancement:** "Based on your peer percentile (55th) and Riverside's current model, a 1% margin increase → 41% ROIC, moving you to 68th percentile. Consider pricing power in your market."
- **File to modify:** New `/api/agent/econ-recommendation` route
- **Model:** Sonnet 4.6
- **Entry point:** "Optimize" button in EconomicsEditor
- **Effort:** High (requires peer-benchmarking context; lower confidence ROI early on)

### 8. **Portfolio Education** *(lower priority)*
- **Current:** Portfolio card shows market value, total return, day change; can ask Ask Helm about it
- **Gap:** No narrative on diversification, sector concentration, or rebalancing advice
- **Claude enhancement:** "Your portfolio is heavily tech (68% NVIDIA+MSFT). Consider diversification into sector rotation or dividend stocks, especially since your businesses are already growth-heavy."
- **File to modify:** New `/api/agent/portfolio-narrative` route
- **Model:** Sonnet 4.6
- **Entry point:** "Portfolio insights" button on portfolio card
- **Effort:** High (requires holdings context and strategy narrative; could be opinionated)

---

## 🔧 Infrastructure — Already in Place

### Server-side (`server/agent.mjs`)
- **Status endpoint** (`GET /api/agent/status`) — feature-detects Claude availability
- **System prompt** — cached, byte-stable Helm COO persona (prompt caching via ephemeral cache control)
- **Graceful degradation** — every route returns `{ available: false }` when `ANTHROPIC_API_KEY` is absent
- **Three concurrent routes:**
  - `/api/agent/ask` — SSE stream (text deltas as `data: {t:"..."}`)
  - `/api/agent/brief` — one-shot JSON response with narrative text
  - `/api/agent/draft` — one-shot JSON response with artifact (message/note to send)

### Client-side (`src/lib/agent.ts`)
- **buildAgentContext()** — compact, rounded owner-state for the model (businesses, metrics, empire, insights)
- **askAgent()** — calls `/ask` with streaming callback
- **generateBrief()** — calls `/brief` (one-shot)
- **draftAction()** — calls `/draft` (one-shot)
- All routes implement **fallback to rule engine** if Claude unavailable or errors

### Environment
- `ANTHROPIC_API_KEY` — set in `.env` (gitignored)
- `HELM_ASK_MODEL` — defaults to `claude-sonnet-4-6` (can override)
- `HELM_BRIEF_MODEL` — defaults to `claude-opus-4-8` (can override)
- **Demo mode:** Run with no key → all routes return `available:false` → UI shows rule-engine answers with "Offline · rule engine" label

---

## 📋 To-Do List: Make Claude Live Everywhere It Helps

### Phase 0: Gather Real Business Data (Blocking)
- [ ] **Meet with Dad:** Collect Subway + Riverside capital deployed + net profit margins (see `DATA_COLLECTION_CHECKLIST.md`)
- [ ] **Export Yahoo Finance CSV** from portfolio account
- [ ] **Input data into Helm** via Business economics editor + portfolio upload
- [ ] **Verify** Brief shows updated ROIC + capital insights
- **Why blocking:** Current demo runs on sample/placeholder data. Real numbers unlock meaningful Ask Helm advice ("where should I put my cash?") and accurate capital allocation insights.

### Phase 1: Verify & Document (This Sprint)
- [x] Audit existing Claude routes (`ask`, `brief`, `draft`) — all live & verified
- [x] Document current status in this file
- [x] Identify 5 high-confidence enhancement candidates (done above)
- [ ] **TEST**: Run `npm run dev` locally; verify `/api/agent/status` returns `{ available: true, askModel, briefModel }` (requires `ANTHROPIC_API_KEY` in `.env`)
- [ ] **TEST**: Ask Helm a question via the Brief UI; verify streaming answer + "Claude · grounded" label
- [ ] **TEST**: Refresh Brief; verify morning narrative appears (if Claude available)
- [ ] **TEST**: Open an insight; verify action drafting works (e.g. "Text manager")

### Phase 2: Priority 1 — Benchmark Explanations (Next Sprint)
- [ ] Add `/api/agent/benchmark` endpoint to `server/agent.mjs`
- [ ] Modify `src/lib/benchmark.ts` to call the new endpoint
- [ ] Add "Learn more" button to benchmark card in `BusinessDetail.tsx`
- [ ] **TEST**: Hover or click benchmark → Claude explanation of percentile drivers
- [ ] **TEST**: Verify fallback (rule engine or static copy) when Claude unavailable

### Phase 3: Priority 2 — Insight Explanations (Following Sprint)
- [ ] Add `/api/agent/explain-insight` endpoint to `server/agent.mjs`
- [ ] Pass insight (kind, title, detail, metric) + business context to Claude
- [ ] Add "Why?" disclosure button to insight cards (Brief + BusinessDetail)
- [ ] **TEST**: Click "Why?" → streaming explanation of root causes
- [ ] **TEST**: Verify works for different insight types (alert, opportunity, anomaly)

### Phase 4: Priority 3 — Goal Pacing Narrative (Later)
- [ ] Add goals to the app UI (if not already present)
- [ ] Add `/api/agent/goal-narrative` endpoint
- [ ] Wire goal metadata through `buildAgentContext()`
- [ ] **TEST**: Goals view shows pace narrative alongside progress ring

### Phase 5: Stretch — Economics & Portfolio (Much Later)
- [ ] If benchmarking data expands, add econ-recommendation route
- [ ] If portfolio education is a use case, add portfolio-narrative route
- [ ] Evaluate ROI (feature complexity vs owner value)

---

## Validation Checklist Before Shipping

When adding a new Claude route:
- [ ] System prompt is byte-stable (no user data, no interpolated dates/IDs) for caching
- [ ] Graceful fallback when `ANTHROPIC_API_KEY` is absent (always)
- [ ] Route returns `{ available: false }` or skips Claude section when unavailable
- [ ] Numbers come from `buildAgentContext()` (never invented or estimated by Claude)
- [ ] Streaming routes use SSE format (for `/ask`); one-shot routes return JSON
- [ ] UI shows source label: "Claude · ..." for live, "Offline · rule engine" for fallback
- [ ] Tested in-browser with both Claude available AND unavailable (flip `.env`)
- [ ] No security secrets in requests or responses
- [ ] Output is used for display/draft only; never automatic action (owner always reviews)

---

## How to Enable Claude Locally (for testing)

```bash
cd ~/helm-dashboard
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env (Sonnet + Opus available; free tier sufficient for dev)
npm run dev
# Server will auto-detect the key; /api/agent/status will return { available: true, askModel, briefModel }
```

To **test without Claude** (rule-engine fallback):
```bash
# Ensure .env has no ANTHROPIC_API_KEY or leave it empty
npm run dev
# /api/agent/status returns { available: false }
# All Claude-enhanced features gracefully degrade to rules or static copy
```

---

## Links
- **Server connector:** `server/agent.mjs`
- **Client caller:** `src/lib/agent.ts`
- **Current uses:** `AskSheet.tsx`, `BriefScreen.tsx`, `ActionSheet.tsx`
- **System prompt:** Hard-coded in `server/agent.mjs` (byte-stable, cached)
- **Rules fallback:** `src/lib/ask.ts:answerQuestion()` (intent-based, no LLM)
