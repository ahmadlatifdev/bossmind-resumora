#!/usr/bin/env node
/**
 * Immutable design lock — load snapshot, compare live /pricing, enforce baseline, optional screenshot.
 *   npm run bossmind:immutable:execution-chain
 *   npm run bossmind:immutable:execution-chain -- --screenshot
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { runImmutableExecutionChain } = require(path.join(
  root,
  "lib/orchestration/bossmind-immutable-execution-chain.js"
));

const captureScreenshot = process.argv.includes("--screenshot") || process.env.BOSSMIND_IMMUTABLE_SCREENSHOT === "1";
const origin = process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN || process.env.BOSSMIND_REALITY_LIVE_URL || "https://resumora.net";

let neon = null;
try {
  neon = require(path.join(root, "lib/shared/neon-memory.js"));
  const init = await neon.initializeSharedMemory?.();
  neon = init?.enabled ? neon : null;
} catch {
  neon = null;
}

const report = await runImmutableExecutionChain({
  cwd: root,
  neonApi: neon,
  projectKey: process.env.BOSSMIND_PROJECT_KEY || "resumora",
  origin,
  captureScreenshot,
});

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 2);
