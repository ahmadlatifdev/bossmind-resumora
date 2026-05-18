#!/usr/bin/env node
/**
 * Full production recovery: DB sync, plan audit, live probes, Render bundle, Neon lock.
 *
 *   node scripts/bossmind-production-full-recover.mjs
 *   node scripts/bossmind-production-full-recover.mjs --lock --i-understand-production --notes="..."
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
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

function run(script) {
  return spawnSync(process.execPath, [path.join(root, "scripts", script)], {
    cwd: root,
    encoding: "utf8",
  });
}

async function main() {
  if (hasFlag("lock") && !hasFlag("i-understand-production")) {
    console.error("Refusing lock without --i-understand-production");
    process.exit(1);
  }

  run("bossmind-sync-hub-database-env.mjs");
  run("bossmind-sync-hub-stripe-prices.mjs");
  const bundle = run("bossmind-render-env-bundle.mjs");

  require(path.join(root, "lib/shared/ensure-project-env.js"));
  const { probeDatabaseConnection, ensureEngagementSchema } = require(path.join(
    root,
    "lib/shared/neon-memory.js"
  ));
  const { auditPlansRuntime } = require(path.join(root, "lib/shared/plans-runtime-sync.js"));
  const { auditStripeEnv } = require(path.join(root, "lib/marketing/stripe-env-audit.js"));
  const store = require(path.join(root, "lib/engagement/store.js"));

  const db = await probeDatabaseConnection();
  await ensureEngagementSchema();
  const plans = auditPlansRuntime();
  const { auditFreeEditsPolicy } = require(path.join(root, "lib/client/plan-policy.js"));
  const { getInterviewPrepCatalog } = require(path.join(
    root,
    "lib/essential-advanced/interview-prep-content.js"
  ));
  const freeEdits = auditFreeEditsPolicy();
  const interviewCounts = getInterviewPrepCatalog("en").counts;
  const stripe = auditStripeEnv();

  const email = `recover-${Date.now()}@resumora-recover.invalid`;
  const reg = await store.registerProfile({
    email,
    password: "RecoverTest123!",
    displayName: "Recover",
  });
  const login = reg.ok ? await store.loginProfile(email, "RecoverTest123!") : { ok: false };

  const liveOrigin = (arg("live-origin") || "https://www.resumora.net").replace(/\/$/, "");
  const liveHealth = await fetchJson(`${liveOrigin}/api/health`);
  const liveRegister = await fetchJson(`${liveOrigin}/api/engagement/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `live-${Date.now()}@resumora.invalid`,
      password: "LiveProbe123!",
      displayName: "Live",
    }),
  });
  const livePlans = await fetchJson(`${liveOrigin}/api/stripe/payment-links`);

  const localBlockers = [];
  const liveBlockers = [];
  if (!db.ok) localBlockers.push("local_database_failed");
  if (!plans.ok) localBlockers.push("plan_metadata_incomplete");
  if (!freeEdits.ok) localBlockers.push("free_edits_policy_invalid");
  if (interviewCounts.qa < 50 || interviewCounts.tips < 20) {
    localBlockers.push("interview_prep_content_incomplete");
  }
  if (!stripe.checkoutReady) localBlockers.push("stripe_env_incomplete");
  if (!reg.ok) localBlockers.push("local_register_failed");
  if (!login.ok) localBlockers.push("local_login_failed");

  if (!liveHealth.body?.database?.ok) liveBlockers.push("live_database_offline");
  if (liveRegister.body?.error === "Database unavailable") {
    liveBlockers.push("live_registration_database_unavailable");
  }
  if (!livePlans.body?.ok) liveBlockers.push("live_payment_links_unavailable");

  const report = {
    ok: localBlockers.length === 0,
    liveOk: liveBlockers.length === 0,
    fullyOperational: localBlockers.length === 0 && liveBlockers.length === 0,
    generatedAt: new Date().toISOString(),
    liveOrigin,
    local: {
      database: db,
      plans,
      freeEdits,
      interviewCounts,
      stripe: { checkoutReady: stripe.checkoutReady },
      register: reg.ok,
      login: login.ok,
    },
    live: {
      health: { status: liveHealth.status, database: liveHealth.body?.database },
      register: { status: liveRegister.status, error: liveRegister.body?.error },
      paymentLinks: { status: livePlans.status, ok: livePlans.body?.ok },
    },
    localBlockers,
    liveBlockers,
    renderBundle: bundle.status === 0,
    authority: "Neon Postgres (NEON_DATABASE_URL) — Supabase is not the Resumora DB authority in this repo",
    remediation: [
      "1. Open .bossmind/render-production-env.env (gitignored)",
      "2. Render Dashboard → web service → Environment → paste all keys",
      "3. Clear build cache + deploy latest main",
      "4. Re-run: node scripts/bossmind-production-full-recover.mjs --lock --i-understand-production",
    ],
  };

  const reportsDir = path.join(root, "windows-heal/reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportsDir, `production-full-recover-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  fs.writeFileSync(
    path.join(root, "config/bossmind-production-runtime-lock.json"),
    JSON.stringify(
      {
        version: 2,
        generatedAt: report.generatedAt,
        ok: report.fullyOperational,
        localOk: report.ok,
        liveOk: report.liveOk,
        localBlockers,
        liveBlockers,
        liveOrigin,
      },
      null,
      2
    )
  );

  if (hasFlag("lock")) {
    const neon = require(path.join(root, "lib/shared/neon-memory.js"));
    if (neon.getSqlClient()) {
      const payload = {
        lockedAt: report.generatedAt,
        memoryType: "RESUMORA_PRODUCTION_FULL_RECOVER",
        fullyOperational: report.fullyOperational,
        plans: plans.plans,
        localBlockers,
        liveBlockers,
        notes: arg("notes", "").slice(0, 2000),
      };
      try {
        await neon.upsertLastConfirmedCheckpoint({
          projectKey: process.env.BOSSMIND_PROJECT_KEY || "resumora",
          checkpointKey: "production_full_operational",
          payload,
          source: "bossmind-production-full-recover",
          locked: report.fullyOperational,
        });
        report.neonCheckpoint = "production_full_operational";
      } catch (e) {
        report.neonCheckpointSkipped = e.message;
      }
    }
  }

  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  process.exit(report.fullyOperational ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
