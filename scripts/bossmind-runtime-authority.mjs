#!/usr/bin/env node
/**
 * BossMind Advanced Autonomous Runtime — full DETECT→ANALYZE→FIX→VERIFY→LOCK→MONITOR cycle.
 * Usage:
 *   npm run bossmind:runtime:authority
 *   npm run bossmind:runtime:authority -- --all-projects --screenshot
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  runRuntimeAuthorityCycle,
  getRuntimeAuthorityStatus,
} = require("../lib/orchestration/bossmind-runtime-authority-engine.js");

const allProjects = process.argv.includes("--all-projects");
const screenshot = !process.argv.includes("--no-screenshot");
const project =
  process.argv.find((a) => a.startsWith("--project="))?.split("=").slice(1).join("=") ||
  process.env.BOSSMIND_PROJECT_KEY ||
  "resumora";

async function main() {
  if (process.argv.includes("--status")) {
    const status = await getRuntimeAuthorityStatus(process.cwd());
    console.log(JSON.stringify(status, null, 2));
    process.exit(0);
  }

  const report = await runRuntimeAuthorityCycle({
    cwd: process.cwd(),
    projectKey: project,
    origin: process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN || process.env.BOSSMIND_REALITY_LIVE_URL,
    captureScreenshot: screenshot,
    allProjects,
    writerAgent: "bossmind_orchestrator",
  });

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
