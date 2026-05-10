#!/usr/bin/env node
/**
 * One-shot localhost repair: load env, npm install, optional Stripe validation, optional port free.
 *
 * Usage: node scripts/bossmind-runtime-recovery.mjs [--free-port] [--no-install]
 * Env: BOSSMIND_WATCHDOG_PORT (default 3001)
 */
import { spawnSync } from "child_process";
import { execSync } from "child_process";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "module";
import http from "http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const require = createRequire(import.meta.url);

const args = new Set(process.argv.slice(2));
const noInstall = args.has("--no-install");
const freePort = args.has("--free-port");
const port = Number(process.env.BOSSMIND_WATCHDOG_PORT || process.env.PORT || 3001);

function loadEnv() {
  try {
    const { loadProjectEnv } = require(path.join(root, "lib/shared/load-project-env.js"));
    const { loadedFiles } = loadProjectEnv(root);
    console.log(
      loadedFiles.length ? `Loaded: ${loadedFiles.join(", ")}` : "No .env.local / .env (process.env only)"
    );
  } catch (e) {
    console.warn("loadProjectEnv:", e.message);
  }
}

function probeHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: 4000 }, (res) => {
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

function freePortWin(p) {
  if (process.platform !== "win32") return;
  try {
    execSync(
      `powershell -NoProfile -Command "$p=${p}; $c = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($c) { $c | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }"`,
      { stdio: "inherit", cwd: root }
    );
  } catch {
    /* ignore */
  }
}

async function main() {
  console.log(`[bossmind-runtime-recovery] cwd=${root} port=${port}`);
  loadEnv();

  if (freePort) {
    console.log(`[bossmind-runtime-recovery] Freeing port ${port} (listeners)`);
    freePortWin(port);
  }

  if (!noInstall) {
    console.log("[bossmind-runtime-recovery] npm install");
    const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--no-fund", "--no-audit"], {
      stdio: "inherit",
      cwd: root,
      shell: false,
    });
    if (r.status !== 0) {
      console.error("[bossmind-runtime-recovery] npm install failed");
      process.exit(r.status || 1);
    }
  }

  console.log("[bossmind-runtime-recovery] stripe env check (non-strict)");
  spawnSync(process.execPath, [path.join(root, "scripts/stripe-env-validation.js")], {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env },
  });

  const up = await probeHealth();
  console.log(
    JSON.stringify(
      {
        localhostHealth: up,
        port,
        hint: up
          ? `OK — http://127.0.0.1:${port}`
          : `Down — run: npm run bossmind:watch:dev   (or npm run dev with PORT=${port})`,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
