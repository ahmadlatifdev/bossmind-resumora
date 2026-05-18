#!/usr/bin/env node
/**
 * Production-grade live validation across all BossMind projects.
 * Probes live DB health, auth, password reset providers, Stripe; persists proof to Neon.
 *
 *   npm run bossmind:production:live-audit
 *   node scripts/bossmind-production-live-audit.mjs --apply-safe --lock --i-understand-production --notes="..."
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

async function fetchJson(url, init = {}) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(35000) });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, body };
  } catch (e) {
    return { status: 0, ok: false, body: { error: e.message } };
  }
}

function loadTargets() {
  const p = path.join(root, "config/bossmind-production-live-targets.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function resolveOrigins(projectId, targets) {
  const origins = new Set();
  for (const u of targets.defaultOrigins?.[projectId] || []) origins.add(u.replace(/\/$/, ""));
  for (const key of targets.envUrlKeys?.[projectId] || []) {
    const v = process.env[key];
    if (v) origins.add(v.replace(/\/$/, ""));
  }
  return [...origins];
}

const PROJECTS = [
  { id: "resumora", displayName: "Resumora" },
  { id: "elegancyart", displayName: "ElegancyArt" },
  { id: "ai-video-generator", displayName: "AI Video Generator" },
  { id: "tiktok-ai", displayName: "TikTok AI" },
  { id: "global-stock", displayName: "Global Stock" },
  { id: "bossmind-master-admin", displayName: "BossMind Master Admin" },
];

async function probeOrigin(origin, targets) {
  const health = await fetchJson(`${origin}${targets.probePaths.health}`);
  const dbHealth = await fetchJson(`${origin}${targets.probePaths.databaseHealth}`);
  const resetHealth = await fetchJson(`${origin}${targets.probePaths.passwordResetHealth}`);
  const register = await fetchJson(`${origin}${targets.probePaths.registerProbe}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `audit-${Date.now()}@resumora.invalid`,
      password: "AuditLive123!",
      displayName: "Audit",
    }),
  });

  const dbOk = health.body?.database?.ok === true || dbHealth.body?.database?.ok === true;
  const dbConfigured = health.body?.database?.configured !== false;
  const registerBlocked = register.body?.error === "Database unavailable";
  const testDbUrl =
    health.body?.database?.source &&
    targets.testDatabaseMarkers?.some((m) =>
      String(health.body.database.source || "").toLowerCase().includes(m)
    );

  let status = "HEALTHY";
  if (!dbConfigured || registerBlocked) status = "DISCONNECTED";
  else if (!dbOk) status = "BROKEN";
  else if (health.status >= 500) status = "DEGRADED";

  return {
    origin,
    status,
    database: {
      ok: dbOk,
      configured: dbConfigured,
      reason: health.body?.database?.reason || dbHealth.body?.database?.reason,
      source: health.body?.database?.source,
      orm: dbHealth.body?.orm || "neon-serverless",
      prismaAppRuntime: dbHealth.body?.prismaAppRuntime === true,
      testLike: testDbUrl,
    },
    register: { status: register.status, error: register.body?.error, reason: register.body?.reason },
    passwordReset: resetHealth.body?.passwordReset || null,
    healthStatus: health.status,
    stripe: health.body?.stripe || null,
    recoveryHint: dbHealth.body?.recoveryHint || health.body?.recoveryHint,
  };
}

async function runLocalResumoraChecks() {
  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const neon = require(path.join(root, "lib/shared/neon-memory.js"));
  const store = require(path.join(root, "lib/engagement/store.js"));
  const pr = require(path.join(root, "lib/engagement/password-reset.js"));
  const { auditProviders } = require(path.join(root, "lib/shared/verification-delivery.js"));
  const { auditStripeEnv } = require(path.join(root, "lib/marketing/stripe-env-audit.js"));

  process.env.BOSSMIND_PASSWORD_RESET_DEV_LOG = process.env.BOSSMIND_PASSWORD_RESET_DEV_LOG || "1";

  const db = await neon.probeDatabaseConnection();
  await neon.ensureEngagementSchema();

  const email = `live-audit-${Date.now()}@resumora.invalid`;
  const password = "AuditLocal123!";
  let register = { ok: false };
  let login = { ok: false };
  let resetFlow = { ok: false };

  if (db.ok) {
    register = await store.registerProfile({ email, password, displayName: "Audit" });
    if (register.ok) {
      login = await store.loginProfile(email, password);
      const req = await pr.requestPasswordReset({ email, channel: "email", lang: "en" });
      const code = "123456";
      if (req.ok) {
        const sql = neon.getSqlClient();
        const profiles = await sql(`SELECT id FROM engagement_profiles WHERE email = $1`, [email]);
        const crypto = await import("node:crypto");
        const codeHash = crypto.createHash("sha256").update(code).digest("hex");
        await sql(
          `UPDATE engagement_password_resets SET code_hash = $1 WHERE profile_id = $2 AND consumed_at IS NULL`,
          [codeHash, profiles[0].id]
        );
        const complete = await pr.completePasswordReset({ email, code, newPassword: "AuditLocal456!" });
        const relogin = await store.loginProfile(email, "AuditLocal456!");
        resetFlow = { ok: complete.ok && relogin.ok, sessionRestored: Boolean(complete.session) };
      } else {
        resetFlow = { ok: false, step: "request", error: req.error };
      }
    }
  }

  return {
    database: db,
    providers: auditProviders(),
    stripe: auditStripeEnv(),
    register: register.ok,
    login: login.ok,
    passwordResetE2e: resetFlow,
  };
}

async function persistNeon(report) {
  const neon = require(path.join(root, "lib/shared/neon-memory.js"));
  if (!neon.getSqlClient()) return { skipped: "no_database" };

  const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
  const hub = require(path.join(root, "lib/shared/bossmind-hub-memory.js"));

  for (const p of report.projects) {
    try {
      await neon.upsertTaskState({
        projectKey: p.id,
        taskKey: "production_live_database_audit",
        status: p.databaseStatus === "HEALTHY" ? "completed" : "blocked",
        assignedAgent: "production_live_audit",
        payload: p,
      });
    } catch {
      await hub.upsertBossmindMemory({
        projectKey: p.id,
        memoryKey: "production_live_database_audit",
        memoryType: "PRODUCTION_LIVE_AUDIT",
        payload: { databaseStatus: p.databaseStatus, liveProbes: p.liveProbes },
        writerAgent: "production_live_audit",
      }).catch(() => {});
    }
    if (p.databaseStatus !== "HEALTHY") {
      try {
        await neon.saveMissingUpdate({
          projectKey: p.id,
          taskKey: "production_live_database_audit",
          reason: p.databaseStatus,
          payload: p.liveProbes?.[0] || {},
        });
      } catch {
        /* legacy DDL */
      }
    }
  }

  await hub.upsertBossmindMemory({
    projectKey: "_global",
    memoryKey: "production_live_validation",
    memoryType: "PRODUCTION_LIVE_AUDIT",
    payload: report,
    writerAgent: "production_live_audit",
  }).catch(() => {});

  try {
    await neon.saveEvent({
      projectKey,
      eventType: "production_live_audit",
      severity: report.fullyOperational ? "info" : "error",
      source: "bossmind-production-live-audit",
      payload: {
        fullyOperational: report.fullyOperational,
        projects: report.projects.map((x) => ({ id: x.id, databaseStatus: x.databaseStatus })),
      },
    });
  } catch {
    /* legacy Neon DDL may omit project_key on event_log */
  }

  if (!report.fullyOperational) {
    try {
      await neon.upsertErrorMemory({
        projectKey,
        errorType: "production_database_disconnected",
        errorMessage: report.blockers.join("; ") || "live_database_offline",
        rootCause: report.rootCause,
        fixPattern: "Set NEON_DATABASE_URL on Render and redeploy",
      });
    } catch {
      /* non-fatal */
    }
  }

  if (hasFlag("lock")) {
    try {
      await neon.upsertLastConfirmedCheckpoint({
        projectKey,
        checkpointKey: "production_live_validation",
        payload: {
          fullyOperational: report.fullyOperational,
          notes: arg("notes", "").slice(0, 2000),
          generatedAt: report.generatedAt,
          blockers: report.blockers,
        },
        source: "bossmind-production-live-audit",
        locked: report.fullyOperational,
      });
    } catch (e) {
      return { ok: false, checkpointError: e.message };
    }
  }

  return { ok: true, hubMemory: true };
}

