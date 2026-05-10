#!/usr/bin/env node
/**
 * Dev watchdog: restarts next dev on crash / failed health checks.
 * Windows-safe: uses shell + PORT env (same pattern as dev-with-browser).
 *
 * Env:
 *   BOSSMIND_WATCHDOG_PORT (default PORT or 3000)
 *   BOSSMIND_WATCHDOG_FREE_PORT=1 — kill listeners on port before start (admin)
 *   BOSSMIND_HEALTH_FAIL_MAX (default 5)
 *   BOSSMIND_WATCHDOG_BACKOFF_MS (default 2500)
 */
import http from "http";
import { spawn } from "child_process";
import { execSync } from "child_process";
import process from "node:process";

const port = Number(process.env.BOSSMIND_WATCHDOG_PORT || process.env.PORT || 3000);
const failMax = Number(process.env.BOSSMIND_HEALTH_FAIL_MAX || 5);
const backoffMs = Number(process.env.BOSSMIND_WATCHDOG_BACKOFF_MS || 2500);
const freePort = process.env.BOSSMIND_WATCHDOG_FREE_PORT === "1";

let child = null;
let restarts = 0;
let consecutiveFails = 0;

function freePortWindows(p) {
  if (process.platform !== "win32") return;
  try {
    execSync(
      `powershell -NoProfile -Command "$p=${p}; $c = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($c) { $c | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }"`,
      { stdio: "ignore" }
    );
  } catch {
    /* ignore */
  }
}

function probeHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: 3500 }, (res) => {
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

function startChild() {
  if (freePort) freePortWindows(port);
  const env = { ...process.env, PORT: String(port) };
  const c = spawn("npx", ["next", "dev", "--webpack"], {
    stdio: "inherit",
    shell: true,
    env,
  });
  c.on("exit", (code, signal) => {
    console.error(
      `[bossmind-watchdog] next dev exited code=${code} signal=${signal || ""} restarts=${restarts}`
    );
    child = null;
    scheduleRestart();
  });
  c.on("error", (err) => {
    console.error("[bossmind-watchdog] spawn error:", err.message);
    child = null;
    scheduleRestart();
  });
  child = c;
  restarts += 1;
  console.log(`[bossmind-watchdog] started next dev (attempt ${restarts}) on PORT=${port}`);
}

function scheduleRestart() {
  setTimeout(() => {
    startChild();
  }, backoffMs);
}

async function healthLoop() {
  const ok = await probeHealth();
  if (ok) {
    consecutiveFails = 0;
    return;
  }
  consecutiveFails += 1;
  console.warn(`[bossmind-watchdog] health fail ${consecutiveFails}/${failMax} on :${port}`);
  if (consecutiveFails >= failMax && child) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      if (child) {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }, 1500);
    consecutiveFails = 0;
  }
}

startChild();
setInterval(healthLoop, 8000);

process.on("SIGINT", () => {
  if (child) child.kill("SIGINT");
  process.exit(0);
});
process.on("SIGTERM", () => {
  if (child) child.kill("SIGTERM");
  process.exit(0);
});
