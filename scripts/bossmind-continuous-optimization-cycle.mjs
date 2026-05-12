#!/usr/bin/env node
/**
 * Continuous optimization cycle — aggregates local BossMind evidence into one snapshot + recommendations.
 * Does not auto-edit code, bump dependencies, or mutate protected production UI.
 *
 *   node scripts/bossmind-continuous-optimization-cycle.mjs [--persist-neon]
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function readJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function runJsonScript(rel, args = [], extraEnv = {}) {
  const res = spawnSync(process.execPath, [path.join(root, rel), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, ...extraEnv },
  });
  const stdout = res.stdout || "";
  let json = null;
  try {
    const t = stdout.trim();
    if (t.startsWith("{") && t.endsWith("}")) json = JSON.parse(t);
  } catch {
    json = null;
  }
  return { ok: (res.status ?? 1) === 0, code: res.status ?? 1, json };
}

function runExitOk(rel, args = [], extraEnv = {}) {
  const res = spawnSync(process.execPath, [path.join(root, rel), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, ...extraEnv },
  });
  return { ok: (res.status ?? 1) === 0, code: res.status ?? 1 };
}

async function main() {
  try {
    require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  } catch {
    /* ignore */
  }

  const persistNeon = process.argv.includes("--persist-neon");
  const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";

  const hosting = runExitOk("scripts/bossmind-hosting-guard.mjs", []);
  const hostingGate = {
    skipped: false,
    ok: hosting.ok,
    code: hosting.code,
  };

  const risk = runJsonScript("scripts/bossmind-predictive-runtime-risk.mjs", []);
  const runtimeSync = readJsonSafe(path.join(root, ".bossmind", "runtime-sync", "status.json"));
  const reconciliation = readJsonSafe(path.join(root, ".bossmind", "reconciliation", "status.json"));

  const { buildOptimizationSnapshot, persistOptimizationSnapshot } = require(path.join(
    root,
    "lib/orchestration/bossmind-continuous-optimization-snapshot.js"
  ));

  const snap = buildOptimizationSnapshot({
    projectKey,
    cycle: 0,
    runtimeSync,
    reconciliation,
    predictiveRisk: risk.json || {},
    hostingGate,
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

  const outDir = path.join(root, ".bossmind", "optimization");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "latest.json"), JSON.stringify(snap, null, 2), "utf8");

  let persist = { persisted: false, reason: "no_flag" };
  if (persistNeon) {
    const neon = require(path.join(root, "lib/shared/neon-memory.js"));
    const init = await neon.initializeSharedMemory();
    if (init.enabled) {
      persist = await persistOptimizationSnapshot(neon, snap);
    } else {
      persist = { persisted: false, reason: init.reason || "neon_disabled" };
    }
  }

  const out = { ok: true, path: path.join(outDir, "latest.json"), persist, snapshot: snap };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error("[bossmind-continuous-optimization-cycle]", e);
  process.exit(1);
});
