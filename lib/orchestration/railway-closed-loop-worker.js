/**
 * BossMind Railway closed-loop repair (worker execution).
 * Git push / auto-merge are NOT performed here — use CI + branch protection; flip env only after policy sign-off.
 */

const crypto = require("crypto");
const { spawnSync } = require("child_process");
const path = require("path");
const { callRepairPlannerModel } = require("../ai/repair-model");
const {
  saveDeploymentRepairLog,
  countDeploymentRepairLogsSince,
  saveEvent,
  upsertErrorMemory,
  saveDeploymentHistory,
} = require("../shared/neon-memory");
const {
  railwayFetchRecentDeployments,
  railwayServiceInstanceRedeploy,
} = require("./railway-graphql");

function fingerprintFromPayload(payload) {
  const raw = `${payload.deploymentId || ""}|${payload.crashMessage || payload.message || ""}|${payload.serviceId || ""}`;
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 40);
}

async function logPhase(neon, projectKey, taskKey, fp, phase, status, extra = {}) {
  await saveDeploymentRepairLog({
    projectKey,
    taskKey,
    phase,
    status,
    errorFingerprint: fp,
    payload: extra,
  });
}

/**
 * @param {{ neon: any, projectKey: string, taskRow: { task_key: string, payload: Record<string, unknown> } }} ctx
 */
