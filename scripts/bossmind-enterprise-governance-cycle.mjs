#!/usr/bin/env node
/**
 * Enterprise governance + closed-loop deployment + runtime immunity + memory.
 *   npm run bossmind:governance:cycle
 *   npm run bossmind:governance:cycle -- --closed-loop
 *   npm run bossmind:governance:cycle -- --skip-build
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

const { runProductionGovernanceCheck, loadGovernanceBundle } = require(path.join(
  root,
  "lib/orchestration/bossmind-production-governance.js"
));
const { runClosedLoopDeployment } = require(path.join(
  root,
  "lib/orchestration/bossmind-closed-loop-deployment.js"
));
const { runRuntimeImmunityAudit } = require(path.join(root, "lib/orchestration/bossmind-runtime-immunity.js"));
const { getOrchestrationIntelligence } = require(path.join(
  root,
  "lib/orchestration/bossmind-orchestration-memory-hub.js"
));
const { runSelfHealingOrchestrator } = require(path.join(
  root,
  "lib/orchestration/bossmind-self-healing-orchestrator.js"
));

const closedLoop = process.argv.includes("--closed-loop");
const skipBuild = process.argv.includes("--skip-build");
const origin = process.env.BOSSMIND_REALITY_LIVE_URL || "https://www.resumora.net";

async function main() {
  let neon = null;
  try {
    neon = require(path.join(root, "lib/shared/neon-memory.js"));
  } catch {
    neon = null;
  }

  const report = {
    schema: "bossmind-enterprise-governance-cycle-v1",
    startedAt: new Date().toISOString(),
    origin,
    phases: [],
  };

  const gov = await runProductionGovernanceCheck({ cwd: root, origin });
  report.phases.push({ phase: "production_governance", ...gov });

  const immunity = await runRuntimeImmunityAudit({ cwd: root, origin });
  report.phases.push({ phase: "runtime_immunity", ...immunity });

  if (closedLoop) {
    const deploy = await runClosedLoopDeployment({
      cwd: root,
      neonApi: neon?.enabled ? neon : null,
      origin,
      skipBuild,
      skipDeploy: !process.env.RENDER_DEPLOY_HOOK_URL,
    });
    report.phases.push({ phase: "closed_loop_deployment", ...deploy });
    report.ok = deploy.ok && immunity.immune;
  } else {
    report.ok = !gov.blockDeploy && immunity.immune;
  }

  if (!report.ok && process.argv.includes("--self-heal")) {
    report.selfHealing = await runSelfHealingOrchestrator({
      cwd: root,
      stages: ["live_verification", "memory_save", "error_memory_learning"],
      neonApi: neon?.enabled ? neon : null,
    });
  }

  report.intelligence = getOrchestrationIntelligence(root);
  report.governanceBundle = loadGovernanceBundle(root);
  report.completedAt = new Date().toISOString();

  const outDir = path.join(root, ".bossmind/governance");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "last-enterprise-cycle.json"), JSON.stringify(report, null, 2), "utf8");

  const hubMem = path.join(root, "..", "13-shared-memory");
  try {
    fs.mkdirSync(hubMem, { recursive: true });
    const stamp = report.completedAt.slice(0, 19).replace(/[:.]/g, "-");
    fs.writeFileSync(
      path.join(hubMem, `resumora-enterprise-governance-${stamp}.json`),
      JSON.stringify(report, null, 2),
      "utf8"
    );
  } catch {
    /* ignore */
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
