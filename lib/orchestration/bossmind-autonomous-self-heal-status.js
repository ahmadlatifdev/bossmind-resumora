/**
 * Read-only status for BossMind autonomous / closed-loop self-heal (no side effects).
 */
const fs = require("fs");
const path = require("path");

function fileExists(relFromRepoRoot) {
  const p = path.join(__dirname, "..", "..", ...relFromRepoRoot.split("/"));
  return fs.existsSync(p);
}

function score(items) {
  const w = items.reduce((a, x) => a + (x.weight || 0), 0);
  const e = items.filter((x) => x.ok).reduce((a, x) => a + (x.weight || 0), 0);
  return w > 0 ? Math.round((e / w) * 100) : 0;
}

function getAutonomousSelfHealStatus() {
  const neon = Boolean(process.env.NEON_DATABASE_URL);
  const orch = Boolean(process.env.BOSSMIND_ORCHESTRATION_SECRET);
  const sentryDsn = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN);
  const enqueue = process.env.BOSSMIND_SENTRY_ENQUEUE_ONLY === "1";
  const railwayToken = Boolean(process.env.RAILWAY_TOKEN || process.env.RAILWAY_API_TOKEN);
  const railwayProject = Boolean(process.env.BOSSMIND_RAILWAY_PROJECT_ID);
  const railwayRedeploy = process.env.BOSSMIND_RAILWAY_AUTO_REDEPLOY === "1";
  const railwayEnvSvc =
    Boolean(process.env.BOSSMIND_RAILWAY_ENVIRONMENT_ID) && Boolean(process.env.BOSSMIND_RAILWAY_SERVICE_ID);
  const buildGuard = process.env.BOSSMIND_RAILWAY_RUN_BUILD_GUARD === "1";
  const healthProbe = Boolean(
    process.env.BOSSMIND_RAILWAY_HEALTH_ORIGIN || process.env.BOSSMIND_COMPLETION_PROBE_ORIGIN
  );
  const autoPushFlag = process.env.BOSSMIND_RAILWAY_AUTO_PUSH === "1";

  const items = [
    { id: "neon_shared_memory", ok: neon, weight: 15 },
    { id: "orchestration_secret", ok: orch, weight: 15 },
    { id: "sentry_dsn", ok: sentryDsn, weight: 10 },
    { id: "sentry_enqueue_only_mode", ok: enqueue, weight: 5 },
    { id: "langgraph_repair_module", ok: fileExists("lib/orchestration/langgraph-repair-flow.js"), weight: 10 },
    { id: "sentry_ingress_route", ok: fileExists("pages/api/orchestration/sentry-ingest.js"), weight: 5 },
    { id: "supervisor_worker_script", ok: fileExists("scripts/bossmind-supervisor-worker.mjs"), weight: 5 },
    { id: "railway_closed_loop_worker", ok: fileExists("lib/orchestration/railway-closed-loop-worker.js"), weight: 5 },
    { id: "railway_token", ok: railwayToken, weight: 5 },
    { id: "railway_project_id", ok: railwayProject, weight: 5 },
    { id: "railway_auto_redeploy_enabled", ok: railwayRedeploy, weight: 5 },
    { id: "railway_env_and_service_ids", ok: railwayEnvSvc, weight: 5 },
    { id: "railway_build_guard", ok: buildGuard, weight: 5 },
    { id: "post_deploy_health_probe", ok: healthProbe, weight: 5 },
  ];

  const closedLoopDetectionToNeonPercent = score(items);

  return {
    generatedAt: new Date().toISOString(),
    mandatoryFlowDeclaredInactive: {
      autoWriteCodeFixToFilesystem: false,
      reason:
        "BossMind safe review: patches require human/PR path (see scripts/bossmind-self-heal.mjs header, docs/BOSSMIND_SAFE_REVIEW_WORKFLOW.md).",
      autoGitCommitAndPush: false,
      gitPushNote:
        "railway-closed-loop-worker logs github_push as not_implemented even if BOSSMIND_RAILWAY_AUTO_PUSH=1 — use GitHub Actions + branch protection.",
      autoDeployRender: false,
      renderNote: "Render deploy triggers are external to this worker; use Render dashboard or GH integration.",
      autoDeployRailwayRedeploy: railwayRedeploy && railwayToken && railwayEnvSvc,
    },
    envHints: {
      BOSSMIND_SENTRY_ENQUEUE_ONLY: enqueue ? "1" : "unset",
      BOSSMIND_RAILWAY_RUN_BUILD_GUARD: buildGuard ? "1" : "unset",
      BOSSMIND_RAILWAY_AUTO_REDEPLOY: railwayRedeploy ? "1" : "unset",
      BOSSMIND_RAILWAY_AUTO_PUSH: autoPushFlag ? "1 (still not implemented in worker)" : "unset",
    },
    scores: {
      closedLoopInfrastructureReadinessPercent: closedLoopDetectionToNeonPercent,
      fullAutonomousChainPercent: 0,
      fullAutonomousChainNote:
        "Auto-write + auto-push + auto-merge main + unsupervised deploy chain is not activated by policy.",
    },
    components: {
      sentryRuntime: sentryDsn,
      sentryRepairIngress: orch,
      neonMemory: neon,
      langgraphRepairPlanner: fileExists("lib/orchestration/langgraph-repair-flow.js"),
      railwayWorkerRedeployCapable: railwayToken && railwayRedeploy && railwayEnvSvc && railwayProject,
      postDeployHealthProbeConfigured: healthProbe,
    },
  };
}

module.exports = { getAutonomousSelfHealStatus };
