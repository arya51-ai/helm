// Vercel serverless function — POST /api/agent/vision  ("Snap a report")
// Extracts structured numbers from a photo of a sales/hotel report. Returns:
//   { available:false }  (no key — caller degrades to manual entry)
//   | { kind:"hotel", adr, occupancy(0..1), revpar, asOf }
//   | { kind:"sales", date, grossSales, netSales, transactions }
// Any field not clearly visible is null (never fabricated). Delegates to handleVision.
// ESM: package.json "type":"module" → this .js file is ESM; the .mjs import resolves on Vercel.
import { handleVision, guardAgentRequest } from "../../server/agent.mjs";

export default async function handler(req, res) {
  const guard = guardAgentRequest(req);
  if (!guard.ok) return res.status(guard.status).json(guard.body);
  const body = req.body || {};
  const result = await handleVision({
    imageBase64: body.imageBase64,
    mediaType: body.mediaType,
    businessType: body.businessType,
  });
  res.status(200).json(result);
}
