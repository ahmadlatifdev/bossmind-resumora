#!/usr/bin/env node
/**
 * Hands-free production recovery: env sync → Render API (when creds exist) → deploy → live poll → Neon lock.
 *
 *   npm run bossmind:production:hands-free
 *   node scripts/bossmind-production-hands-free-recover.mjs --lock --i-understand-production
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function hasFlag(n) {
  return process.argv.includes(`--${n}`);
}
function arg(name, def = "") {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : def;
}

function run(script, args = []) {
  return spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

async function fetchJson(url, init = {}) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(35000) });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, body };
  } catch (e) {
    return { status: 0, ok: false, body: { error: e.message } };
  }
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function mergeAllEnv() {
  const sources = [
    "D:/BossMind/bossmind-resumora/.env",
    "D:/BossMind/bossmind-shared/.env",
    path.join(root, ".env.local"),
    path.join(root, ".env"),
  ];
  let merged = { ...process.env };
  for (const f of sources) {
    merged = { ...parseEnvFile(f), ...merged };
  }
  return merged;
}

async function triggerRenderDeploy(apiKey, serviceId) {
  const res = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ clearCache: "clear" }),
    signal: AbortSignal.timeout(60000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, deployId: body.id };
}

async function triggerDeployHook(url) {
  const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(60000) });
  return { ok: res.ok, status: res.status };
}

async function probeLive(origin) {
  const o = origin.replace(/\/$/, "");
  const health = await fetchJson(`${o}/api/health`);
  const dbHealth = await fetchJson(`${o}/api/runtime/database-health`);
  const resetHealth = await fetchJson(`${o}/api/engagement/password-reset/health`);
  const register = await fetchJson(`${o}/api/engagement/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `handsfree-${Date.now()}@resumora.invalid`,
      password: "HandsFree123!",
      displayName: "HandsFree",
    }),
  });
  const dbOk = health.body?.database?.ok === true;
  return {
    origin: o,
    databaseOk: dbOk,
    healthStatus: health.status,
    databaseReason: health.body?.database?.reason,
    registerStatus: register.status,
    registerError: register.body?.error,
    resetHealthStatus: resetHealth.status,
    dbHealthStatus: dbHealth.status,
  };
}

async function pollLiveUntilHealthy(origin, maxAttempts = 12, intervalMs = 30000) {
  const attempts = [];
  for (let i = 0; i < maxAttempts; i++) {
    const p = await probeLive(origin);
    attempts.push({ ...p, attempt: i + 1, at: new Date().toISOString() });
    if (p.databaseOk && (p.registerStatus === 200 || p.registerStatus === 201)) return { ok: true, attempts, final: p };
    if (i < maxAttempts - 1) await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, attempts, final: attempts[attempts.length - 1] };
}

async function runLocalVerification() {
  process.env.BOSSMIND_PASSWORD_RESET_DEV_LOG = "1";
  require(path.join(root, "lib/shared/ensure-project-env.js"));
  const neon = require(path.join(root, "lib/shared/neon-memory.js"));
  const store = require(path.join(root, "lib/engagement/store.js"));
  const pr = require(path.join(root, "lib/engagement/password-reset.js"));
  const ent = require(path.join(root, "lib/client/entitlements-store.js"));
  const { auditPlansRuntime } = require(path.join(root, "lib/shared/plans-runtime-sync.js"));

  const db = await neon.probeDatabaseConnection();
  await neon.ensureEngagementSchema();
  const plans = auditPlansRuntime();

  const email = `handsfree-local-${Date.now()}@resumora.invalid`;
  const password = "HandsFree123!";
  const reg = await store.registerProfile({ email, password, displayName: "HF" });
  const login = reg.ok ? await store.loginProfile(email, password) : { ok: false };
  let reset = { ok: false };
  if (reg.ok) {
    const req = await pr.requestPasswordReset({ email, channel: "email", lang: "en" });
    if (req.ok) {
      const sql = neon.getSqlClient();
      const crypto = await import("node:crypto");
      const code = "654321";
      const codeHash = crypto.createHash("sha256").update(code).digest("hex");
      const profiles = await sql(`SELECT id FROM engagement_profiles WHERE email = $1`, [email]);
      await sql(
        `UPDATE engagement_password_resets SET code_hash = $1 WHERE profile_id = $2 AND consumed_at IS NULL`,
        [codeHash, profiles[0].id]
      );
      const done = await pr.completePasswordReset({ email, code, newPassword: "HandsFree456!" });
      const relogin = await store.loginProfile(email, "HandsFree456!");
      reset = { ok: done.ok && relogin.ok, sessionRestored: Boolean(done.session) };
    }
  }

  const planGrants = [];
  if (reg.ok) {
    for (const planId of ["basic", "professional", "elite", "essential_advanced"]) {
      const g = await ent.grantEntitlement({ planId, profileId: reg.profile.id, customerEmail: email });
      planGrants.push({ planId, ok: g.ok });
    }
  }

  return {
    database: db,
    plans: { ok: plans.ok },
    register: reg.ok,
    login: login.ok,
    passwordReset: reset,
    planGrants,
    orm: "neon-serverless",
    prismaUsed: false,
  };
}

async function persistCheckpoint(report) {
  const neon = require(path.join(root, "lib/shared/neon-memory.js"));
  const hub = require(path.join(root, "lib/shared/bossmind-hub-memory.js"));
  if (!neon.getSqlClient()) return { skipped: "no_database" };

  await hub.upsertBossmindMemory({
    projectKey: "resumora",
    memoryKey: "production_hands_free_recovery",
    memoryType: "PRODUCTION_HANDS_FREE_RECOVERY",
    payload: {
      fullyOperational: report.fullyOperational,
      live: report.live?.final,
      blockers: report.blockers,
      generatedAt: report.generatedAt,
    },
    writerAgent: "hands_free_recovery",
  }).catch(() => {});

  if (hasFlag("lock")) {
    try {
      await neon.upsertLastConfirmedCheckpoint({
        projectKey: "resumora",
        checkpointKey: "production_hands_free_operational",
        payload: {
          fullyOperational: report.fullyOperational,
          notes: arg("notes", "hands_free_recovery").slice(0, 2000),
          blockers: report.blockers,
        },
        source: "bossmind-production-hands-free-recover",
        locked: report.fullyOperational,
      });
      return { checkpoint: "production_hands_free_operational", locked: report.fullyOperational };
    } catch (e) {
      return { checkpointError: e.message };
    }
  }
  return { checkpointSkipped: true };
}

async function main() {
  if (hasFlag("lock") && !hasFlag("i-understand-production")) {
    console.error("Refusing lock without --i-understand-production");
    process.exit(1);
  }

  const merged = mergeAllEnv();
  const liveOrigin = (arg("live-origin") || merged.BOSSMIND_REALITY_LIVE_URL || "https://www.resumora.net").replace(
    /\/$/,
    ""
  );

  const steps = [];

  steps.push({ step: "sync_hub_database_env", ...run("bossmind-sync-hub-database-env.mjs") });
  steps.push({ step: "sync_hub_stripe_prices", ...run("bossmind-sync-hub-stripe-prices.mjs") });
  steps.push({ step: "render_env_bundle", ...run("bossmind-render-env-bundle.mjs") });

  const renderKey = merged.RENDER_API_KEY || "";
  const serviceId = merged.RENDER_SERVICE_ID || "";
  let renderSync = null;
  let renderDeploy = null;

  if (renderKey && serviceId) {
    renderSync = run("bossmind-render-production-env-sync.mjs", ["--apply"]);
    renderDeploy = await triggerRenderDeploy(renderKey, serviceId);
    steps.push({ step: "render_env_sync_apply", exitCode: renderSync.status });
    steps.push({ step: "render_deploy", ...renderDeploy });
  } else {
    steps.push({
      step: "render_api_skipped",
      reason: "RENDER_API_KEY or RENDER_SERVICE_ID not in hub/.env.local",
      bundlePath: path.join(root, ".bossmind/render-production-env.env"),
    });
  }

  const hook =
    merged.BOSSMIND_ULTRA_REDEPLOY_HOOK_URL || merged.BOSSMIND_RECONCILE_DEPLOY_HOOK_URL || "";
  if (hook) {
    const hookResult = await triggerDeployHook(hook);
    steps.push({ step: "deploy_hook", urlPresent: true, ...hookResult });
  }

  const local = await runLocalVerification();
  const liveBefore = await probeLive(liveOrigin);

  let livePoll = null;
  if (renderKey && serviceId && (renderSync?.status === 0 || renderDeploy?.ok)) {
    livePoll = await pollLiveUntilHealthy(liveOrigin, 8, 25000);
  }

  const liveAfter = livePoll?.ok ? livePoll.final : await probeLive(liveOrigin);

  const blockers = [];
  if (!local.database?.ok) blockers.push("local_database_failed");
  if (!local.register) blockers.push("local_register_failed");
  if (!local.passwordReset?.ok) blockers.push("local_password_reset_failed");
  if (!local.plans?.ok) blockers.push("local_plans_failed");
  if (!liveAfter.databaseOk) blockers.push("live_database_offline");
  if (liveAfter.registerError === "Database unavailable") blockers.push("live_register_database_unavailable");

  const fullyOperational = blockers.length === 0;

  const report = {
    ok: local.database?.ok,
    fullyOperational,
    generatedAt: new Date().toISOString(),
    liveOrigin,
    renderApiConfigured: Boolean(renderKey && serviceId),
    local,
    live: { before: liveBefore, after: liveAfter, poll: livePoll },
    steps,
    blockers,
    remediation: fullyOperational
      ? []
      : [
          "Paste .bossmind/render-production-env.env into Render → Environment",
          "Set RENDER_API_KEY + RENDER_SERVICE_ID in D:/BossMind/bossmind-resumora/.env for automated sync",
          "Clear build cache + deploy latest main on Render",
          `Verify ${liveOrigin}/api/health → database.ok:true`,
        ],
  };

  const reportsDir = path.join(root, "windows-heal/reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportsDir, `production-hands-free-recover-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  fs.writeFileSync(
    path.join(root, "config/bossmind-production-hands-free-lock.json"),
    JSON.stringify(
      {
        version: 1,
        generatedAt: report.generatedAt,
        fullyOperational,
        blockers,
        renderApiConfigured: report.renderApiConfigured,
        liveDatabaseOk: liveAfter.databaseOk,
      },
      null,
      2
    )
  );

  report.neonPersist = await persistCheckpoint(report);
  report.reportPath = reportPath;

  console.log(JSON.stringify(report, null, 2));
  process.exit(fullyOperational ? 0 : local.database?.ok ? 2 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
