#!/usr/bin/env node
/**
 * BossMind persistent dev watchdog — autonomous Next.js restart on crash / refusal / stalled boot.
 *
 * Env:
 *   BOSSMIND_WATCHDOG_PORT — default PORT or 3001
 *   BOSSMIND_HEALTH_FAIL_MAX — consecutive health misses before recycle (default 5)
 *   BOSSMIND_WATCHDOG_BACKOFF_MS — base restart delay (default 2800)
 *   BOSSMIND_WATCHDOG_BOOT_TIMEOUT_MS — first healthy deadline (default 120000)
 *   BOSSMIND_WATCHDOG_FREE_PORT_KILL — kill :port holders before recycle (default 1 on win32, 0 elsewhere)
 *   BOSSMIND_WATCHDOG_MAX_RESTARTS_WINDOW — sliding window limit (default 15)
 *   BOSSMIND_WATCHDOG_RESTART_WINDOW_MS — window size (default 900000 / 15m)
 *   BOSSMIND_WATCHDOG_COOLDOWN_MS — pause after exceeding window or rapid exits (default 120000)
 *   BOSSMIND_WATCHDOG_RAPID_EXIT_MS — classify crash loop when exit quicker than this (default 45000)
 *   BOSSMIND_WATCHDOG_RAPID_EXIT_COUNT — before extra cooldown (default 4)
 *   BOSSMIND_WATCHDOG_PROBE_ROUTES — 1 → after healthy, probe HTML routes + log
 *   BOSSMIND_PROJECT_KEY — Neon project_key (default resumora)
 */
import http from "http";
import { spawn } from "child_process";
import { execSync } from "child_process";
import process from "node:process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const cwd = process.cwd();
const stateDir = path.join(cwd, ".bossmind", "watchdog");
const sessionPath = path.join(stateDir, "session.json");
const eventsPath = path.join(stateDir, "events.jsonl");

const port = Number(process.env.BOSSMIND_WATCHDOG_PORT || process.env.PORT || 3001);
const failMax = Number(process.env.BOSSMIND_HEALTH_FAIL_MAX || 5);
const baseBackoffMs = Number(process.env.BOSSMIND_WATCHDOG_BACKOFF_MS || 2800);
const bootTimeoutMs = Number(process.env.BOSSMIND_WATCHDOG_BOOT_TIMEOUT_MS || 120000);
const restartWindowMs = Number(process.env.BOSSMIND_WATCHDOG_RESTART_WINDOW_MS || 900000);
const maxRestartsWindow = Number(process.env.BOSSMIND_WATCHDOG_MAX_RESTARTS_WINDOW || 15);
const cooldownMs = Number(process.env.BOSSMIND_WATCHDOG_COOLDOWN_MS || 120000);
const rapidExitMs = Number(process.env.BOSSMIND_WATCHDOG_RAPID_EXIT_MS || 45000);
const rapidExitCountTrig = Number(process.env.BOSSMIND_WATCHDOG_RAPID_EXIT_COUNT || 4);
const freePortKill =
  process.env.BOSSMIND_WATCHDOG_FREE_PORT_KILL === "1"
    ? true
    : process.env.BOSSMIND_WATCHDOG_FREE_PORT_KILL === "0"
      ? false
      : process.platform === "win32";
const probeRoutes = process.env.BOSSMIND_WATCHDOG_PROBE_ROUTES === "1";
const healthIntervalMs = Number(process.env.BOSSMIND_WATCHDOG_HEALTH_MS || 8000);
const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";

const ROUTE_PROBE_PATHS = [
  "/",
  "/pricing",
  "/services",
  "/capabilities",
  "/client-engagement",
  "/pricing?lang=fr",
];

let child = null;
let restarts = 0;
let consecutiveFails = 0;
let startedAtMs = 0;
let healthyAtLeastOnce = false;
let restartTimer = null;
/** @type {number[]} */
let restartTimestampsInWindow = [];
/** @type {number[]} */
let rapidExitMarks = [];
let circuitBreakerUntil = 0;
let deathSpiralLevel = 0;
let healthScore = 100;

function appendLocalEvent(lineObj) {
  try {
    if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
    fs.appendFileSync(eventsPath, `${JSON.stringify({ ts: Date.now(), ...lineObj })}\n`, "utf8");
  } catch {
    /* ignore */
  }
}

