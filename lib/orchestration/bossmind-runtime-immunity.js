/**
 * Runtime immunity — redirect loops, SW cache, session cleanup, bundle fingerprint.
 */
const fs = require("fs");
const path = require("path");
const { runRuntimeStabilityProbe } = require("./bossmind-runtime-stability-engine");
const { runProductionGovernanceCheck, computeRuntimeFingerprint } = require("./bossmind-production-governance");

async function runRuntimeImmunityAudit({
  cwd = process.cwd(),
  origin = process.env.BOSSMIND_REALITY_LIVE_URL || "https://www.resumora.net",
} = {}) {
  const integrity = JSON.parse(
    fs.readFileSync(path.join(cwd, "config/bossmind-governance/orchestration-integrity.json"), "utf8")
  );
  const immunity = integrity.runtimeImmunity || {};
  const stability = await runRuntimeStabilityProbe({ cwd, origin, cfg: { validation: {}, serviceWorker: immunity } });
  const fingerprint = computeRuntimeFingerprint(cwd);
  const governance = await runProductionGovernanceCheck({ cwd, origin, skipLive: false });

  const checks = [
    ...stability.checks,
    { id: "redirect_loop_breaker", pass: !stability.loopDetected },
    { id: "sw_version_match", pass: fingerprint.swVersion === immunity.serviceWorkerVersion },
    { id: "no_deployment_drift", pass: !governance.driftDetected },
    { id: "governance_block_clear", pass: !governance.blockDeploy },
  ];

  const earned = checks.filter((c) => c.pass).length;
  return {
    percent: Math.round((earned / checks.length) * 1000) / 10,
    checks,
    stability,
    fingerprint,
    governance,
    immune: !stability.loopDetected && !governance.blockDeploy && checks.every((c) => c.pass),
    loopDetected: stability.loopDetected,
    blockDeploy: governance.blockDeploy,
  };
}

module.exports = { runRuntimeImmunityAudit };
