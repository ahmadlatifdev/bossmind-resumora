#!/usr/bin/env node
/**
 * Continuous production autonomous loop (24/7 monitoring cadence).
 *   npm run bossmind:production:autonomous:loop
 *   npm run bossmind:production:autonomous:loop -- --once
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { runContinuousMonitorCycle } = require(path.join(
  root,
  "lib/orchestration/bossmind-continuous-monitor.js"
));

const cfg = JSON.parse(
  fs.readFileSync(path.join(root, "config/bossmind-production-autonomous.json"), "utf8")
);
const intervalMs = Number(process.env.BOSSMIND_PRODUCTION_MONITOR_MS || cfg.continuousMonitor?.defaultIntervalMs || 300000);
const fullEvery = Number(cfg.continuousMonitor?.fullOptimizationEveryCycles || 4);
const runOnce = process.argv.includes("--once");
const origin = process.env.BOSSMIND_REALITY_LIVE_URL || "https://resumora.net";
const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";

let cycle = 0;
let stopping = false;

process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

async function runLoop() {
  const neon = require(path.join(root, "lib/shared/neon-memory.js"));
  do {
    cycle += 1;
    const fullOptimization = cycle % fullEvery === 0;
    const result = await runContinuousMonitorCycle({
      cwd: root,
      neonApi: neon?.enabled ? neon : null,
      projectKey,
      origin,
      fullOptimization,
    });
    console.log(JSON.stringify({ cycle, ...result }, null, 2));
    if (runOnce) break;
    if (stopping) break;
    await new Promise((r) => setTimeout(r, intervalMs));
  } while (!stopping);
}

runLoop().catch((e) => {
  console.error(e);
  process.exit(1);
});