async function neonRecoveryLog(eventKey, severity, payload) {
  appendLocalEvent({ eventKey, severity, payload });
  try {
    require(path.join(cwd, "lib/shared/load-project-env.js")).loadProjectEnv(cwd);
    const neon = require(path.join(cwd, "lib/shared/neon-memory.js"));
    await neon.initializeSharedMemory();
    await neon.saveEvent({
      projectKey,
      eventType: "bossmind_watchdog.recovery",
      severity,
      source: "bossmind-watchdog",
      eventKey,
      payload,
    });
    await neon.upsertTaskState({
      projectKey,
      taskKey: "bossmind_watchdog",
      status: "active",
      assignedAgent: "watchdog-node",
      payload: {
        port,
        lastEvent: eventKey,
        restartsInWindow: restartTimestampsInWindow.length,
        healthScore,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch {
    /* Neon offline is OK — local append still happened */
  }
}

function pruneRestartWindow(now) {
  restartTimestampsInWindow = restartTimestampsInWindow.filter((t) => now - t < restartWindowMs);
}

function recordRestart(now) {
  pruneRestartWindow(now);
  restartTimestampsInWindow.push(now);
}

function shouldCircuitBreak(now) {
  pruneRestartWindow(now);
  if (restartTimestampsInWindow.length >= maxRestartsWindow) return true;
  if (circuitBreakerUntil > now) return true;
  if (rapidExitMarks.length >= rapidExitCountTrig) return true;
  return false;
}

function nextBackoffMs() {
  const cap = Math.min(60_000, baseBackoffMs * Math.pow(1.85, Math.min(deathSpiralLevel, 6)));
  const jitter = 0.85 + Math.random() * 0.35;
  return Math.round(cap * jitter);
}

function writeSession(extra = {}) {
  try {
    if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
    const sess = {
      watchdogPid: process.pid,
      childPid: child?.pid || null,
      port,
      restartsTotal: restarts,
      consecutiveFails,
      healthyAtLeastOnce,
      healthScore,
      circuitBreakerUntil,
      deathSpiralLevel,
      lastHeartbeat: Date.now(),
      cwd,
      ...extra,
    };
    fs.writeFileSync(sessionPath, JSON.stringify(sess, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

function freePortListeners(p) {
  if (process.platform !== "win32") return;
  try {
    execSync(
      `powershell -NoProfile -Command "$p=${p}; $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($c) { $c | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }"`,
      { stdio: "ignore", cwd }
    );
  } catch {
    /* ignore */
  }
}

function probeHealthUrl(pathname) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}${pathname}`, { timeout: 12000 }, (res) => {
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

async function probeRouteBundle() {
  const out = { port, paths: {} };
  for (const p of ROUTE_PROBE_PATHS) {
    out.paths[p] = await probeHtmlRoute(p);
  }
  return out;
}

function probeHtmlRoute(pathname) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}${pathname}`, { timeout: 8000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (ch) => {
        body += ch;
        if (body.length > 2e6) req.destroy();
      });
      res.on("end", () => {
        const ok = res.statusCode === 200 && body.includes("</html>");
        resolve(ok);
      });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function stripeEnvSnapshot() {
  try {
    const { auditStripeEnv } = require(path.join(cwd, "lib/marketing/stripe-env-audit.js"));
    const a = auditStripeEnv();
    return {
      checkoutReady: a.checkoutReady,
      webhookSigningReady: a.webhookSigningReady,
      financialPipelineReady: a.financialPipelineReady,
    };
  } catch {
    return { checkoutReady: null };
  }
}

function clearBootTimer() {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
}

function scheduleStartChild(delayMs = baseBackoffMs) {
  setTimeout(() => {
    attemptStartChild();
  }, delayMs);
}

function attemptStartChild() {
  const now = Date.now();
  rapidExitMarks = rapidExitMarks.filter((t) => now - t < restartWindowMs);
  if (now < circuitBreakerUntil) {
    console.warn(
      `[bossmind-watchdog] circuit breaker active ${Math.ceil((circuitBreakerUntil - now) / 1000)}s remaining`
    );
    writeSession({ breaker: true });
    scheduleStartChild(Math.min(circuitBreakerUntil - now + 500, 60000));
    return;
  }
  if (shouldCircuitBreak(now)) {
    circuitBreakerUntil = now + cooldownMs;
    deathSpiralLevel = Math.min(deathSpiralLevel + 1, 12);
    void neonRecoveryLog(`breaker_${now}`, "warn", {
      reason: "restart_rate_limit",
      restartsInWindow: restartTimestampsInWindow.length,
      rapidExitMarks: rapidExitMarks.length,
    });
    restartTimestampsInWindow = [];
    rapidExitMarks = [];
    appendLocalEvent({ breakerOpen: true, until: circuitBreakerUntil });
    writeSession({ breaker: true });
    scheduleStartChild(cooldownMs);
    return;
  }

  if (freePortKill) freePortListeners(port);

  deathSpiralLevel = Math.max(0, deathSpiralLevel - 1);
  healthyAtLeastOnce = false;
  startedAtMs = Date.now();
  recordRestart(now);

  clearBootTimer();
  restartTimer = setTimeout(() => {
    if (!child || healthyAtLeastOnce) return;
    console.error(`[bossmind-watchdog] boot timeout (${bootTimeoutMs}ms) without /api/health — recycling`);
    void neonRecoveryLog(`boot_timeout_${startedAtMs}`, "warn", { port, bootTimeoutMs });
    try {
      child?.kill?.("SIGTERM");
    } catch {
      /* ignore */
    }
  }, bootTimeoutMs);

  const env = { ...process.env, PORT: String(port) };
  child = spawn("npx", ["next", "dev", "--webpack"], {
    stdio: "inherit",
    shell: true,
    env,
    cwd,
  });
  restarts += 1;

  child.on("exit", (code, signal) => {
    const elapsed = Date.now() - startedAtMs;
    child = null;
    clearBootTimer();
    rapidExitMarks = rapidExitMarks.filter((t) => Date.now() - t < restartWindowMs);
    if (!healthyAtLeastOnce && elapsed < rapidExitMs) {
      rapidExitMarks.push(Date.now());
    }

    appendLocalEvent({ kind: "child_exit", code, signal: signal || "", elapsed, restarts });

    console.error(
      `[bossmind-watchdog] next dev exited code=${code} signal=${signal || ""} restarts=${restarts}`
    );

    void neonRecoveryLog(`child_exit_${Date.now()}`, healthyAtLeastOnce ? "info" : "warn", {
      code,
      signal: signal || "",
      healthyAtLeastOnce,
      elapsedMs: elapsed,
      port,
    });

    scheduleStartChild(nextBackoffMs());
    writeSession();
  });

  child.on("error", (err) => {
    child = null;
    clearBootTimer();
    appendLocalEvent({ kind: "spawn_error", message: err.message });
    console.error("[bossmind-watchdog] spawn error:", err.message);
    void neonRecoveryLog(`spawn_error_${Date.now()}`, "error", { message: err.message, port });
    scheduleStartChild(nextBackoffMs());
    writeSession();
  });

  appendLocalEvent({ kind: "child_start", pid: child.pid, restarts });
  console.log(`[bossmind-watchdog] started next dev PID=${child.pid} (restart #${restarts}) PORT=${port}`);
  writeSession();
}

async function healthLoop() {
  const ok = await probeHealthUrl("/api/health");
  const now = Date.now();

  if (ok) {
    consecutiveFails = 0;
    healthyAtLeastOnce = true;
    clearBootTimer();
    healthScore = Math.min(100, healthScore + 4);

    writeSession({
      breaker: circuitBreakerUntil > now,
      stripe: await stripeEnvSnapshot(),
    });

    if (probeRoutes) {
      const bundle = await probeRouteBundle();
      void neonRecoveryLog(`route_probe_${Date.now()}`, "info", bundle);
    }

    pruneRestartWindow(now);
    if (circuitBreakerUntil && now >= circuitBreakerUntil) {
      circuitBreakerUntil = 0;
      deathSpiralLevel = Math.max(0, deathSpiralLevel - 2);
    }
    return;
  }

  const booting = now - startedAtMs < bootTimeoutMs && child && !healthyAtLeastOnce;
  if (booting) {
    writeSession();
    return;
  }

  consecutiveFails += 1;
  healthScore = Math.max(20, healthScore - 12);
  console.warn(`[bossmind-watchdog] health FAIL ${consecutiveFails}/${failMax} :${port} (connection refused / error)`);

  writeSession({
    breaker: circuitBreakerUntil > now,
    lastFailAt: Date.now(),
  });

  if (consecutiveFails >= failMax && child) {
    void neonRecoveryLog(`forced_recycle_${Date.now()}`, "warn", {
      consecutiveFails,
      failMax,
      port,
    });
    if (freePortKill) freePortListeners(port);
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      if (!child?.pid) return;
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, 2000);
    consecutiveFails = 0;
    deathSpiralLevel += 1;
  }
}

function shutdown() {
  clearBootTimer();
  if (child) {
    try {
      child.kill("SIGINT");
    } catch {
      /* ignore */
    }
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

void (async () => {
  fs.mkdirSync(stateDir, { recursive: true });
  appendLocalEvent({ kind: "watchdog_boot", wdPid: process.pid, port });

  console.log(
    `[bossmind-watchdog] BossMind auto-recovery active → http://127.0.0.1:${port} (state: ${stateDir})`
  );
  void neonRecoveryLog(`watchdog_start_${Date.now()}`, "info", { port, cwd, freePortKill });

  attemptStartChild();
  setInterval(() => {
    void healthLoop();
  }, healthIntervalMs);
  setInterval(() => writeSession(), 30000);
})();
