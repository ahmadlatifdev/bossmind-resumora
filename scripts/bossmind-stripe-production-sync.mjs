#!/usr/bin/env node
/**
 * Full Stripe production sync: repair env → bundle → optional Render apply → validate.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const hubRoot = process.env.BOSSMIND_HUB_ROOT || "D:/BossMind";
const hubMemory = path.join(hubRoot, "13-shared-memory");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8", shell: true });
  return { ok: r.status === 0, stdout: r.stdout || "", stderr: r.stderr || "" };
}

async function probeHealth(origin) {
  try {
    const res = await fetch(`${origin.replace(/\/$/, "")}/api/health`, {
      signal: AbortSignal.timeout(90000),
    });
    return { status: res.status, body: await res.json() };
  } catch (e) {
    return { status: 0, body: { error: e.message } };
  }
}

async function testCheckoutSession(origin) {
  try {
    const res = await fetch(`${origin.replace(/\/$/, "")}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: "basic" }),
      signal: AbortSignal.timeout(90000),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok && Boolean(body.url || body.sessionId), bodyKeys: Object.keys(body) };
  } catch (e) {
    return { status: 0, ok: false, error: e.message };
  }
}

async function main() {
  const origins = [
    "https://bossmind-resumora-web.onrender.com",
    "https://www.resumora.net",
  ];

  const phases = {
    repair: run("node", ["scripts/bossmind-stripe-env-repair.mjs"]),
    syncPrices: run("npm", ["run", "bossmind:sync:hub-stripe-prices"]),
    hubBootstrap: run("npm", ["run", "bossmind:hub-env-bootstrap"]),
    bundle: run("npm", ["run", "bossmind:render:env-bundle"]),
    renderApply: run("npm", ["run", "bossmind:render:env-sync", "--", "--apply"]),
    localStripe: run("npm", ["run", "validate:stripe"]),
  };

  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const { auditStripeProductionState } = require(path.join(root, "lib/marketing/stripe-env-audit.js"));
  const { auditPlansRuntime } = require(path.join(root, "lib/shared/plans-runtime-sync.js"));
  const { priceIdsFromLock } = require(path.join(root, "lib/marketing/stripe-price-lock.js"));

  const localAudit = auditStripeProductionState();
  const plans = auditPlansRuntime();
  const lockPrices = priceIdsFromLock();

  const live = {};
  for (const o of origins) {
    const h = await probeHealth(o);
    const checkout = await testCheckoutSession(o);
    live[o] = {
      health: {
        ok: h.body?.ok,
        checkoutReady: h.body?.stripe?.checkoutReady,
        financialPipelineReady: h.body?.stripe?.financialPipelineReady,
        allStripePrices: h.body?.plans?.allStripePrices,
        commerceReady: h.body?.commerceReady,
      },
      checkoutApi: checkout,
    };
  }

  const productionScore = Math.round(
    (localAudit.checkoutReady ? 40 : 0) +
      (localAudit.financialPipelineReady ? 25 : 0) +
      (plans.allStripePrices ? 20 : 0) +
      (Object.values(live).some((l) => l.health.checkoutReady) ? 15 : 0)
  );

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    activeStripeProducts: Object.keys(lockPrices),
    activePriceIds: lockPrices,
    webhookStatus: {
      signingReady: localAudit.webhookSigningReady,
      endpoint: "/api/webhooks/stripe",
      events: [
        "checkout.session.completed",
        "payment_intent.succeeded",
        "invoice.paid",
        "customer.subscription.created",
      ],
    },
    checkoutReadiness: {
      local: localAudit.checkoutReady,
      financialPipelineReady: localAudit.financialPipelineReady,
      operational: localAudit.operational,
    },
    plans,
    phases: {
      repairOk: phases.repair.ok,
      renderApplyOk: phases.renderApply.ok,
    },
    live,
    productionReadinessScore: productionScore,
    partialItems: [],
  };

  if (!localAudit.checkoutReady) report.partialItems.push("local_checkout_not_ready");
  if (!phases.renderApply.ok) report.partialItems.push("render_env_sync_needs_api_or_manual_paste");
  if (!Object.values(live).some((l) => l.health.checkoutReady)) {
    report.partialItems.push("live_health_checkout_pending_deploy");
  }

  const out = path.join(hubMemory, `resumora-stripe-production-sync-${new Date().toISOString().slice(0, 10)}.json`);
  fs.mkdirSync(hubMemory, { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  report.hubMemoryPath = out;

  console.log(JSON.stringify(report, null, 2));
  process.exit(localAudit.checkoutReady ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
