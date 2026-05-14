/**
 * Railway closed-loop repair status for Master Admin / bossmind-health.
 */

const {
  listRecentDeploymentRepairLogs,
  listRecentTaskStates,
} = require("../shared/neon-memory");

/**
 * @param {{ projectKey: string, neonEnabled: boolean }} opts
 */
async function getRailwayRepairOverview({ projectKey, neonEnabled }) {
  if (!neonEnabled) {
    return {
      emergencyStop: process.env.BOSSMIND_RAILWAY_REPAIR_EMERGENCY_STOP === "1",
      phases: [],
      pendingRailwayTasks: 0,
      latestFingerprint: null,
      note: "Neon disabled — no deployment_repair_log reads.",
    };
  }

  const phases = await listRecentDeploymentRepairLogs({ projectKey, limit: 20 });
  const tasks = await listRecentTaskStates({ projectKey, limit: 40 });
  const pendingRailwayTasks = tasks.filter(
    (t) =>
      String(t.task_key || "").startsWith("railway_repair:") &&
      (t.status === "pending" || t.status === "queued" || t.status === "in_progress")
  ).length;

  const latestFp =
    phases.length && phases[0].error_fingerprint ? phases[0].error_fingerprint : null;

  const phaseOrder = [
    "crash_received",
    "logs_fetched",
    "classified",
    "patch_generated",
    "validated",
    "github_push",
    "redeploy_triggered",
    "health_verified",
  ];

  return {
    emergencyStop: process.env.BOSSMIND_RAILWAY_REPAIR_EMERGENCY_STOP === "1",
    autoRedeploy: process.env.BOSSMIND_RAILWAY_AUTO_REDEPLOY === "1",
    autoPush: process.env.BOSSMIND_RAILWAY_AUTO_PUSH === "1",
    runBuildGuard: process.env.BOSSMIND_RAILWAY_RUN_BUILD_GUARD === "1",
    pendingRailwayTasks,
    latestFingerprint: latestFp,
    recentPhases: phases.slice(0, 12),
    widgetSteps: phaseOrder.map((name) => ({
      name,
      state: inferStepState(phases, name),
    })),
  };
}

function inferStepState(rawRows, step) {
  const hit = rawRows.find((r) => r.phase === step);
  if (!hit) return "idle";
  const st = hit.status;
  if (st === "ok" || st === "stub" || st === "partial") return "done";
  if (st === "fail") return "failed";
  if (st === "skipped" || st === "not_implemented_use_ci") return "skipped";
  return "unknown";
}

module.exports = { getRailwayRepairOverview };
