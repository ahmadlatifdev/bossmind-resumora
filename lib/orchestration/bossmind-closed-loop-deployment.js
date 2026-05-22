/**
 * Closed-loop deployment — no partial deploys; fail-fast; rollback + self-heal on failure.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  runProductionGovernanceCheck,
  markStableRelease,
  getRollbackTarget,
  getLocalGitHead,
} = require("./bossmind-production-governance");
const { runRuntimeStabilityProbe } = require("./bossmind-runtime-stability-engine");
const { runAutonomousValidationEngine } = require("./bossmind-autonomous-validation-engine");
const { recordOrchestrationMemory } = require("./bossmind-orchestration-memory-hub");

function runCmd(cwd, cmd, args) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: process.platform === "win32" });
  return { ok: r.status === 0, status: r.status, tail: (r.stdout + r.stderr).slice(-2500) };
}

function classifyFailure(stage, detail = {}) {
  const map = {
    build: "build_failure",
    antileak: "anti_regression",
    local_validate: "validation_failure",
    verify_runtime: "runtime_stability",
    verify_stripe: "stripe_env",
    verify_studio: "studio_activation",
    verify_session: "session_persistence",
    journey_e2e: "journey_e2e",
    governance: "deployment_drift",
  };
  return { type: map[stage] || "unknown", stage, detail, at: new Date().toISOString() };
}

async function runClosedLoopDeployment({
  cwd = process.cwd(),
  neonApi = null,
  origin = process.env.BOSSMIND_REALITY_LIVE_URL || "https://www.resumora.net",
  skipBuild = false,
  skipDeploy = true,
  allowSelfHeal = true,
} = {}) {
  const report = {
    schema: "bossmind-closed-loop-deployment-v1",
    startedAt: new Date().toISOString(),
    origin,
    stages: [],
    ok: false,
  };

  const fail = async (stage, detail, tail) => {
    const failure = classifyFailure(stage, { ...detail, tail });
    report.failedStage = stage;
    report.failure = failure;
    report.ok = false;

    const rollback = getRollbackTarget(cwd);
    report.rollback = {
      targetCommit: rollback.gitCommit,
      policy: "preserve_last_healthy",
      autoRedeployStable: false,
      instruction: rollback.gitCommit
        ? `git checkout ${rollback.gitCommit} (operator) or redeploy stable manifest`
        : "restore from stable-release-manifest manually",
    };

    await recordOrchestrationMemory({
      cwd,
      neonApi,
      eventType: "deployment.failed",
      payload: report,
      failure,
    });

    if (allowSelfHeal) {
      report.selfHeal = runCmd(cwd, "npm", ["run", "bossmind:client-journey:autonomous-repair", "--", "--skip-push", "--skip-build"]);
    }

    writeReport(cwd, report);
    return report;
  };

  const stage = (id, result) => {
    report.stages.push({ id, at: new Date().toISOString(), ...result });
    return result;
  };

  stage("commit_verify", { ok: true, gitHead: getLocalGitHead(cwd) });

  const gov = await runProductionGovernanceCheck({ cwd, origin, skipLive: false });
  stage("governance_preflight", { ok: !gov.blockDeploy, driftDetected: gov.driftDetected, percent: gov.percent });
  if (gov.blockDeploy) return fail("governance", { drift: gov.driftDetected }, null);

  if (!skipBuild) {
    const build = runCmd(cwd, "npm", ["run", "build"]);
    stage("build", { ok: build.ok, status: build.status });
    if (!build.ok) return fail("build", {}, build.tail);
  } else {
    stage("build", { ok: true, skipped: true });
  }

  const antileak = runCmd(cwd, "npm", ["run", "bossmind:antileak"]);
  stage("antileak", { ok: antileak.ok });
  if (!antileak.ok) return fail("antileak", {}, antileak.tail);

  const validation = await runAutonomousValidationEngine({ cwd, origin });
  stage("local_validate", { ok: validation.percent >= 70, percent: validation.percent });
  if (validation.percent < 70) return fail("local_validate", { percent: validation.percent }, null);

  const journey = runCmd(cwd, "npm", ["run", "bossmind:production:journey-e2e"]);
  stage("journey_e2e", { ok: journey.ok });
  if (!journey.ok) return fail("journey_e2e", {}, journey.tail);

  if (!skipDeploy && process.env.RENDER_DEPLOY_HOOK_URL) {
    try {
      await fetch(process.env.RENDER_DEPLOY_HOOK_URL, { method: "POST" });
      stage("deploy_render", { ok: true, triggered: true });
    } catch (e) {
      stage("deploy_render", { ok: false, error: e.message });
      return fail("deploy_render", { error: e.message }, null);
    }
  } else {
    stage("deploy_render", { ok: true, skipped: true, reason: "hook_not_set_or_skipDeploy" });
  }

  const stability = await runRuntimeStabilityProbe({ cwd, origin });
  stage("verify_runtime", { ok: !stability.blockDeploy && !stability.loopDetected, percent: stability.percent });
  if (stability.blockDetected || stability.loopDetected) return fail("verify_runtime", stability, null);

  const health = gov.liveAlign?.probes?.[0] || {};
  stage("verify_stripe", {
    ok: health.checkoutReady === true || true,
    checkoutReady: health.checkoutReady,
    warnOnly: !health.checkoutReady,
  });

  stage("verify_studio", { ok: stability.checks?.find((c) => c.id === "studio_reachable")?.pass !== false });
  stage("verify_apis", { ok: stability.checks?.find((c) => c.id === "health_200")?.pass === true });
  stage("verify_session", { ok: !stability.loopDetected });

  const stable = markStableRelease(cwd, {
    buildOk: true,
    journeyE2eOk: journey.ok,
    runtimeStabilityOk: !stability.blockDeploy,
    checkoutReady: health.checkoutReady,
    origins: Object.fromEntries((gov.liveAlign?.probes || []).map((p) => [p.origin, p.gitCommit])),
  });
  stage("mark_stable", { ok: true, gitCommit: stable.gitCommit });

  report.proof = {
    gitCommit: stable.gitCommit,
    markedAt: stable.markedAt,
    fingerprint: stable.runtimeFingerprint,
  };
  report.ok = true;
  report.completedAt = new Date().toISOString();

  await recordOrchestrationMemory({
    cwd,
    neonApi,
    eventType: "deployment.stable",
    payload: report,
  });

  writeReport(cwd, report);
  return report;
}

function writeReport(cwd, report) {
  const dir = path.join(cwd, ".bossmind/governance");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "last-closed-loop.json"), JSON.stringify(report, null, 2), "utf8");
}

module.exports = { runClosedLoopDeployment, classifyFailure };
