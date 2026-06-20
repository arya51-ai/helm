// Vercel serverless function — POST /api/agent/draft
// Returns a drafted action artifact as JSON (same shape as brief). The owner reviews/sends it.
// Delegates to the shared handler in server/agent.mjs.
// ESM: package.json "type":"module" → this .js file is ESM; the .mjs import resolves on Vercel.
import { handleDraft } from "../../server/agent.mjs";

export default async function handler(req, res) {
  const body = req.body || {};
  const result = await handleDraft({
    action: body.action,
    insight: body.insight ?? null,
    context: body.context ?? {},
  });
  res.status(200).json(result);
}
