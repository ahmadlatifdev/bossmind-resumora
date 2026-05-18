#!/usr/bin/env node
/**
 * Production database recovery — local proof + live probe + Render bundle + Neon lock.
 *
 *   node scripts/bossmind-production-database-recover.mjs
 *   node scripts/bossmind-production-database-recover.mjs --lock --i-understand-production --notes="..."
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

async function fetchJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(35000) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

async function main() {
  if (hasFlag("lock") && !hasFlag("i-understand-production")) {
    console.error("Refusing lock without --i-understand-production");
    process.exit(1);
  }

  spawnSync(process.execPath, [path.join(root, "scripts/bossmind-sync-hub-database-env.mjs")], {
    cwd: root,
    stdio: "ignore",
  });
  spawnSync(process.execPath, [path.join(root, "scripts/bossmind-render-env-bundle.mjs")], {
    cwd: root,
    stdio: "ignore",
  });

  require(path.join(root, "lib/shared/ensure-project-env.js"));
  const { probeDatabaseConnection } = require(path.join(root, "lib/shared/neon-memory.js"));
  const { auditPlansRuntime } = require(path.join(root, "lib/shared/plans-runtime-sync.js"));
  const store = require(path.join(root, "lib/engagement/store.js"));
  const { grantEntitlement } = require(path.join(root, "lib/client/entitlements-store.js"));

  const db = await probeDatabaseConnection();
  const plans = auditPlansRuntime();

  const email = `db-recover-${Date.now()}@resumora-db.invalid`;
  const password = "DbRecover123!";
  let register = { ok: false };
  let login = { ok: false };
  let relogin = { ok: false };
  let entitlement = { ok: false };

  if (db.ok) {
    register = await store.registerProfile({ email, password, displayName: "DB Recover" });
    if (register.ok) {
      login = await store.loginProfile(email, password);
      relogin = await store.loginProfile(email, password);
      for (const planId of ["basic", "professional", "elite", "essential_advanced"]) {
        await grantEntitlement({ planId, profileId: register.profile.id, customerEmail: email });
      }
      entitlement = { ok: true };
    }
  }

  const liveOrigin = (arg("live-origin") || "https://www.resumora.net").replace(/\/$/, "");
  const liveHealth = await fetchJson(`${liveOrigin}/api/health`);
  const liveDbHealth = await fetchJson(`${liveOrigin}/api/runtime/database-health`);
  const liveRegister = await fetchJson(`${liveOrigin}/api/engagement/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `live-db-${Date.now()}@resumora.invalid`,
      password: "LiveDb123!",
      displayName: "Live",
    }),
  });
  const livePaymentLinks = await fetchJson(`${liveOrigin}/api/stripe/payment-links`);

  const localBlockers = [];
  const liveBlockers = [];
  if (!db.ok) localBlockers.push(`local_db:${db.reason}`);
  if (!register.ok) localBlockers.push("local_register_failed");
  if (!login.ok) localBlockers.push("local_login_failed");
  if (!entitlement.ok) localBlockers.push("local_entitlements_failed");
  if (!plans.ok) localBlockers.push("plans_sync_failed");

  if (!liveHealth.body?.database?.ok) liveBlockers.push("live_database_offline");
  if (liveRegister.body?.error === "Database unavailable") {
    liveBlockers.push("live_register_database_unavailable");
  }

  const fullyOperational = localBlockers.length === 0 && liveBlockers.length === 0;

  const report = {
    ok: localBlockers.length === 0,
    fullyOperational,
    generatedAt: new Date().toISOString(),
    rootCause:
      liveHealth.body?.database?.reason === "no_database_url"
        ? "RENDER_ENV_MISSING_NEON_DATABASE_URL"
        : liveRegister.body?.reason || null,
    authority: "Neon Postgres via @neondatabase/serverless (no Prisma app ORM)",
    local: { database: db, plans: { ok: plans.ok }, register: register.ok, login: login.ok, relogin: relogin.ok, entitlements: entitlement.ok },
    live: {
      origin: liveOrigin,
      health: { status: liveHealth.status, database: liveHealth.body?.database },
      databaseHealth: { status: liveDbHealth.status, body: liveDbHealth.body },
      register: { status: liveRegister.status, error: liveRegister.body?.error, reason: liveRegister.body?.reason },
      paymentLinks: { status: livePaymentLinks.status, ok: livePaymentLinks.body?.ok },
    },
    localBlockers,
    liveBlockers,
    remediation: [
      "Paste .bossmind/render-production-env.env into Render → Environment",
      "Set NEON_DATABASE_URL + DATABASE_URL (same Neon connection string)",
      "Redeploy with build cache cleared",
      "Verify GET /api/health returns database.ok:true",
    ],
  };

  const reportsDir = path.join(root, "windows-heal/reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportsDir, `production-database-recover-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  fs.writeFileSync(
    path.join(root, "config/bossmind-production-database-recovery-lock.json"),
    JSON.stringify(
      {
        version: 1,
        generatedAt: report.generatedAt,
        fullyOperational,
        rootCause: report.rootCause,
        localBlockers,
        liveBlockers,
      },
      null,
      2
    )
  );

  if (hasFlag("lock")) {
    const neon = require(path.join(root, "lib/shared/neon-memory.js"));
    if (neon.getSqlClient()) {
      try {
        await neon.upsertLastConfirmedCheckpoint({
          projectKey: process.env.BOSSMIND_PROJECT_KEY || "resumora",
          checkpointKey: "production_database_operational",
          payload: { reportPath, fullyOperational, rootCause: report.rootCause, notes: arg("notes", "").slice(0, 2000) },
          source: "bossmind-production-database-recover",
          locked: fullyOperational,
        });
        report.neonCheckpoint = "production_database_operational";
      } catch (e) {
        report.neonCheckpointSkipped = e.message;
      }
    }
  }

  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  process.exit(fullyOperational ? 0 : localBlockers.length === 0 ? 2 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
