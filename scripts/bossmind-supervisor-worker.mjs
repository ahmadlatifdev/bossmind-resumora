#!/usr/bin/env node
/**
 * Persistent BossMind supervisor: claims pending rows from Neon `task_state`,
 * executes repair / health probes, completes or fails atomically via status updates.
 *
 * Requires NEON_DATABASE_URL. Run under Railway Worker, systemd, PM2, or keep-alive terminal.
 *
 * Env:
 *   BOSSMIND_PROJECT_KEY (default resumora)
 *   BOSSMIND_SUPERVISOR_POLL_MS (default 12000)
 *   BOSSMIND_SUPERVISOR_BATCH_PER_TICK (default 4)
 *   BOSSMIND_SUPERVISOR_ONCE — if "1", run one claiming burst then exit 0 (cron-friendly)
 *   BOSSMIND_HEALTH_ORIGIN (default http://127.0.0.1:3001)
 */
import http from "http";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.join(__dirname, "..");
const require = createRequire(import.meta.url);

const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
const pollMs = Number(process.env.BOSSMIND_SUPERVISOR_POLL_MS || 12000);
const batchMax = Number(process.env.BOSSMIND_SUPERVISOR_BATCH_PER_TICK || 4);
const runOnce = process.env.BOSSMIND_SUPERVISOR_ONCE === "1" || process.argv.includes("--once");
const healthOrigin = (process.env.BOSSMIND_HEALTH_ORIGIN || "http://127.0.0.1:3001").replace(/\/$/, "");

function loadLibs() {
  require(path.join(cwd, "lib/shared/load-project-env.js")).loadProjectEnv(cwd);
  return require(path.join(cwd, "lib/shared/neon-memory.js"));
}

async function pingHealth(origin) {
  const url = new URL("/api/health", origin.endsWith("/") ? origin : `${origin}/`);
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 15000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function finishTask(neon, taskKey, status, extraPayload = {}) {
  await neon.upsertTaskState({
    projectKey,
    taskKey,
    status,
    assignedAgent: "bossmind-supervisor-worker",
    payload: extraPayload,
  });
}

async function processOne(neon, runRepairFlow, taskRow) {
  const { task_key: taskKey, payload } = taskRow;
  const job =
    typeof payload.job === "string"
      ? payload.job
      : typeof payload.jobType === "string"
        ? payload.jobType
        : "noop";

  if (job === "health_probe") {
    const origin = typeof payload.origin === "string" ? payload.origin : healthOrigin;
    const ok = await pingHealth(origin);
    await neon.saveEvent({
      projectKey,
      eventType: ok ? "supervisor.health_probe.ok" : "supervisor.health_probe.fail",
      severity: ok ? "info" : "warning",
      source: "bossmind-supervisor-worker",
      eventKey: taskKey,
      payload: { origin, ok },
    });
    await finishTask(neon, taskKey, ok ? "completed" : "failed", {
      ...payload,
      outcome: ok ? "healthy" : "unhealthy",
      finishedAt: new Date().toISOString(),
    });
    return;
  }

  if (job === "run_repair") {
    const sentryEvent = payload.sentryEvent || {
      eventId: `worker-${taskKey}`,
      errorType: payload.errorType || "queued_repair",
      errorMessage: payload.errorMessage || "Queued repair task",
      stack: payload.stack || "",
    };
    const validationResult = payload.validationResult || {
      ok: false,
      details: "Supervisor deferred validation",
    };
    const deployResult = payload.deployResult || { ok: false, details: "Deploy external to Railway" };
    await runRepairFlow({
      projectKey,
      sentryEvent,
      validationResult,
      deployResult,
    });
    await finishTask(neon, taskKey, "completed", {
      ...payload,
      finishedAt: new Date().toISOString(),
    });
    return;
  }

  if (job === "noop") {
    await neon.saveEvent({
      projectKey,
      eventType: "supervisor.noop.completed",
      severity: "info",
      source: "bossmind-supervisor-worker",
      eventKey: taskKey,
      payload: {},
    });
    await finishTask(neon, taskKey, "completed", { ...payload, finishedAt: new Date().toISOString() });
    return;
  }

  await neon.saveEvent({
    projectKey,
    eventType: "supervisor.job.unknown",
    severity: "warning",
    source: "bossmind-supervisor-worker",
    eventKey: taskKey,
    payload: { job },
  });
  await finishTask(neon, taskKey, "failed", { ...payload, error: `unknown_job:${job}` });
}

async function tick(neon, runRepairFlow) {
  let n = 0;
  while (n < batchMax) {
    const row = await neon.claimNextPendingTask({ projectKey });
    if (!row) break;
    n += 1;
    try {
      await processOne(neon, runRepairFlow, row);
    } catch (err) {
      await neon.saveEvent({
        projectKey,
        eventType: "supervisor.task.exception",
        severity: "error",
        source: "bossmind-supervisor-worker",
        eventKey: row.task_key,
        payload: { message: err.message || String(err) },
      });
      await finishTask(neon, row.task_key, "failed", {
        ...(typeof row.payload === "object" ? row.payload : {}),
        error: err.message || String(err),
      });
    }
  }
}

let stopping = false;
function gracefulStop() {
  stopping = true;
}

async function main() {
  const neon = loadLibs();
  const { runRepairFlow } = require(path.join(cwd, "lib/orchestration/langgraph-repair-flow.js"));

  const init = await neon.initializeSharedMemory();
  if (!init.enabled) {
    console.error(`[bossmind-supervisor] Neon unavailable: ${init.reason}`);
    process.exit(1);
  }

  await neon.saveEvent({
    projectKey,
    eventType: "supervisor.worker.start",
    severity: "info",
    source: "bossmind-supervisor-worker",
    eventKey: `boot-${process.pid}-${Date.now()}`,
    payload: { pollMs, batchMax, runOnce },
  });

  process.on("SIGINT", gracefulStop);
  process.on("SIGTERM", gracefulStop);

  console.log(`[bossmind-supervisor] Worker active project=${projectKey} poll=${pollMs}ms batch=${batchMax}`);

  do {
    try {
      await tick(neon, runRepairFlow);
    } catch (e) {
      console.error("[bossmind-supervisor] tick error:", e.message);
    }
    if (runOnce) break;
    await new Promise((r) => setTimeout(r, pollMs));
  } while (!stopping);

  await neon.saveEvent({
    projectKey,
    eventType: "supervisor.worker.stop",
    severity: "info",
    source: "bossmind-supervisor-worker",
    payload: { reason: stopping ? "signal" : "once" },
  });
  console.log("[bossmind-supervisor] Exiting");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
