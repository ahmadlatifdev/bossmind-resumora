#!/usr/bin/env node
/**
 * BossMind Core Optimization — unified 10-domain proof-based scoring.
 *   npm run bossmind:core:optimization
 *   npm run bossmind:core:optimization -- --skip-live
 *   npm run bossmind:core:optimization:closed-loop  (includes safe self-heal steps)
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { runBossMindCoreOptimization } = require(path.join(
  root,
  "lib/orchestration/bossmind-core-optimization-lib.js"
));
const { executeSelfHealingChain, assessSelfHealingChain } = require(path.join(
  root,
  "lib/orchestration/bossmind-self-healing-chain.js"
));
const { loadConfig } = require(path.join(root, "lib/orchestration/bossmind-core-optimization-lib.js"));

const skipLive = process.argv.includes("--skip-live");
const closedLoop = process.argv.includes("--closed-loop");
const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";

async function main() {
  const neon = require(path.join(root, "lib/shared/neon-memory.js"));
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
    const chain = await executeSelfHealingChain({
      cwd: root,
      stages: ["live_verification", "memory_save", "snapshot_lock"],
      allowGitPush: process.env.BOSSMIND_CHAIN_ALLOW_GIT_PUSH === "1",
      dryRun: process.env.BOSSMIND_CHAIN_DRY_RUN === "1",
    });
    report.selfHealingChainRun = chain;
  } else {
    report.selfHealingChainStatus = assessSelfHealingChain({
      cwd: root,
      stages: loadConfig(root).selfHealingChainStages || [],
    });
  }

  console.log(JSON.stringify(report, null, 2));
  const target = report.targetAutonomousReliabilityPercent || 98;
  process.exit(report.overallAutonomousReliabilityPercent >= target ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
