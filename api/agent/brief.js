// Vercel serverless function — POST /api/agent/brief
// Returns the morning brief as JSON: { available:false } | { available:true, text } | { available:true, error }.
// Delegates to the shared handler in server/agent.mjs.
// ESM: package.json "type":"module" → this .js file is ESM; the .mjs import resolves on Vercel.
import { handleBrief, guardAgentRequest } from "../../server/agent.mjs";

export default async function handler(req, res) {
  const guard = guardAgentRequest(req);
  if (!guard.ok) return res.status(guard.status).json(guard.body);
  const body = req.body || {};
  const result = await handleBrief({ context: body.context ?? {}, previousBrief: body.previousBrief ?? null });
  res.status(200).json(result);
}
