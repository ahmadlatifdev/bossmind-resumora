/**
 * 24/7 continuous monitoring layer — validation, drift, SEO, integrity cadence.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { runAutonomousValidationEngine } = require("./bossmind-autonomous-validation-engine");
const { assessMemoryIntegrity } = require("./bossmind-memory-integrity");
const { assessPlatformSync } = require("./bossmind-platform-sync");

const MON_DIR = ".bossmind/continuous-monitor";

function loadMonitorConfig(cwd) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(cwd, "config/bossmind-production-autonomous.json"), "utf8"));
    return j.continuousMonitor || {};
  } catch {
    return {};
  }
}

function readState(cwd) {
  const p = path.join(cwd, MON_DIR, "state.json");
  try {
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : { cycle: 0 };
  } catch {
    return { cycle: 0 };
  }
}

function writeState(cwd, state) {
  fs.mkdirSync(path.join(cwd, MON_DIR), { recursive: true });
  fs.writeFileSync(path.join(cwd, MON_DIR, "state.json"), JSON.stringify(state, null, 2), "utf8");
}

async function assessContinuousMonitoring({ cwd = process.cwd(), neonApi, projectKey = "resumora", origin } = {}) {
  const state = readState(cwd);
  const lastRunPath = path.join(cwd, MON_DIR, "last-cycle.json");
  const lastRun = fs.existsSync(lastRunPath) ? JSON.parse(fs.readFileSync(lastRunPath, "utf8")) : null;
  const validation = fs.existsSync(path.join(cwd, ".bossmind/validation/latest-post-deploy.json"))
    ? JSON.parse(fs.readFileSync(path.join(cwd, ".bossmind/validation/latest-post-deploy.json"), "utf8"))
    : null;

  const checks = [
    { id: "monitor_state_present", pass: Boolean(state.cycle >= 0) },
    { id: "recent_cycle_24h", pass: lastRun && Date.now() - new Date(lastRun.completedAt).getTime() < 86400000 },
    { id: "validation_artifact", pass: Boolean(validation) },
    { id: "validation_above_70", pass: Number(validation?.percent ?? 0) >= 70 },
    { id: "autonomous_runtime_active", pass: fs.existsSync(path.join(cwd, ".bossmind/autonomous-runtime/status.json")) },
    { id: "runtime_sync_status", pass: fs.existsSync(path.join(cwd, ".bossmind/runtime-sync/status.json")) },
  ];
  const earned = checks.filter((c) => c.pass).length;
  return {
    percent: Math.round((earned / checks.length) * 1000) / 10,
    checks,
    cycle: state.cycle,
    lastRun,
    validationPercent: validation?.percent ?? null,
  };
}

async function runContinuousMonitorCycle({
  cwd = process.cwd(),
  neonApi = null,
  projectKey = "resumora",
  origin = process.env.BOSSMIND_REALITY_LIVE_URL || "https://resumora.net",
  fullOptimization = false,
} = {}) {
  const cfg = loadMonitorConfig(cwd);
  const state = readState(cwd);
  state.cycle = (state.cycle || 0) + 1;

  const memoryIntegrity = await assessMemoryIntegrity({ cwd, neonApi, projectKey });
  const platformSync = await assessPlatformSync({ cwd, neonApi, projectKey, origin });
  let validation = null;
  try {
    validation = await runAutonomousValidationEngine({ cwd, origin });
  } catch (e) {
    validation = { percent: 0, error: e.message };
  }

  let optimization = { skipped: true };
  if (fullOptimization) {
    const res = spawnSync(process.execPath, [path.join(cwd, "scripts/bossmind-core-optimization.mjs"), "--skip-live"], {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
    });
    optimization = { skipped: false, ok: (res.status ?? 1) === 0 || (res.status ?? 1) === 2 };
  }

  const syncRes = spawnSync(process.execPath, [path.join(cwd, "scripts/bossmind-runtime-sync.mjs"), "--once"], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });

  const cycleReport = {
    completedAt: new Date().toISOString(),
    cycle: state.cycle,
    memoryIntegrityPercent: memoryIntegrity.percent,
    platformSyncPercent: platformSync.percent,
    validationPercent: validation?.percent ?? 0,
    syncOk: (syncRes.status ?? 1) === 0,
    staleOverwriteRisk: memoryIntegrity.staleOverwriteRisk,
    optimization,
  };

  writeState(cwd, state);
  fs.mkdirSync(path.join(cwd, MON_DIR), { recursive: true });
  fs.writeFileSync(path.join(cwd, MON_DIR, "last-cycle.json"), JSON.stringify(cycleReport, null, 2), "utf8");

  if (neonApi?.enabled && neonApi.upsertTaskState) {
    try {
      await neonApi.upsertTaskState({
        projectKey,
        taskKey: "continuous_monitor:latest",
        status: cycleReport.validationPercent >= 70 ? "completed" : "degraded",
        payload: cycleReport,
      });
    } catch {
      /* ignore */
    }
  }

  return cycleReport;
}

module.exports = { assessContinuousMonitoring, runContinuousMonitorCycle };
