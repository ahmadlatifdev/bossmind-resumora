/**
 * Production Truth Validator — unified resolver for git, baseline, live, and Neon authority.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const hub = require("../shared/bossmind-hub-memory");
const neon = require("../shared/neon-memory");
const { verifyImmutableBaseline } = require("./bossmind-immutable-baseline");
const { runDeploymentVerification } = require("./bossmind-deployment-verification");

function gitHead(cwd) {
  try {
    return execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function resolveProductionState({
  cwd = process.cwd(),
  projectKey = "resumora",
  origin = null,
} = {}) {
  const originFinal = origin || process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN || "https://resumora.net";
  await neon.ensureSharedMemoryInitialized();
  await hub.ensureBossmindHubMemoryInitialized();

  const checksum = verifyImmutableBaseline(cwd);
  const deploy = await runDeploymentVerification({
    cwd,
    origin: originFinal,
    paths: ["/", "/pricing"],
  });
  const designSnap = await hub.getLatestDesignSnapshot({ projectKey });
  const deployHistory = await hub.listDeployVerifications({ projectKey, limit: 5 });
  const visualHistory = await hub.listVisualValidations({ projectKey, limit: 5 });
  let neonAuthority = null;
  try {
    neonAuthority = await neon.getRuntimeAuthority({
      projectKey,
      authorityKey: "luxury_ui_baseline",
    });
  } catch {
    neonAuthority = null;
  }

  const localLock = path.join(cwd, ".bossmind", "immutable-lock", "latest-execution.json");
  let localExecution = null;
  if (fs.existsSync(localLock)) {
    try {
      localExecution = JSON.parse(fs.readFileSync(localLock, "utf8"));
    } catch {
      localExecution = null;
    }
  }

  const truths = [
    { id: "git_head", pass: Boolean(gitHead(cwd)), value: gitHead(cwd) },
    { id: "baseline_checksum", pass: Boolean(checksum.ok), value: checksum.luxury?.hash },
    { id: "live_deploy_percent", pass: deploy.percent >= 90, value: deploy.percent },
    { id: "design_snapshot", pass: Boolean(designSnap?.baseline_hash), value: designSnap?.baseline_hash },
    { id: "neon_runtime_authority", pass: Boolean(neonAuthority?.baseline_hash), value: neonAuthority?.baseline_hash },
    { id: "local_execution_ok", pass: Boolean(localExecution?.ok), value: localExecution?.generatedAt },
  ];
  const earned = truths.filter((t) => t.pass).length;
  const percent = Math.round((earned / truths.length) * 1000) / 10;

  return {
    ok: percent >= 80,
    percent,
    projectKey,
    origin: originFinal,
    truths,
    deploy,
    designSnapshot: designSnap,
    deployVerifications: deployHistory,
    visualValidations: visualHistory,
    neonAuthority,
    blockDeploy: percent < 70 || deploy.blockDeploy,
  };
}

module.exports = { resolveProductionState };
