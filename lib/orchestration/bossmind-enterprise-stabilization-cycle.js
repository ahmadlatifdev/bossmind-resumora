/**
 * Enterprise stabilization cycle — session, deploy verify, E2E, self-heal, cross-project memory.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { runRuntimeStabilityProbe } = require("./bossmind-runtime-stability-engine");
const { runDeploymentVerification } = require("./bossmind-deployment-verification");
const { runAutonomousValidationEngine } = require("./bossmind-autonomous-validation-engine");
const { runSelfHealingOrchestrator } = require("./bossmind-self-healing-orchestrator");
const { buildCrossProjectMemory } = require("./bossmind-cross-project-memory");
const { runPredictivePreventionEngine } = require("./bossmind-predictive-prevention-engine");

function loadConfig(cwd) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(cwd, "config/bossmind-enterprise-cycle.json"), "utf8")
    );
  } catch {
    return { primaryOrigin: "https://www.resumora.net", validation: { minValidationPercent: 70 } };
  }
}

function runNpmScript(cwd, script) {
  const r = spawnSync("npm", ["run", script], {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return { ok: r.status === 0, status: r.status, tail: (r.stdout + r.stderr).slice(-3000) };
}

function runNodeScript(cwd, rel, args = []) {
  const r = spawnSync("node", [rel, ...args], {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return { ok: r.status === 0, status: r.status, tail: (r.stdout + r.stderr).slice(-3000) };
}

async function runProductionJourneyE2E(cwd, origin) {
  return runNodeScript(cwd, "scripts/bossmind-production-journey-e2e.mjs", [
    `--origin=${origin}`,
  ]);
}

async function runEnterpriseStabilizationCycle({
  cwd = process.cwd(),
  neonApi = null,
  skipBuild = false,
  skipRepair = false,
  allowGitPush = false,
} = {}) {
  const cfg = loadConfig(cwd);
  const origin = process.env.BOSSMIND_REALITY_LIVE_URL || cfg.primaryOrigin;
  const projectKey = cfg.projectKey || "resumora";
  const report = {
    schema: "bossmind-enterprise-stabilization-cycle-v1",
    startedAt: new Date().toISOString(),
    origin,
    phases: [],
  };

  report.phases.push({
    phase: "predictive_prevention",
    ...(await runPredictivePreventionEngine({ cwd })),
  });

  if (!skipBuild) {
    const build = spawnSync("npm", ["run", "build"], {
      cwd,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    report.phases.push({
      phase: "build",
      ok: build.status === 0,
      status: build.status,
    });
    if (build.status !== 0) {
      report.ok = false;
      report.blockDeploy = true;
      return finalize(report, cwd, cfg, neonApi, projectKey);
    }
  }

  const stability = await runRuntimeStabilityProbe({ cwd, origin, cfg });
  report.phases.push({ phase: "runtime_stability", ...stability });

  const deployVerify = await runDeploymentVerification({
    cwd,
    origin,
    paths: ["/", "/pricing", "/login", "/studio"],
  });
  report.phases.push({ phase: "deployment_verification", ...deployVerify });

  const validation = await runAutonomousValidationEngine({ cwd, origin });
  report.phases.push({ phase: "autonomous_validation", ...validation });

  const journey = await runProductionJourneyE2E(cwd, origin);
  report.phases.push({ phase: "production_journey_e2e", ...journey });

  if (skipBuild) process.env.BOSSMIND_CLIENT_REPAIR_SKIP_BUILD = "1";
  const clientRepair = runNodeScript(cwd, "scripts/bossmind-client-journey-autonomous-repair.mjs", [
    "--skip-push",
    ...(skipBuild ? ["--skip-build"] : []),
  ]);
  report.phases.push({ phase: "client_journey_repair", ...clientRepair });

  if (neonApi?.enabled) {
    try {
      report.crossProjectMemory = await buildCrossProjectMemory({ cwd, neonApi });
    } catch (e) {
      report.crossProjectMemory = { error: e.message };
    }
  }

  const minPct = cfg.validation?.minValidationPercent ?? 72;
  const criticalOk =
    !stability.blockDeploy &&
    !stability.loopDetected &&
    validation.percent >= minPct &&
    journey.ok;

  report.criticalJourneyOk = criticalOk;
  report.blockDeploy = stability.blockDeploy || validation.blockDeploy;

  if (!criticalOk && !skipRepair && cfg.selfHealing?.autoRepairOnFailure) {
    const repair = await runSelfHealingOrchestrator({
      cwd,
      stages: cfg.selfHealing?.safeStages || ["live_verification", "memory_save"],
      allowGitPush,
      neonApi,
      projectKey,
    });
    report.phases.push({ phase: "self_healing", ...repair });
  }

  return finalize(report, cwd, cfg, neonApi, projectKey);
}

async function finalize(report, cwd, cfg, neonApi, projectKey) {
  report.completedAt = new Date().toISOString();
  report.ok =
    report.phases.find((p) => p.phase === "build")?.ok !== false &&
    report.criticalJourneyOk !== false &&
    !report.blockDeploy;

  const dirs = [
    path.join(cwd, ".bossmind/enterprise-stabilization"),
    path.join(cwd, "..", "13-shared-memory"),
    path.join(cwd, "..", "bossmind-shared/logs"),
  ];
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");
  for (const d of dirs) {
    try {
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(
        path.join(d, `enterprise-stabilization-${stamp}.json`),
        JSON.stringify(report, null, 2),
        "utf8"
      );
    } catch {
      /* ignore */
    }
  }
  fs.mkdirSync(path.join(cwd, ".bossmind/enterprise-stabilization"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".bossmind/enterprise-stabilization/latest.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );

  if (neonApi?.saveEvent) {
    try {
      await neonApi.saveEvent({
        projectKey,
        eventType: "bossmind.enterprise_stabilization.completed",
        severity: report.ok ? "info" : "warn",
        source: "enterprise-cycle",
        eventKey: `enterprise:${stamp}`,
        payload: {
          ok: report.ok,
          criticalJourneyOk: report.criticalJourneyOk,
          blockDeploy: report.blockDeploy,
          origin: report.origin,
        },
      });
    } catch {
      /* ignore */
    }
  }

  return report;
}

module.exports = { runEnterpriseStabilizationCycle, loadConfig };
