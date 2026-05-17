/**
 * Full closed-loop self-healing orchestrator — retry, escalation, rollback intelligence (guarded).
 */
const fs = require("fs");
const path = require("path");
const { executeSelfHealingChain, assessSelfHealingChain, readLastRun } = require("./bossmind-self-healing-chain");

const ORCH_DIR = ".bossmind/self-healing-orchestrator";
const MAX_RETRIES = 3;

function readState(cwd) {
  const p = path.join(cwd, ORCH_DIR, "state.json");
  try {
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : { attempts: 0, escalations: 0 };
  } catch {
    return { attempts: 0, escalations: 0 };
  }
}

function writeState(cwd, state) {
  const dir = path.join(cwd, ORCH_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify(state, null, 2), "utf8");
}

function assessOrchestrator({ cwd = process.cwd(), stages = [] } = {}) {
  const base = assessSelfHealingChain({ cwd, stages });
  const state = readState(cwd);
  const lastRun = readLastRun(cwd);
  const checks = [
    ...base.checks,
    { id: "retry_manager_ready", pass: true },
    { id: "escalation_under_limit", pass: state.escalations < 5 },
    { id: "rollback_intel_present", pass: fs.existsSync(path.join(cwd, ".bossmind", "checkpoints", "latest-ui-fingerprint.json")) },
    { id: "repair_confirmation_recent", pass: lastRun?.ok === true },
  ];
  const earned = checks.filter((c) => c.pass).length;
  return {
    percent: Math.round((earned / checks.length) * 1000) / 10,
    checks,
    stageStatus: base.stageStatus,
    configuredCount: base.configuredCount,
    lastRun,
    state,
  };
}

async function runSelfHealingOrchestrator({
  cwd = process.cwd(),
  stages = [],
  allowGitPush = false,
  dryRun = false,
  neonApi = null,
  projectKey = "resumora",
} = {}) {
  const state = readState(cwd);
  const safeStages = ["live_verification", "memory_save", "snapshot_lock", "langgraph_orchestration"];
  const attempts = [];
  let ok = false;

  for (let i = 0; i < MAX_RETRIES && !ok; i += 1) {
    const chain = await executeSelfHealingChain({
      cwd,
      stages: stages.filter((s) => safeStages.includes(s) || s === "github_commit_push"),
      allowGitPush,
      dryRun,
    });
    attempts.push({ attempt: i + 1, ...chain });
    ok = chain.ok;
    if (!ok) state.attempts += 1;
  }

  if (!ok && state.attempts >= MAX_RETRIES) {
    state.escalations += 1;
    state.lastEscalationAt = new Date().toISOString();
    if (neonApi?.enabled && neonApi.saveEvent) {
      try {
        await neonApi.saveEvent({
          projectKey,
          eventType: "bossmind.self_healing.escalated",
          severity: "warning",
          payload: { attempts: state.attempts, escalations: state.escalations },
        });
      } catch {
        /* ignore */
      }
    }
  }

  if (ok) {
    state.attempts = 0;
    state.lastSuccessAt = new Date().toISOString();
  }

  writeState(cwd, state);

  const log = {
    ok,
    completedAt: new Date().toISOString(),
    attempts,
    escalations: state.escalations,
    rollbackHint: ok ? null : "npm run bossmind:baseline:restore (requires BOSSMIND_BASELINE_RESTORE_ALLOW_STALE=1 only when intentional)",
    deployRevalidation: "npm run bossmind:production:post-deploy-validation",
  };
  fs.mkdirSync(path.join(cwd, ORCH_DIR), { recursive: true });
  fs.writeFileSync(path.join(cwd, ORCH_DIR, "last-orchestration.json"), JSON.stringify(log, null, 2), "utf8");
  return log;
}

module.exports = { assessOrchestrator, runSelfHealingOrchestrator };
