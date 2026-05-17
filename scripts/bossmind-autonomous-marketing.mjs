#!/usr/bin/env node
/**
 * Run verified autonomous marketing cycle (Resumora).
 *   npm run bossmind:marketing:autonomous
 *   npm run bossmind:marketing:autonomous -- --dry-run
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  runAutonomousMarketingCycle,
  getAutonomousMarketingStatus,
} = require("../lib/orchestration/bossmind-autonomous-marketing-engine.js");

const dryRun = process.argv.includes("--dry-run");
const statusOnly = process.argv.includes("--status");

async function main() {
  if (statusOnly) {
    const status = await getAutonomousMarketingStatus(process.cwd());
    console.log(JSON.stringify(status, null, 2));
    process.exit(0);
  }
  const report = await runAutonomousMarketingCycle({
    origin: process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN || process.env.BOSSMIND_BRAND_PROBE_ORIGIN,
    dryRun,
    persist: !dryRun,
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
