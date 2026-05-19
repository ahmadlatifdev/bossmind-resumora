#!/usr/bin/env node
/**
 * Ultra-stabilization + autonomous recovery orchestrator (active Resumora only).
 * Detection → diagnosis → repair → redeploy (optional) → verify → hub memory.
 *
 *   npm run bossmind:ultra:stabilize
 *   npm run bossmind:ultra:stabilize -- --redeploy
 *   npm run bossmind:ultra:stabilize -- --lock --i-understand-production
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync, execSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const hubRoot = process.env.BOSSMIND_HUB_ROOT || "D:/BossMind";
const outDir = path.join(root, ".bossmind", "ultra-stabilization");
const hubMemoryDir = path.join(hubRoot, "13-shared-memory");

const { HUB_ENV_SOURCES } = require(path.join(root, "lib/shared/hub-env-sources.js"));

function hasFlag(n) {
  return process.argv.includes(`--${n}`);
}
function arg(name, def = "") {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : def;
}

function runNpm(script, extraArgs = []) {
  const r = spawnSync("npm", ["run", script, "--", ...extraArgs], {
    cwd: root,
    encoding: "utf8",
    shell: true,
  });
  return { ok: r.status === 0, status: r.status, stdout: (r.stdout || "").slice(-8000), stderr: (r.stderr || "").slice(-4000) };
}

function runNode(script, args = []) {
  const r = spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], {
    cwd: root,
    encoding: "utf8",
  });
  return { ok: r.status === 0, status: r.status, stdout: (r.stdout || "").slice(-8000), stderr: (r.stderr || "").slice(-4000) };
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function mergeHubEnv() {
  let merged = { ...process.env };
  for (const src of HUB_ENV_SOURCES) merged = { ...parseEnvFile(src), ...merged };
  merged = { ...parseEnvFile(path.join(root, ".env.local")), ...parseEnvFile(path.join(root, ".env")), ...merged };
  const neon = merged.NEON_DATABASE_URL || merged.DATABASE_URL || "";
  if (neon) {
    merged.NEON_DATABASE_URL = neon;
    merged.DATABASE_URL = neon;
  }
  return merged;
}

function getGitHead(cwd) {
  try {
    return execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

async function fetchJson(url, init = {}) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(45000) });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, body };
  } catch (e) {
    return { status: 0, ok: false, body: { error: e.message } };
  }
}

async function probeLive(origin) {
  const o = origin.replace(/\/$/, "");
  const health = await fetchJson(`${o}/api/health`);
  const dbHealth = await fetchJson(`${o}/api/runtime/database-health`);
  const email = `ultra-${Date.now()}@resumora.invalid`;
  const register = await fetchJson(`${o}/api/engagement/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "UltraStab123!", displayName: "UltraStab" }),
  });
  const dbOk = health.body?.database?.ok === true;
  const regOk = (register.status === 200 || register.status === 201) && register.body?.ok === true;
  return {
    origin: o,
    databaseOk: dbOk,
    registerOk: regOk,
    healthStatus: health.status,
    healthOk: health.body?.ok === true,
    databaseSource: health.body?.database?.source,
    registerStatus: register.status,
    registerError: register.body?.error,
    dbHealthStatus: dbHealth.status,
    stripeCheckoutReady: health.body?.stripe?.checkoutReady === true,
    uptimeSec: health.body?.uptime,
    render: health.body?.render === true,
  };
}

function auditCursorStability() {
  const cursorignore = path.join(hubRoot, ".cursorignore");
  const workspace = path.join(hubRoot, "BossMind.code-workspace");
  const activeWorkspace = path.join(hubRoot, "BossMind-active.code-workspace");
  const checks = {
    cursorignoreExists: fs.existsSync(cursorignore),
    workspaceExists: fs.existsSync(workspace),
    activeWorkspaceExists: fs.existsSync(activeWorkspace),
    archivesExcludedInCursorignore: false,
    gitAutofetchDisabled: false,
    watcherExcludesPresent: false,
  };
  if (checks.cursorignoreExists) {
    const txt = fs.readFileSync(cursorignore, "utf8");
    checks.archivesExcludedInCursorignore = /09-archives/.test(txt) && /node_modules/.test(txt);
  }
  if (checks.workspaceExists) {
    try {
      const ws = JSON.parse(fs.readFileSync(workspace, "utf8"));
      checks.gitAutofetchDisabled = ws.settings?.["git.autofetch"] === false;
      checks.watcherExcludesPresent = Boolean(ws.settings?.["files.watcherExclude"]);
    } catch {
      checks.workspaceParseError = true;
    }
  }
  const score =
    (checks.cursorignoreExists ? 20 : 0) +
    (checks.archivesExcludedInCursorignore ? 20 : 0) +
    (checks.gitAutofetchDisabled ? 15 : 0) +
    (checks.watcherExcludesPresent ? 15 : 0) +
    (checks.activeWorkspaceExists ? 10 : 0) +
    20;
  return { score: Math.min(100, score), checks };
}

function auditLocalEnv(merged) {
  const required = JSON.parse(
    fs.readFileSync(path.join(root, "config/render-production-required-env.json"), "utf8")
  ).required;
  const keys = [...new Set([...required, "DATABASE_URL", "RENDER_API_KEY", "RENDER_SERVICE_ID"])];
  const checklist = keys.map((key) => ({
    key,
    present: Boolean(String(merged[key] || "").trim()),
  }));
  const missing = checklist.filter((c) => !c.present).map((c) => c.key);
  const score = Math.round((checklist.filter((c) => c.present).length / checklist.length) * 100);
  return { score, checklist, missing, renderApiReady: Boolean(merged.RENDER_API_KEY && merged.RENDER_SERVICE_ID) };
}

async function triggerRedeploy(merged) {
  const hook = merged.BOSSMIND_RENDER_DEPLOY_HOOK_URL || merged.RENDER_DEPLOY_HOOK_URL || "";
  const apiKey = merged.RENDER_API_KEY || "";
  const serviceId = merged.RENDER_SERVICE_ID || "";
  if (hook) {
    const res = await fetch(hook, { method: "POST", signal: AbortSignal.timeout(60000) });
    return { method: "hook", ok: res.ok, status: res.status };
  }
  if (apiKey && serviceId) {
    const res = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ clearCache: "clear" }),
      signal: AbortSignal.timeout(60000),
    });
    const body = await res.json().catch(() => ({}));
    return { method: "render_api", ok: res.ok, status: res.status, deployId: body.id };
  }
  return { skipped: true, reason: "no_render_hook_or_api_credentials" };
}

function computeDeploymentChecksum(head, liveProbe) {
  const payload = `${head}|${liveProbe.healthOk}|${liveProbe.databaseOk}|${liveProbe.registerOk}`;
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

async function persistHubMemory(report) {
  fs.mkdirSync(hubMemoryDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = path.join(hubMemoryDir, `resumora-ultra-stabilization-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  try {
    const hub = require(path.join(root, "lib/shared/bossmind-hub-memory.js"));
    const neon = require(path.join(root, "lib/shared/neon-memory.js"));
    await neon.initializeSharedMemory();
    if (neon.getSqlClient()) {
      await hub.upsertBossmindMemory({
        projectKey: "resumora",
        memoryKey: "ultra_stabilization_latest",
        memoryType: "ULTRA_STABILIZATION",
        payload: {
          fullyOperational: report.fullyOperational,
          scores: report.scores,
          live: report.live,
          deploymentChecksum: report.deploymentChecksum,
          generatedAt: report.generatedAt,
        },
        writerAgent: "ultra_stabilization",
      }).catch(() => {});
      if (hasFlag("lock") && report.fullyOperational) {
        await neon.upsertLastConfirmedCheckpoint({
          projectKey: "resumora",
          checkpointKey: "ultra_stabilization_operational",
          payload: {
            fullyOperational: true,
            deploymentChecksum: report.deploymentChecksum,
            commit: report.commit,
          },
          source: "bossmind-ultra-stabilization",
          locked: true,
        }).catch(() => {});
      }
    }
  } catch {
    /* optional neon */
  }
  return outPath;
}

