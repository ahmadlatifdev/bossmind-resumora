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
 *
 * Control plane (closed-loop, default on):
 * - BOSSMIND_CONTROL_PLANE_GATES=0 — disable pre-flight gates
 * - BOSSMIND_GATE_HOSTING_EVERY_CYCLES (default 1) — hosting-policy guard cadence
 * - BOSSMIND_GATE_COVERAGE_EVERY_CYCLES (default 0) — enterprise coverage JSON gate; 0=off, e.g. 24=hourly-ish at 60s loop
 * When gates fail, marketing activation + enterprise envelope are skipped (sync/supervisor/monitor still run).
 *
 * Continuous optimization (evidence + recommendations only; default off):
 * - BOSSMIND_AUTONOMOUS_OPTIMIZATION_EVERY_CYCLES — e.g. 1440 ≈ daily at 60s loop; writes .bossmind/optimization/latest.json + Neon task/event when enabled
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
/** When > 0, run unified marketing activation every N cycles (~weekly at 60s interval when set to 10080). */
const marketingEveryCycles = Number(process.env.BOSSMIND_AUTONOMOUS_MARKETING_EVERY_CYCLES || 0);
/** When > 0, run enterprise envelope (light) every N cycles for proof ledger + boundary checks. */
const enterpriseEnvelopeEveryCycles = Number(process.env.BOSSMIND_AUTONOMOUS_ENTERPRISE_EVERY_CYCLES || 0);

const controlPlaneGates = process.env.BOSSMIND_CONTROL_PLANE_GATES !== "0";
const gateHostingEveryCycles = Number(process.env.BOSSMIND_GATE_HOSTING_EVERY_CYCLES || 1);
const gateCoverageEveryCycles = Number(process.env.BOSSMIND_GATE_COVERAGE_EVERY_CYCLES || 0);

/** Evidence-only optimization snapshot cadence (0 = disabled). */
const optimizationEveryCycles = Number(process.env.BOSSMIND_AUTONOMOUS_OPTIMIZATION_EVERY_CYCLES || 0);

const {
  loadContinuePoint,
  saveContinuePoint,
} = require(path.join(root, "lib/orchestration/bossmind-last-confirmed-point.js"));

let stopping = false;
let cycle = 0;
let lastControlPlaneBlocked = false;
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