async function main() {
  if (hasFlag("lock") && !hasFlag("i-understand-production")) {
    console.error("Refusing lock without --i-understand-production");
    process.exit(1);
  }

  if (hasFlag("apply-safe")) {
    spawnSync(process.execPath, [path.join(root, "scripts/bossmind-sync-hub-database-env.mjs")], {
      cwd: root,
      stdio: "ignore",
    });
    spawnSync(process.execPath, [path.join(root, "scripts/bossmind-render-env-bundle.mjs")], {
      cwd: root,
      stdio: "ignore",
    });
    spawnSync(process.execPath, [path.join(root, "scripts/bossmind-activation-recovery.mjs"), "--apply-safe"], {
      cwd: root,
      stdio: "ignore",
    });
  }

  const targets = loadTargets();
  const local = await runLocalResumoraChecks();

  const projects = [];
  for (const proj of PROJECTS) {
    const origins = resolveOrigins(proj.id, targets);
    const liveProbes = [];
    for (const origin of origins) {
      liveProbes.push(await probeOrigin(origin, targets));
    }
    let databaseStatus = "UNKNOWN";
    if (!origins.length) databaseStatus = "NO_LIVE_URL";
    else if (liveProbes.some((p) => p.status === "HEALTHY")) databaseStatus = "HEALTHY";
    else if (liveProbes.some((p) => p.status === "DISCONNECTED")) databaseStatus = "DISCONNECTED";
    else if (liveProbes.some((p) => p.status === "BROKEN")) databaseStatus = "BROKEN";
    else databaseStatus = "DEGRADED";

    projects.push({
      id: proj.id,
      displayName: proj.displayName,
      origins,
      databaseStatus,
      liveProbes,
    });
  }

  const blockers = [];
  const resumoraLive = projects.find((p) => p.id === "resumora")?.liveProbes?.[0];
  if (!local.database?.ok) blockers.push("local_database_offline");
  if (!local.register) blockers.push("local_register_failed");
  if (!local.passwordResetE2e?.ok) blockers.push("local_password_reset_failed");
  if (resumoraLive?.database?.ok !== true) blockers.push("resumora_live_database_offline");
  if (resumoraLive?.register?.error === "Database unavailable") {
    blockers.push("resumora_live_register_database_unavailable");
  }

  const fullyOperational =
    blockers.length === 0 &&
    local.passwordResetE2e?.ok &&
    projects.filter((p) => p.origins.length).every((p) => p.databaseStatus === "HEALTHY");

  const report = {
    ok: local.database?.ok,
    fullyOperational,
    generatedAt: new Date().toISOString(),
    rootCause:
      resumoraLive?.database?.reason === "no_database_url"
        ? "RENDER_ENV_MISSING_NEON_DATABASE_URL"
        : blockers[0] || null,
    authority: "Neon Postgres (@neondatabase/serverless); Prisma not used at app runtime",
    local,
    projects,
    blockers,
    remediation: [
      "Paste .bossmind/render-production-env.env into Render → Environment (NEON_DATABASE_URL, DATABASE_URL, Stripe)",
      "Configure RESEND_API_KEY or SMTP + TWILIO_* for production password reset delivery",
      "Redeploy Resumora; verify GET /api/health database.ok:true",
      "Set BOSSMIND_LIVE_URL_* env vars for sibling projects when URLs are known",
    ],
  };

  const reportsDir = path.join(root, "windows-heal/reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportsDir, `production-live-audit-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  fs.writeFileSync(
    path.join(root, "config/bossmind-production-live-audit-lock.json"),
    JSON.stringify(
      {
        version: 1,
        generatedAt: report.generatedAt,
        fullyOperational,
        blockers,
        projects: projects.map((p) => ({ id: p.id, databaseStatus: p.databaseStatus })),
      },
      null,
      2
    )
  );

  try {
    report.neonPersist = await persistNeon(report);
  } catch (e) {
    report.neonPersist = { error: e.message };
  }

  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  process.exit(fullyOperational ? 0 : local.database?.ok ? 2 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
