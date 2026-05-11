#!/usr/bin/env node
/**
 * BossMind unified autonomous runtime controller (always-on loop).
 *
 * One process orchestrating:
 * - shared-memory heartbeat + task-state authority
 * - runtime sync authority check/heal
 * - supervisor queue processing
 * - runtime health monitoring
 * - optional deployment governance gate (schedule)
 *
 * Safety:
 * - never mutates git history
 * - only safe cache cleanup via delegated runtime-sync scripts
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const stateDir = path.join(root, ".bossmind", "autonomous-runtime");
const statusPath = path.join(stateDir, "status.json");
const historyPath = path.join(stateDir, "history.jsonl");

const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
const intervalMs = Number(process.env.BOSSMIND_AUTONOMOUS_LOOP_MS || 60000);
const deployGateEvery = Number(process.env.BOSSMIND_DEPLOY_GATE_EVERY_CYCLES || 20);
const runDeployGate = process.env.BOSSMIND_AUTONOMOUS_RUN_DEPLOY_GATE !== "0";
const runOnce = process.argv.includes("--once");
const checkpointKey = process.env.BOSSMIND_CONTINUITY_KEY || "global_continuity";

const {
  loadContinuePoint,
  saveContinuePoint,
} = require(path.join(root, "lib/orchestration/bossmind-last-confirmed-point.js"));

let stopping = false;
let cycle = 0;
let consecutiveHealthy = 0;
let consecutiveDegraded = 0;
let healedCount = 0;
let driftCount = 0;

function ensureState() {
  fs.mkdirSync(stateDir, { recursive: true });
}

function appendHistory(entry) {
  ensureState();
  fs.appendFileSync(historyPath, `${JSON.stringify(entry)}\n`, "utf8");
}

function readJsonSafe(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeStatus(entry) {
  ensureState();
  fs.writeFileSync(statusPath, JSON.stringify(entry, null, 2), "utf8");
}

function runNodeScript(scriptRel, args = [], extraEnv = {}) {
  const cmd = process.execPath;
  const res = spawnSync(cmd, [path.join(root, scriptRel), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, ...extraEnv },
  });
  const stdout = res.stdout || "";
  const stderr = res.stderr || "";
  let json = null;
  try {
    const trimmed = stdout.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) json = JSON.parse(trimmed);
  } catch {
    json = null;
  }
  return {
    ok: (res.status ?? 1) === 0,
    code: res.status ?? 1,
    stdout,
    stderr,
    json,
  };
}

function computeRates() {
  const total = cycle || 1;
  const syncRate = Math.round(((cycle - driftCount) / total) * 100);
  const healRate = driftCount > 0 ? Math.round((healedCount / driftCount) * 100) : 100;
  return { synchronizationRate: syncRate, healingRate: healRate };
}

async function logNeonHeartbeat(neon, payload) {
  try {
    await neon.upsertTaskState({
      projectKey,
      taskKey: "bossmind_autonomous_runtime",
      status: payload.degraded ? "degraded" : "healthy",
      assignedAgent: "autonomous-runtime-controller",
      payload,
    });
    await neon.saveEvent({
      projectKey,
      eventType: payload.degraded
        ? "bossmind.autonomous_runtime.cycle.degraded"
        : "bossmind.autonomous_runtime.cycle.healthy",
      severity: payload.degraded ? "warn" : "info",
      source: "bossmind-autonomous-runtime",
      eventKey: `cycle_${payload.cycle}_${Date.now()}`,
      payload,
    });
  } catch {
    /* ignore Neon write failures */
  }
}