async function main() {
  if (hasFlag("lock") && !hasFlag("i-understand-production")) {
    console.error("Refusing --lock without --i-understand-production");
    process.exit(1);
  }

  const liveOrigin = (arg("live-origin") || process.env.BOSSMIND_REALITY_LIVE_URL || "https://www.resumora.net").replace(
    /\/$/,
    ""
  );
  const merged = mergeHubEnv();
  const commit = getGitHead(root);
  const hubCommit = getGitHead(hubRoot);

  const phases = {};

  phases.cursorStability = auditCursorStability();
  phases.hubEnvBootstrap = runNpm("bossmind:hub-env-bootstrap");
  phases.hostingGuard = runNpm("validate:hosting");
  phases.renderEnvChecklist = runNode("bossmind-render-env-checklist.mjs");
  phases.localEnv = auditLocalEnv(mergeHubEnv());

  let reconcileScore = null;
  const rec = runNpm("bossmind:reconcile");
  try {
    const j = JSON.parse(rec.stdout.match(/\{[\s\S]*\}/)?.[0] || "{}");
    reconcileScore = j.score ?? null;
  } catch {
    reconcileScore = rec.ok ? 85 : 40;
  }
  phases.reconciliation = { ok: rec.ok, score: reconcileScore };

  phases.runtimeSync = runNpm("bossmind:runtime:sync:once");

  if (hasFlag("redeploy")) {
    phases.redeploy = await triggerRedeploy(merged);
    if (phases.redeploy.ok) {
      await new Promise((r) => setTimeout(r, 45000));
    }
  }

  const live = await probeLive(liveOrigin);
  phases.live = live;

  const scores = {
    cursorRuntimeStability: phases.cursorStability.score,
    autonomousEnvSynchronization: phases.localEnv.score,
    renderDeploymentSelfRepair: phases.localEnv.renderApiReady ? 85 : live.databaseOk ? 75 : 40,
    productionRuntimeReconciliation: reconcileScore ?? 70,
    closedLoopAutonomousHealing: live.databaseOk && live.registerOk ? 90 : 45,
  };

  const blockers = [];
  if (!live.databaseOk) blockers.push("live_database_not_ok");
  if (!live.registerOk) blockers.push("live_registration_failed");
  if (phases.localEnv.missing.includes("NEON_DATABASE_URL") && !live.databaseOk) {
    blockers.push("local_neon_database_url_missing");
  }

  const fullyOperational = live.healthOk && live.databaseOk && live.registerOk && blockers.length === 0;
  const deployChecksum = computeDeploymentChecksum(commit, live);

  const report = {
    version: 2,
    generatedAt: new Date().toISOString(),
    runtimeRoot: hubRoot,
    canonicalRepo: "bossmind-resumora",
    commit,
    hubCommit,
    productionUrl: liveOrigin,
    fullyOperational,
    blockers,
    deploymentChecksum: deployChecksum,
    scores,
    phases: {
      cursorStability: phases.cursorStability,
      hubEnvBootstrapOk: phases.hubEnvBootstrap.ok,
      hostingGuardOk: phases.hostingGuard.ok,
      renderEnvChecklistOk: phases.renderEnvChecklist.ok,
      localEnvMissing: phases.localEnv.missing,
      reconciliation: phases.reconciliation,
      runtimeSyncOk: phases.runtimeSync.ok,
      redeploy: phases.redeploy || { skipped: true },
    },
    live,
    stripeNote: live.stripeCheckoutReady
      ? null
      : "Checkout needs NEXT_PUBLIC_STRIPE_PRICE_* on Render; registration is independent",
    healingLoop: "detect → diagnose → repair → verify → memory",
  };

  fs.mkdirSync(outDir, { recursive: true });
  const localReport = path.join(outDir, `ultra-${Date.now()}.json`);
  fs.writeFileSync(localReport, JSON.stringify(report, null, 2), "utf8");
  report.localReportPath = localReport;

  const hubPath = await persistHubMemory(report);
  report.hubMemoryPath = hubPath;

  console.log(JSON.stringify(report, null, 2));
  process.exit(fullyOperational ? 0 : 2);
}

main().catch((e) => {
  console.error("[bossmind-ultra-stabilization]", e);
  process.exit(1);
});
