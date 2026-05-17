#!/usr/bin/env node
/**
 * BossMind Production-Grade Autonomous Optimization — full 11-domain run.
 *   npm run bossmind:production:autonomous
 *   npm run bossmind:production:autonomous -- --skip-live
 *   npm run bossmind:production:autonomous -- --closed-loop
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { runBossMindCoreOptimization, loadConfig } = require(path.join(
  root,
  "lib/orchestration/bossmind-core-optimization-lib.js"
));
const { runSelfHealingOrchestrator } = require(path.join(
  root,
  "lib/orchestration/bossmind-self-healing-orchestrator.js"
));
const { runContinuousMonitorCycle } = require(path.join(
  root,
  "lib/orchestration/bossmind-continuous-monitor.js"
));

const skipLive = process.argv.includes("--skip-live");
const closedLoop = process.argv.includes("--closed-loop");
const monitorOnly = process.argv.includes("--monitor-only");
const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
const origin = process.env.BOSSMIND_REALITY_LIVE_URL || "https://resumora.net";

async function main() {
  const neon = require(path.join(root, "lib/shared/neon-memory.js"));

  if (monitorOnly) {
    const cycle = await runContinuousMonitorCycle({
      cwd: root,
      neonApi: neon?.enabled ? neon : null,
      projectKey,
      origin,
      fullOptimization: true,
    });
    console.log(JSON.stringify({ monitorCycle: cycle }, null, 2));
    process.exit(cycle.validationPercent >= 70 ? 0 : 2);
  }

  const report = await runBossMindCoreOptimization({
    cwd: root,
    neonApi: neon,
    projectKey,
    skipLiveProbe: skipLive,
    skipBuild: process.env.BOSSMIND_CORE_SKIP_BUILD === "1",
    writeReport: true,
  });

  if (closedLoop) {
    const config = loadConfig(root);
    report.selfHealingOrchestration = await runSelfHealingOrchestrator({
      cwd: root,
      stages: config.selfHealingChainStages || [],
      allowGitPush: process.env.BOSSMIND_CHAIN_ALLOW_GIT_PUSH === "1",
      dryRun: process.env.BOSSMIND_CHAIN_DRY_RUN === "1",
      neonApi: neon?.enabled ? neon : null,
      projectKey,
    });
  }

  if (!skipLive) {
    report.monitorCycle = await runContinuousMonitorCycle({
      cwd: root,
      neonApi: neon?.enabled ? neon : null,
      projectKey,
      origin,
      fullOptimization: false,
    });
  }

  const outPath = path.join(root, ".bossmind", "production-autonomous", "latest.json");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
  const target = report.targetAutonomousReliabilityPercent || 98;
  process.exit(report.overallAutonomousReliabilityPercent >= target && !report.blockDeploy ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
