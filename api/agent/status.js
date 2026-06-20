// Vercel serverless function — GET /api/agent/status
// Feature-detection endpoint: the frontend (src/lib/agent.ts, API='/api/agent') calls this once
// and falls back to the local rule engine when { available:false }. Delegates to the shared
// handler in server/agent.mjs so dev (Express) and deploy (Vercel) share one code path.
// ESM: package.json has "type":"module", so this .js file is ESM and the .mjs import resolves.
import { handleStatus } from "../../server/agent.mjs";

export default async function handler(req, res) {
  // env is read from process.env inside agent.mjs (ANTHROPIC_API_KEY / HELM_ASK_MODEL / HELM_BRIEF_MODEL),
  // which Vercel populates from the project's environment variables. No key → { available:false }.
  res.status(200).json(handleStatus());
}
