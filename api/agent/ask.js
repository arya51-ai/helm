// Vercel serverless function — POST /api/agent/ask
// Streams the answer back as SSE (data:{t} frames + a final {done:true}), grounded in the
// supplied owner_state. handleAsk sets the SSE headers and writes/ends `res` itself, so this
// wrapper just forwards the request body and the Express-compatible `res`.
// ESM: package.json "type":"module" → this .js file is ESM; the .mjs import resolves on Vercel.
import { handleAsk } from "../../server/agent.mjs";

export default async function handler(req, res) {
  // Vercel parses JSON bodies into req.body for application/json requests.
  const body = req.body || {};
  await handleAsk({ question: body.question, context: body.context ?? {} }, res);
}
