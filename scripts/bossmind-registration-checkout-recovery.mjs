#!/usr/bin/env node
/**
 * Registration + Stripe checkout recovery (BossMind workflow).
 * Probes local DB, live /api/health, register, payment-links; writes report + optional Neon lock.
 *
 *   node scripts/bossmind-registration-checkout-recovery.mjs
 *   node scripts/bossmind-registration-checkout-recovery.mjs --lock --notes="post-render-env"
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const LIVE_ORIGIN = (
  process.env.BOSSMIND_REALITY_LIVE_URL ||
  process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN ||
  "https://www.resumora.net"
).replace(/\/$/, "");

const PLAN_IDS = ["basic", "essential_advanced", "professional", "elite"];

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(25000) });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, ok: res.ok, body };
}

async function probeLiveRegister() {
  const email = `recovery-probe-${Date.now()}@resumora-recovery.invalid`;
  return fetchJson(`${LIVE_ORIGIN}/api/engagement/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "RecoveryProbe123!", displayName: "Recovery Probe" }),
  });
}

async function main() {
  try {
    const { spawnSync } = await import("node:child_process");
    spawnSync(process.execPath, [path.join(root, "scripts/bossmind-sync-hub-database-env.mjs")], {
      cwd: root,
      stdio: "ignore",
    });
  } catch {
    /* optional — hub path may be absent on CI */
  }
  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const neon = require(path.join(root, "lib/shared/neon-memory.js"));
  const { auditStripeEnv } = require(path.join(root, "lib/marketing/stripe-env-audit.js"));
  const { resolveDatabaseUrl } = require(path.join(root, "lib/shared/database-url.js"));

  const localDb = await neon.probeDatabaseConnection();
  let localRegister = { skipped: true };
  if (localDb.ok) {
    try {
      const { registerProfile } = require(path.join(root, "lib/engagement/store.js"));
      await neon.ensureEngagementSchema();
      const email = `local-recovery-${Date.now()}@resumora-recovery.invalid`;
      const r = await registerProfile({
        email,
        password: "RecoveryLocal123!",
        displayName: "Recovery Local",
      });
      localRegister = { ok: r.ok, error: r.error || null };
    } catch (e) {
      localRegister = { ok: false, error: e.message };
    }
  }
  const localStripe = auditStripeEnv();
  const dbResolve = resolveDatabaseUrl();

  const liveHealth = await fetchJson(`${LIVE_ORIGIN}/api/health`);
  const liveRegister = await probeLiveRegister();
  const livePaymentLinks = await fetchJson(`${LIVE_ORIGIN}/api/stripe/payment-links`);

  const planRoutes = livePaymentLinks.body?.planRoutes || {};
  const paymentLinkAudit = PLAN_IDS.map((planId) => {
    const url = planRoutes[planId]?.paymentLinkUrl || "";
    return {
      planId,
      configured: Boolean(url),
      mode: url.includes("/test_") ? "test" : url.includes("buy.stripe.com/") ? "live" : url ? "unknown" : "missing",
    };
  });

  const blockers = [];
  if (!dbResolve.url) {
    blockers.push(
      "NEON_DATABASE_URL (or DATABASE_URL) missing locally — run npm run bossmind:sync:hub-database-env or add Neon URL to .env.local"
    );
  } else if (!localDb.ok) {
    blockers.push(`Local database probe failed: ${localDb.reason || "unknown"}`);
  }
  if (!liveHealth.body?.database?.ok) {
    blockers.push(
      "Production database offline — set NEON_DATABASE_URL on Render (Web Service → Environment) to the same Neon branch URL, then redeploy"
    );
  }
  if (liveRegister.body?.error === "Database unavailable") {
    blockers.push("Live registration returns Database unavailable — Render env not wired to Neon");
  }
  if (paymentLinkAudit.some((p) => p.mode === "test")) {
    blockers.push(
      "Payment links on production are Stripe TEST URLs — run bossmind:stripe:payment-links:apply with sk_live_* then redeploy lock manifest"
    );
  }
  if (!localStripe.checkoutReady) {
    blockers.push("Local Stripe checkout env incomplete (keys or price IDs)");
  }

  const report = {
    ok: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    liveOrigin: LIVE_ORIGIN,
    local: {
      database: localDb,
      databaseSource: dbResolve.source,
      register: localRegister,
      stripe: {
        checkoutReady: localStripe.checkoutReady,
        mode: localStripe.sandboxLiveConsistent?.mode || null,
      },
    },
    live: {
      health: { status: liveHealth.status, body: liveHealth.body },
      register: { status: liveRegister.status, body: liveRegister.body },
      paymentLinks: {
        status: livePaymentLinks.status,
        ok: livePaymentLinks.body?.ok,
        planRoutes: paymentLinkAudit,
      },
    },
    blockers,
    renderRemediation: [
      "Render Dashboard → resumora Web Service → Environment",
      "Add NEON_DATABASE_URL = (Neon console → Connection string → pooled)",
      "Optional duplicate: DATABASE_URL = same value",
      "Ensure STRIPE_SECRET_KEY + NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY are live pair for production",
      "Manual Deploy → Clear build cache & deploy",
      "Verify: GET /api/health shows database.ok true",
      "Verify: POST /api/engagement/register returns 201",
    ],
  };

  const reportsDir = path.join(root, "windows-heal", "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportsDir, `registration-checkout-recovery-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const lockPath = path.join(root, "config", "bossmind-registration-checkout-recovery-lock.json");
  fs.writeFileSync(
    lockPath,
    JSON.stringify(
      {
        version: 1,
        generatedAt: report.generatedAt,
        ok: report.ok,
        blockers: report.blockers,
        liveOrigin: LIVE_ORIGIN,
        paymentLinkAudit,
      },
      null,
      2
    )
  );

  console.log(JSON.stringify({ ...report, reportPath, lockPath }, null, 2));

  if (hasFlag("lock") && neon.getSqlClient()) {
    const notes = process.argv.includes("--notes")
      ? process.argv[process.argv.indexOf("--notes") + 1]
      : "registration_checkout_recovery";
    const lockPayload = { reportPath, blockers: report.blockers, ok: report.ok, notes };
    try {
      await neon.upsertLastConfirmedCheckpoint({
        projectKey: process.env.BOSSMIND_PROJECT_KEY || "resumora",
        checkpointKey: "registration_checkout_recovery",
        payload: lockPayload,
        source: "bossmind-registration-checkout-recovery",
        locked: true,
      });
      console.log("Neon checkpoint registration_checkout_recovery written.");
    } catch (e) {
      console.warn("Neon checkpoint skipped (legacy schema):", e.message);
    }
    try {
      await neon.saveEvent({
        projectKey: process.env.BOSSMIND_PROJECT_KEY || "resumora",
        eventType: "registration_checkout.recovery",
        severity: report.ok ? "info" : "warn",
        source: "bossmind-registration-checkout-recovery",
        payload: lockPayload,
      });
    } catch {
      /* event_log may lack project_key on legacy Neon branch */
    }
  }

  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