async function runCycle(neonApi) {
  cycle += 1;
  const startedAt = new Date().toISOString();

  const continuePoint = await loadContinuePoint({
    neon: neonApi,
    projectKey,
    checkpointKey,
  });
  const continueEnv = continuePoint?.checkpoint?.commit_hash
    ? { BOSSMIND_CONTINUE_FROM_COMMIT: String(continuePoint.checkpoint.commit_hash) }
    : {};

  const sync = runNodeScript("scripts/bossmind-runtime-sync.mjs", ["--once"], continueEnv);
  const supervisor = runNodeScript("scripts/bossmind-supervisor-worker.mjs", ["--once"], continueEnv);
  const monitor = runNodeScript("scripts/bossmind-monitor-health.mjs", [], continueEnv);

  let deployGate = { skipped: true };
  if (runDeployGate && deployGateEvery > 0 && cycle % deployGateEvery === 0) {
    deployGate = runNodeScript(
      "scripts/bossmind-deploy-gate.mjs",
      [],
      {
        BOSSMIND_DEPLOY_GATE_SKIP_LINT: process.env.BOSSMIND_DEPLOY_GATE_SKIP_LINT || "1",
      }
    );
  }

  const localSyncStatus = readJsonSafe(path.join(root, ".bossmind", "runtime-sync", "status.json"));
  const hasDrift = Boolean(localSyncStatus?.hasDrift);
  const healed = Boolean(localSyncStatus?.healSucceeded);
  const autonomyScore = Number(localSyncStatus?.scores?.compositeAutonomyScore || 0);
  const degraded = !sync.ok || !monitor.ok || hasDrift;

  if (hasDrift) driftCount += 1;
  if (healed) healedCount += 1;
  if (degraded) {
    consecutiveDegraded += 1;
    consecutiveHealthy = 0;
  } else {
    consecutiveHealthy += 1;
    consecutiveDegraded = 0;
  }

  const rates = computeRates();
  const snapshot = {
    ts: startedAt,
    cycle,
    projectKey,
    degraded,
    consecutiveHealthy,
    consecutiveDegraded,
    hasDrift,
    healed,
    autonomyScore,
    rates,
    tasks: {
      runtimeSync: { ok: sync.ok, code: sync.code },
      supervisor: { ok: supervisor.ok, code: supervisor.code },
      monitor: { ok: monitor.ok, code: monitor.code },
      deployGate:
        deployGate.skipped
          ? { ok: true, skipped: true }
          : { ok: deployGate.ok, code: deployGate.code },
    },
    latestRuntimeSync: localSyncStatus
      ? {
          hasDrift: localSyncStatus.hasDrift,
          scores: localSyncStatus.scores,
          probe: localSyncStatus.probe,
          structural: localSyncStatus.structural,
        }
      : null,
    continueFrom: continuePoint
      ? {
          source: continuePoint.source,
          commitHash:
            continuePoint.checkpoint.commit_hash ||
            continuePoint.checkpoint.commitHash ||
            null,
          baselineHash:
            continuePoint.checkpoint.baseline_hash ||
            continuePoint.checkpoint.baselineHash ||
            null,
        }
      : null,
  };

  writeStatus(snapshot);
  appendHistory(snapshot);

  if (neonApi) {
    await logNeonHeartbeat(neonApi, snapshot);
  }

  if (!degraded && localSyncStatus?.fingerprint?.hash) {
    await saveContinuePoint({
      neon: neonApi,
      projectKey,
      checkpointKey,
      commitHash: localSyncStatus.gitHead || "",
      baselineHash: localSyncStatus.fingerprint.hash,
      source: "bossmind-autonomous-runtime",
      payload: {
        cycle: snapshot.cycle,
        rates: snapshot.rates,
        degraded: false,
        autonomyScore,
        runtimeSync: localSyncStatus,
      },
    });
  }

  console.log(JSON.stringify(snapshot, null, 2));
  return snapshot;
}

async function main() {
  ensureState();
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });

  const neon = require(path.join(root, "lib/shared/neon-memory.js"));
  const init = await neon.initializeSharedMemory();
  const neonEnabled = Boolean(init?.enabled);

  console.log(
    `[bossmind-autonomous-runtime] project=${projectKey} interval=${intervalMs}ms neon=${neonEnabled ? "on" : "off"}`
  );

  do {
    await runCycle(neonEnabled ? neon : null);
    if (runOnce) break;
    if (stopping) break;
    await new Promise((r) => setTimeout(r, intervalMs));
  } while (!stopping);
}

main().catch((error) => {
  console.error("[bossmind-autonomous-runtime]", error);
  process.exit(1);
});

