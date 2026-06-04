// Standalone Helm Plaid connector — for real deployments where the frontend is served
// separately (static host) and proxies /api to this service. In local dev you don't need
// this: the same connector is mounted inside Vite (see vite.config.ts), so `npm run dev`
// alone serves everything. Run with: npm run server
import "dotenv/config";
import express from "express";
import { createConnectorApp } from "./connector.mjs";
import { createTallyApp } from "./tally.mjs";
import { createAgentApp } from "./agent.mjs";
import { startNightlyRefresh } from "./cron.mjs";

const PORT = process.env.PORT || 8787;
const app = express();
app.use("/api/plaid", await createConnectorApp());
app.use("/api/tally", await createTallyApp());
app.use("/api/agent", await createAgentApp());

// Opt-in nightly refresh ("your COO worked the night shift"). Wire real connector
// pulls + Brief regeneration + push dispatch inside the callback for a deployment.
if (process.env.HELM_CRON === "1") {
  startNightlyRefresh(async () => {
    // Placeholder: re-pull connectors here so morning numbers are fresh; the Brief
    // regenerates client-side on next open (or via web-push once VAPID is set up).
  });
}
app.get("/", (_req, res) => res.send("Helm Plaid connector is running. Endpoints live under /api/plaid"));
app.listen(PORT, () => console.log(`Helm Plaid connector → http://localhost:${PORT}/api/plaid`));
