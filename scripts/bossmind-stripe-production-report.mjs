#!/usr/bin/env node
/**
 * Evidence-based Stripe checkout / webhook production readiness (no card charges).
 *
 *   npm run bossmind:stripe:production-report
 *   BOSSMIND_STRIPE_STRICT=1 — exit 1 if financialPipelineReady is false
 */
import { createRequire } from "module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";
import http from "node:http";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

const { auditStripeEnv, describeStripeBlockers } = require(path.join(root, "lib/marketing/stripe-env-audit.js"));
const { allPlansHaveValidPriceIds } = require(path.join(root, "lib/marketing/stripe-pricing-guard.js"));

function fetchJson(urlString, timeoutMs = 12000) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(urlString);
    } catch {
      resolve({ ok: false, error: "bad_url" });
      return;
    }
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      urlString,
      { method: "GET", timeout: timeoutMs, headers: { accept: "application/json" } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          body += c;
          if (body.length > 200_000) req.destroy();
        });
        res.on("end", () => {
          try {
            resolve({ ok: res.statusCode === 200, status: res.statusCode, json: JSON.parse(body) });
          } catch {
            resolve({ ok: res.statusCode === 200, status: res.statusCode, raw: body.slice(0, 400) });
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
    req.on("error", (e) => resolve({ ok: false, error: e.message }));
    req.end();
  });
}

async function main() {
  const audit = auditStripeEnv();
  const blockers = describeStripeBlockers(audit);
  const allPriceIdsOk = allPlansHaveValidPriceIds();

  const origin = String(process.env.BOSSMIND_STRIPE_PROBE_ORIGIN || "").replace(/\/$/, "");
  let remoteStripeStatus = null;
  if (origin) {
    remoteStripeStatus = await fetchJson(`${origin}/api/stripe/status`);
  }

  const report = {
    ts: new Date().toISOString(),
    audit: {
      checkoutReady: audit.checkoutReady,
      webhookSigningReady: audit.webhookSigningReady,
      financialPipelineReady: audit.financialPipelineReady,
      sandboxLiveConsistent: audit.sandboxLiveConsistent,
      priceIds: audit.priceIds,
      allPriceIdsOk,
    },
    blockers,
    architecture: {
      checkoutMode: "payment_one_time",
      subscriptionNote:
        "Recurring Stripe prices are rejected in /api/checkout (one-time tiers only). There is no subscription checkout in this codebase.",
      webhookNeon: "Events logged to event_log with eventKey = Stripe event id; duplicate deliveries short-circuit (idempotent 200).",
      successPage: "/success?session_id=… verified via /api/verify-session (deduped stripe_checkout_paid).",
      authGate: "Pricing checkout requires signed-in engagement profile (client-hooks → /register?plan=… if not).",
    },
    remoteProbe: origin
      ? {
          origin,
          hint: "Endpoint returns 404 unless NODE_ENV=development or BOSSMIND_DIAGNOSTICS=1 on the server.",
          ...remoteStripeStatus,
        }
      : { skipped: true, hint: "Set BOSSMIND_STRIPE_PROBE_ORIGIN=https://resumora.net for optional remote JSON probe." },
    manualValidation: [
      "Stripe Dashboard → Developers → Webhooks → endpoint URL must match production /api/webhooks/stripe",
      "Use Stripe test card on staging; confirm event_log rows and success page",
      "Confirm HTTPS on Render; no mixed-content on checkout redirect",
    ],
  };

  console.log(JSON.stringify(report, null, 2));

  const strict = process.env.BOSSMIND_STRIPE_STRICT === "1";
  if (strict && !audit.financialPipelineReady) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