async function executeRailwayClosedLoop(ctx) {
  const { neon, projectKey, taskRow } = ctx;
  const taskKey = taskRow.task_key;
  const payload = taskRow.payload || {};
  const fp = payload.errorFingerprint || fingerprintFromPayload(payload);

  const emergency = process.env.BOSSMIND_RAILWAY_REPAIR_EMERGENCY_STOP === "1";
  if (emergency) {
    await logPhase(neon, projectKey, taskKey, fp, "aborted", "emergency_stop", {});
    await saveEvent({
      projectKey,
      eventType: "railway.repair.emergency_stop",
      severity: "warning",
      source: "railway-closed-loop-worker",
      eventKey: taskKey,
      payload: {},
    });
    return { ok: false, reason: "emergency_stop" };
  }

  const maxPerFp = Number(process.env.BOSSMIND_RAILWAY_REPAIR_MAX_PER_FINGERPRINT || "6");
  const recent = await countDeploymentRepairLogsSince({
    projectKey,
    errorFingerprint: fp,
    hours: 24,
  });
  if (recent >= maxPerFp) {
    await logPhase(neon, projectKey, taskKey, fp, "aborted", "loop_guard_fingerprint", { recent });
    await saveEvent({
      projectKey,
      eventType: "railway.repair.loop_guard",
      severity: "error",
      source: "railway-closed-loop-worker",
      eventKey: taskKey,
      payload: { fingerprint: fp, recent },
    });
    return { ok: false, reason: "loop_guard" };
  }

  await logPhase(neon, projectKey, taskKey, fp, "crash_received", "ok", {
    deploymentId: payload.deploymentId,
    serviceId: payload.serviceId,
  });

  const token = process.env.RAILWAY_TOKEN || process.env.RAILWAY_API_TOKEN || "";
  const projectId = payload.railwayProjectId || process.env.BOSSMIND_RAILWAY_PROJECT_ID || "";
  let deployments = [];
  if (token && projectId) {
    const depRes = await railwayFetchRecentDeployments({ token, projectId });
    deployments = depRes.deployments || [];
    await logPhase(neon, projectKey, taskKey, fp, "logs_fetched", depRes.ok ? "ok" : "partial", {
      deploymentCount: deployments.length,
      status: depRes.status,
    });
  } else {
    await logPhase(neon, projectKey, taskKey, fp, "logs_fetched", "skipped", {
      reason: "missing_RAILWAY_TOKEN_or_BOSSMIND_RAILWAY_PROJECT_ID",
    });
  }

  const plannerPrompt = [
    "Railway deployment failure triage for Resumora BossMind.",
    `Fingerprint: ${fp}`,
    `Incident payload: ${JSON.stringify(payload).slice(0, 8000)}`,
    `Recent deployment statuses: ${JSON.stringify(deployments.map((d) => ({ id: d.id, status: d.status }))).slice(0, 4000)}`,
    "Return: root cause hypothesis, safest next step (no destructive git), and whether human must intervene.",
  ].join("\n");

  const rootCause = await callRepairPlannerModel({ prompt: plannerPrompt }).catch((e) => `planner_error:${e.message}`);
  await logPhase(neon, projectKey, taskKey, fp, "classified", "ok", { rootCauseLen: rootCause.length });

  const codexStub =
    process.env.BOSSMIND_CODEX_LAYER_ENABLED === "1"
      ? "codex_patch_pending_external_runner"
      : "codex_layer_disabled_no_patch_generated";
  await logPhase(neon, projectKey, taskKey, fp, "patch_generated", "stub", { codexStub });

  let validationOk = false;
  let validationDetails = "skipped";
  if (process.env.BOSSMIND_RAILWAY_RUN_BUILD_GUARD === "1") {
    const root = process.cwd();
    const antileak = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "bossmind:antileak"], {
      cwd: root,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    const build = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
      cwd: root,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: { ...process.env, CI: "1" },
    });
    validationOk = antileak.status === 0 && build.status === 0;
    validationDetails = `antileak:${antileak.status} build:${build.status}`;
    await logPhase(neon, projectKey, taskKey, fp, "validated", validationOk ? "ok" : "fail", {
      validationDetails,
      antileakTail: (antileak.stderr || antileak.stdout || "").slice(-1200),
      buildTail: (build.stderr || build.stdout || "").slice(-1200),
    });
  } else {
    await logPhase(neon, projectKey, taskKey, fp, "validated", "skipped", {
      reason: "BOSSMIND_RAILWAY_RUN_BUILD_GUARD not 1",
    });
    validationOk = true;
  }

  if (!validationOk) {
    await saveEvent({
      projectKey,
      eventType: "railway.repair.validation_failed",
      severity: "error",
      source: "railway-closed-loop-worker",
      eventKey: taskKey,
      payload: { validationDetails },
    });
    return { ok: false, reason: "validation_failed", validationDetails };
  }

  const autoPush = process.env.BOSSMIND_RAILWAY_AUTO_PUSH === "1";
  await logPhase(neon, projectKey, taskKey, fp, "github_push", autoPush ? "not_implemented_use_ci" : "skipped", {
    note: "No git push from this module — enable GitHub Actions or merge-bot with branch protection.",
  });

  let redeployResult = { ok: false, skipped: true };
  if (process.env.BOSSMIND_RAILWAY_AUTO_REDEPLOY === "1" && token) {
    const envId = payload.railwayEnvironmentId || process.env.BOSSMIND_RAILWAY_ENVIRONMENT_ID || "";
    const svcId = payload.railwayServiceId || process.env.BOSSMIND_RAILWAY_SERVICE_ID || "";
    if (envId && svcId) {
      redeployResult = await railwayServiceInstanceRedeploy({
        token,
        environmentId: envId,
        serviceId: svcId,
      });
      await logPhase(neon, projectKey, taskKey, fp, "redeploy_triggered", redeployResult.ok ? "ok" : "fail", {
        status: redeployResult.status,
        errors: redeployResult.json?.errors,
      });
    } else {
      await logPhase(neon, projectKey, taskKey, fp, "redeploy_triggered", "skipped", {
        reason: "missing_environment_or_service_id",
      });
    }
  } else {
    await logPhase(neon, projectKey, taskKey, fp, "redeploy_triggered", "skipped", {
      reason: "BOSSMIND_RAILWAY_AUTO_REDEPLOY not 1 or no token",
    });
  }

  let healthOk = false;
  const probe = process.env.BOSSMIND_RAILWAY_HEALTH_ORIGIN || process.env.BOSSMIND_COMPLETION_PROBE_ORIGIN || "";
  if (probe) {
    try {
      const u = new URL("/api/health", probe.endsWith("/") ? probe : `${probe}/`);
      const res = await fetch(u.href, { method: "GET", signal: AbortSignal.timeout(12000) });
      healthOk = res.ok;
      await logPhase(neon, projectKey, taskKey, fp, "health_verified", healthOk ? "ok" : "fail", {
        url: u.href,
        status: res.status,
      });
    } catch (e) {
      await logPhase(neon, projectKey, taskKey, fp, "health_verified", "fail", {
        error: e.message || String(e),
      });
    }
  } else {
    await logPhase(neon, projectKey, taskKey, fp, "health_verified", "skipped", {
      reason: "set BOSSMIND_RAILWAY_HEALTH_ORIGIN",
    });
  }

  await upsertErrorMemory({
    projectKey,
    errorType: "railway_deployment",
    errorMessage: `railway_fp:${fp}`,
    stackExcerpt: String(payload.deploymentId || ""),
    rootCause: rootCause.slice(0, 2000),
    fixPattern: codexStub,
  });

  await saveDeploymentHistory({
    projectKey,
    commitHash: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "",
    environment: "railway",
    status: healthOk ? "verified" : "pending_verify",
    summary: "railway closed-loop repair",
    metadata: {
      taskKey,
      fingerprint: fp,
      redeployOk: redeployResult.ok,
      healthOk,
    },
  });

  await saveEvent({
    projectKey,
    eventType: "railway.repair.completed",
    severity: healthOk ? "info" : "warning",
    source: "railway-closed-loop-worker",
    eventKey: taskKey,
    payload: { fingerprint: fp, healthOk, validationOk },
  });

  return { ok: true, healthOk, fingerprint: fp };
}

module.exports = {
  executeRailwayClosedLoop,
  fingerprintFromPayload,
};
