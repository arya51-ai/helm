# Proposal: harden `/vision` JSON with structured outputs (NOT applied)

**Status:** ready to drop in — apply + test during a key-on session. Not applied to
`server/agent.mjs` yet because it can't be runtime-verified without spending API tokens,
and that file is under concurrent edit.

## Why

The "Snap a report" flow (`handleVision`) extracts numbers from a photo and must return a
strict JSON shape. We briefly tried forcing that with an **assistant prefill** (`{`), but
**Sonnet 4.6 — and the whole 4.6/4.7/4.8 family — rejects last-assistant-turn prefills with a
400** (confirmed via the `claude-api` reference). That silently sends every snap to the manual
fallback. The prefill was reverted.

The correct way to force a JSON shape on Sonnet 4.6 is **structured outputs** (`output_config.format`)
— the reference names it as the direct replacement for prefill. It constrains the model's output to
a JSON schema, so the reply is guaranteed parseable and shaped, with no fences/preamble to scrape.

## API facts that shaped this (from the claude-api reference)

- `output_config: { format: { type: "json_schema", schema: {...} } }` on `messages.create()`.
  (The old top-level `output_format` is deprecated.)
- **Supported on Sonnet 4.6** (also Fable 5 / Opus 4.8 / Haiku 4.5). No beta header needed.
- Installed SDK is `@anthropic-ai/sdk ^0.100.1` — recent enough to support `output_config`. Verify at apply time.
- JSON-schema limits that matter here: **every object needs `additionalProperties: false`**, and
  **numeric range constraints (`minimum`/`maximum`) are NOT supported**. So we can't enforce
  "occupancy between 0 and 1" in the schema — keep the existing `occ > 1 ? occ/100` post-processing.
- Express "field may be absent" as a **null union type** (`["number","null"]`) with the field still
  in `required` — this matches Helm's contract: not clearly visible → `null`, never guessed.
- First request with a new schema pays a one-time compile cost; then it's cached 24h. Negligible.
- Incompatible with prefill + citations (we use neither). Works with image input.

## The change

### 1. Add two schema consts just above `export async function handleVision`

```js
// Structured-output schemas for /vision. The model's reply is constrained to these, so the
// JSON comes back shaped and parseable without fences/preamble (replaces the rejected prefill).
// NOTE: structured outputs can't enforce numeric ranges, so occupancy 0..1 is still normalized
// in post-processing below. All fields are required + null-union so "not visible" → null.
const VISION_HOTEL_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", const: "hotel" },
    adr: { type: ["number", "null"] },
    occupancy: { type: ["number", "null"] },
    revpar: { type: ["number", "null"] },
    asOf: { type: ["string", "null"] },
  },
  required: ["kind", "adr", "occupancy", "revpar", "asOf"],
  additionalProperties: false,
};
const VISION_SALES_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", const: "sales" },
    date: { type: ["string", "null"] },
    grossSales: { type: ["number", "null"] },
    netSales: { type: ["number", "null"] },
    transactions: { type: ["integer", "null"] },
  },
  required: ["kind", "date", "grossSales", "netSales", "transactions"],
  additionalProperties: false,
};
```

### 2. Add `output_config` to the `messages.create()` call inside `handleVision`

**FROM** (current, post-revert):

```js
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: media, data } },
            { type: "text", text: instruction },
          ],
        },
      ],
    });
```

**TO:**

```js
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      output_config: {
        format: {
          type: "json_schema",
          schema: isHotel ? VISION_HOTEL_SCHEMA : VISION_SALES_SCHEMA,
        },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: media, data } },
            { type: "text", text: instruction },
          ],
        },
      ],
    });
```

That's the whole change. **Leave the rest of `handleVision` exactly as-is** — the existing
text-scrape (`raw.match(/\{[\s\S]*\}/)` → `JSON.parse`), the `occ > 1 ? occ/100` normalization,
and the null-shape fallbacks all still work and stay as defense-in-depth. The `instruction`
strings can stay too; the field-by-field rules ("adr in dollars", "null if not clearly visible")
still do real work — structured outputs enforces the *shape*, not the *semantics*. (Optional
later cleanup: drop the now-redundant "respond with ONLY a JSON object, no markdown fences"
sentence from both instructions, since the format is enforced.)

## How to test (key-on)

1. Set `ANTHROPIC_API_KEY` in `.env`, `npm run dev`.
2. Use "Snap a report" with a real POS/STR photo (or POST a base64 image to `/api/agent/vision`).
   Expect a clean, schema-valid object; fields not on the photo come back `null`.
3. Negative check: a blurry/unrelated photo should yield all-`null` (never fabricated numbers).
4. Watch for a `stop_reason: "refusal"` or `max_tokens` edge — both can yield non-conforming output;
   the existing fallback already returns the no-data shape, so the UI degrades to manual entry safely.

## Optional follow-on: a vision eval fixture

The current `evals/` runner is text-route only (`ask`/`brief`/`draft`). To regression-test vision,
extend `evals/run.mjs` with a `kind: "vision"` branch that calls `handleVision({ imageBase64, mediaType, businessType })`
and add a fixture embedding a small base64 image + an `expect` like
`{ "mustEqual": { "kind": "hotel", "occupancy": 0.72 } }`. Left out here to keep this change small.

## Rollback

Additive and self-contained: delete the two schema consts and the `output_config` block to return
to the current strict-instruction + scrape behavior.
