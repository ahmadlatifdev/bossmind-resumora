#!/usr/bin/env node
/**
 * Full production runtime validation + BossMind checkpoint.
 *
 *   node scripts/bossmind-production-runtime-activate.mjs
 *   node scripts/bossmind-production-runtime-activate.mjs --live-origin=https://www.resumora.net
 *   node scripts/bossmind-production-runtime-activate.mjs --lock --notes="..."
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

async function main() {
  spawnSync(process.execPath, [path.join(root, "scripts/bossmind-sync-hub-database-env.mjs")], {
    cwd: root,
    stdio: "ignore",
  });
  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const { bootstrapProductionRuntime } = require(path.join(root, "lib/shared/production-runtime-bootstrap"));
  const { probeDatabaseConnection } = require(path.join(root, "lib/shared/neon-memory"));
  const { auditStripeEnv } = require(path.join(root, "lib/marketing/stripe-env-audit"));
  const { getInterviewPrepCatalog } = require(path.join(root, "lib/essential-advanced/interview-prep-content"));

  const runtime = bootstrapProductionRuntime();
  const db = await probeDatabaseConnection();
  const stripe = auditStripeEnv();
  const catalog = getInterviewPrepCatalog("en");

  const liveOrigin = (arg("live-origin") || process.env.BOSSMIND_REALITY_LIVE_URL || "https://www.resumora.net").replace(
    /\/$/,
    ""
  );

  const liveHealth = await fetchJson(`${liveOrigin}/api/health`);
  const testEmail = `runtime-${Date.now()}@resumora-runtime.invalid`;
  const liveRegister = await fetchJson(`${liveOrigin}/api/engagement/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: "RuntimeProbe123!", displayName: "Runtime" }),
  });
  const livePaymentLinks = await fetchJson(`${liveOrigin}/api/stripe/payment-links`);

  const blockers = [];
  if (!db.ok) blockers.push(`Local DB: ${db.reason || "failed"}`);
  if (!stripe.checkoutReady) blockers.push("Local Stripe checkout env incomplete");
  if (!liveHealth.body?.database?.ok) blockers.push("Live database offline (set NEON_DATABASE_URL on Render)");
  if (liveRegister.body?.error === "Database unavailable") blockers.push("Live registration blocked");
  if (!livePaymentLinks.body?.ok) blockers.push("Live payment links unavailable");
  const testLinks = livePaymentLinks.body?.planRoutes || {};
  for (const plan of ["basic", "professional", "elite", "essential_advanced"]) {
    if (testLinks[plan]?.paymentLinkUrl?.includes("/test_")) {
      blockers.push(`Live Stripe payment link for ${plan} is TEST mode`);
      break;
    }
  }

  const report = {
    ok: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    liveOrigin,
    local: { runtime, database: db, stripe: { checkoutReady: stripe.checkoutReady, mode: stripe.sandboxLiveConsistent?.mode } },
    catalogCounts: catalog.counts,
    live: {
      health: { status: liveHealth.status, body: liveHealth.body },
      register: { status: liveRegister.status, error: liveRegister.body?.error },
      paymentLinks: { status: livePaymentLinks.status, ok: livePaymentLinks.body?.ok },
    },
    blockers,
    renderRemediation: [
      "Render → Environment: NEON_DATABASE_URL, STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET",
      "Set all NEXT_PUBLIC_STRIPE_PRICE_* for basic/pro/elite/essential_advanced",
      "Optional: RESUMORA_POST_PURCHASE_WEBHOOK_URL for automated email (n8n)",
      "Deploy latest main + clear build cache",
    ],
  };

  const reportsDir = path.join(root, "windows-heal", "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportsDir, `production-runtime-activate-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  fs.writeFileSync(
    path.join(root, "config", "bossmind-production-runtime-lock.json"),
    JSON.stringify(
      {
        version: 1,
        generatedAt: report.generatedAt,
        ok: report.ok,
        blockers: report.blockers,
        liveOrigin,
      },
      null,
      2
    )
  );

  console.log(JSON.stringify({ ...report, reportPath }, null, 2));

  if (hasFlag("lock")) {
    const neon = require(path.join(root, "lib/shared/neon-memory.js"));
    await neon.ensureEngagementSchema().catch(() => {});
    if (neon.getSqlClient()) {
      const notes = arg("notes", "production_runtime_activate");
      try {
        await neon.upsertLastConfirmedCheckpoint({
          projectKey: process.env.BOSSMIND_PROJECT_KEY || "resumora",
          checkpointKey: "production_runtime_full",
          payload: { reportPath, blockers: report.blockers, ok: report.ok, notes },
          source: "bossmind-production-runtime-activate",
          locked: true,
        });
        console.log("Neon checkpoint production_runtime_full written.");
      } catch (e) {
        console.warn("Neon checkpoint skipped:", e.message);
      }
    }
  }

  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