async function logControlPlaneTransition(neonApi, { cycle: c, blockedDownstream, reasons, skippedTasks }) {
  if (neonApi) {
    try {
      if (blockedDownstream !== lastControlPlaneBlocked) {
        await neonApi.saveEvent({
          projectKey,
          eventType: blockedDownstream
            ? "bossmind.control_plane.transition_blocked"
            : "bossmind.control_plane.transition_clear",
          severity: blockedDownstream ? "warning" : "info",
          source: "bossmind-autonomous-runtime",
          eventKey: `control_plane_${c}_${Date.now()}`,
          payload: { cycle: c, reasons, skippedTasks },
        });
        if (blockedDownstream && !lastControlPlaneBlocked) {
          await neonApi.saveMissingUpdate({
            projectKey,
            taskKey: "downstream_automation",
            reason: reasons.join(";") || "control_plane",
            payload: { cycle: c, skippedTasks },
          });
        }
      }
    } catch {
      /* ignore */
    }
  }
  lastControlPlaneBlocked = blockedDownstream;
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

  let hostingGuard = { skipped: true, ok: true, code: 0, reason: "BOSSMIND_CONTROL_PLANE_GATES=0" };
  let coverageGate = { skipped: true, ok: true, code: 0, reason: "BOSSMIND_CONTROL_PLANE_GATES=0" };
  const controlPlaneBlockedReasons = [];

  if (controlPlaneGates) {
    const runHostingThisCycle =
      gateHostingEveryCycles > 0 && (cycle === 1 || cycle % gateHostingEveryCycles === 0);
    if (runHostingThisCycle) {
      hostingGuard = runNodeScript("scripts/bossmind-hosting-guard.mjs", [], continueEnv);
      hostingGuard = { skipped: false, ...hostingGuard };
      if (!hostingGuard.ok) controlPlaneBlockedReasons.push("hosting_guard_failed");
    } else if (gateHostingEveryCycles > 0) {
      hostingGuard = { skipped: true, ok: true, code: 0, reason: "cadence_skip" };
    } else {
      hostingGuard = { skipped: true, ok: true, code: 0, reason: "BOSSMIND_GATE_HOSTING_EVERY_CYCLES=0" };
    }

    const runCoverageThisCycle =
      gateCoverageEveryCycles > 0 && (cycle === 1 || cycle % gateCoverageEveryCycles === 0);
    if (runCoverageThisCycle) {
      const r = runNodeScript("scripts/bossmind-enterprise-coverage-report.mjs", [], {
        ...continueEnv,
        BOSSMIND_COVERAGE_STRICT: "0",
      });
      const artifactsOk = r.json?.allCriticalArtifactsPresent !== false;
      coverageGate = {
        skipped: false,
        ok: r.ok && artifactsOk,
        code: r.code,
        allCriticalArtifactsPresent: r.json?.allCriticalArtifactsPresent,
      };
      if (!coverageGate.ok) {
        controlPlaneBlockedReasons.push(
          r.json?.allCriticalArtifactsPresent === false
            ? "coverage_critical_artifacts_missing"
            : "coverage_script_failed"
        );
      }
    } else if (gateCoverageEveryCycles > 0) {
      coverageGate = { skipped: true, ok: true, code: 0, reason: "cadence_skip" };
    } else {
      coverageGate = { skipped: true, ok: true, code: 0, reason: "BOSSMIND_GATE_COVERAGE_EVERY_CYCLES=0" };
    }
  }

  const blockedDownstream = controlPlaneBlockedReasons.length > 0;
  const skippedDownstreamTasks = [];
  if (blockedDownstream) {
    if (marketingEveryCycles > 0 && cycle > 0 && cycle % marketingEveryCycles === 0) {
      skippedDownstreamTasks.push("marketing_activation");
    }
    if (enterpriseEnvelopeEveryCycles > 0 && cycle > 0 && cycle % enterpriseEnvelopeEveryCycles === 0) {
      skippedDownstreamTasks.push("enterprise_envelope");
    }
  }

  await logControlPlaneTransition(neonApi, {
    cycle,
    blockedDownstream,
    reasons: controlPlaneBlockedReasons,
    skippedTasks: skippedDownstreamTasks,
  });

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

  let marketingActivation = { skipped: true, reason: "BOSSMIND_AUTONOMOUS_MARKETING_EVERY_CYCLES=0" };
  if (marketingEveryCycles > 0 && cycle > 0 && cycle % marketingEveryCycles === 0) {
    if (blockedDownstream) {
      marketingActivation = {
        skipped: true,
        reason: `control_plane_blocked:${controlPlaneBlockedReasons.join(",")}`,
      };
    } else {
      marketingActivation = runNodeScript(
        "scripts/bossmind-marketing-activation.mjs",
        ["--from-autonomous"],
        continueEnv
      );
    }
  }

  let enterpriseEnvelope = { skipped: true, reason: "BOSSMIND_AUTONOMOUS_ENTERPRISE_EVERY_CYCLES=0" };
  if (enterpriseEnvelopeEveryCycles > 0 && cycle > 0 && cycle % enterpriseEnvelopeEveryCycles === 0) {
    if (blockedDownstream) {
      enterpriseEnvelope = {
        skipped: true,
        reason: `control_plane_blocked:${controlPlaneBlockedReasons.join(",")}`,
      };
    } else {
      enterpriseEnvelope = runNodeScript(
        "scripts/bossmind-enterprise-envelope.mjs",
        ["--from-autonomous"],
        continueEnv
      );
    }
  }

  const localSyncStatus = readJsonSafe(path.join(root, ".bossmind", "runtime-sync", "status.json"));
  const latestReconciliation = readJsonSafe(path.join(root, ".bossmind", "reconciliation", "status.json"));

  let optimizationCycle = { skipped: true, reason: "BOSSMIND_AUTONOMOUS_OPTIMIZATION_EVERY_CYCLES=0" };
  if (optimizationEveryCycles > 0 && cycle > 0 && cycle % optimizationEveryCycles === 0) {
    try {
      const risk = runNodeScript("scripts/bossmind-predictive-runtime-risk.mjs", [], continueEnv);
      const {
        buildOptimizationSnapshot,
        persistOptimizationSnapshot,
      } = require(path.join(root, "lib/orchestration/bossmind-continuous-optimization-snapshot.js"));
      const optSnap = buildOptimizationSnapshot({
        projectKey,
        cycle,
        runtimeSync: localSyncStatus,
        reconciliation: latestReconciliation,
        predictiveRisk: risk.json || {},
        hostingGate: hostingGuard,
        envHints: {
          neonDatabaseUrl: Boolean(process.env.NEON_DATABASE_URL),
          siteUrlConfigured: Boolean(
            process.env.NEXT_PUBLIC_SITE_URL ||
              process.env.NEXT_PUBLIC_BOSSMIND_PUBLIC_ORIGIN ||
              process.env.BOSSMIND_PUBLIC_ORIGIN
          ),
          stripePricesConfigured: Boolean(
            process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC &&
              process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO &&
              process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE
          ),
        },
      });
      const optDir = path.join(root, ".bossmind", "optimization");
      fs.mkdirSync(optDir, { recursive: true });
      fs.writeFileSync(path.join(optDir, "latest.json"), JSON.stringify(optSnap, null, 2), "utf8");
      let persist = { persisted: false, reason: "neon_off" };
      if (neonApi) {
        persist = await persistOptimizationSnapshot(neonApi, optSnap);
      }
      optimizationCycle = {
        skipped: false,
        ok: true,
        readinessScore: optSnap.optimizationReadinessScore,
        recommendationCount: optSnap.recommendations.length,
        predictiveRiskScore: optSnap.predictiveRiskSnapshot?.riskScore ?? null,
        persist,
      };
    } catch (e) {
      optimizationCycle = {
        skipped: false,
        ok: false,
        error: e.message || String(e),
      };
    }
  }

  const hasDrift = Boolean(localSyncStatus?.hasDrift);
  const healed = Boolean(localSyncStatus?.healSucceeded);
  const autonomyScore = Number(localSyncStatus?.scores?.compositeAutonomyScore || 0);
  const degraded = !sync.ok || !monitor.ok || hasDrift || blockedDownstream;

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
      hostingGuard,
      coverageGate,
      controlPlane: {
        gatesEnabled: controlPlaneGates,
        blockedDownstream,
        reasons: controlPlaneBlockedReasons,
        skippedDownstreamTasks,
      },
      runtimeSync: { ok: sync.ok, code: sync.code },
      supervisor: { ok: supervisor.ok, code: supervisor.code },
      monitor: { ok: monitor.ok, code: monitor.code },
      deployGate:
        deployGate.skipped
          ? { ok: true, skipped: true }
          : { ok: deployGate.ok, code: deployGate.code },
      marketingActivation: marketingActivation.skipped
        ? marketingActivation
        : { ok: marketingActivation.ok, code: marketingActivation.code },
      enterpriseEnvelope: enterpriseEnvelope.skipped
        ? enterpriseEnvelope
        : { ok: enterpriseEnvelope.ok, code: enterpriseEnvelope.code },
      optimizationCycle,
    },
    latestRuntimeSync: localSyncStatus
      ? {
          hasDrift: localSyncStatus.hasDrift,
          scores: localSyncStatus.scores,
          probe: localSyncStatus.probe,
          structural: localSyncStatus.structural,
          reconciliation: localSyncStatus.reconciliation || null,
        }
      : null,
    latestReconciliation: latestReconciliation
      ? {
          ok: latestReconciliation.ok,
          score: latestReconciliation.score,
          alignmentBlend: latestReconciliation.alignmentBlend,
          mismatchCount: latestReconciliation.mismatches?.length ?? 0,
          ts: latestReconciliation.ts,
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

