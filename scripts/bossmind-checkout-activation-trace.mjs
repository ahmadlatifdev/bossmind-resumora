#!/usr/bin/env node
/**
 * Trace checkout-complete pipeline (local or production).
 *   STRIPE_TEST_SESSION_ID=cs_test_... npm run bossmind:checkout:trace
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

const sessionId = process.env.STRIPE_TEST_SESSION_ID || process.argv[2] || "";
const base = (process.env.BOSSMIND_VALIDATION_BASE || "https://bossmind-resumora-web.onrender.com").replace(
  /\/$/,
  ""
);

async function probeRemote() {
  if (!sessionId) return { skipped: true, reason: "no STRIPE_TEST_SESSION_ID" };
  const url = `${base}/api/client/checkout-complete?lang=en&session_id=${encodeURIComponent(sessionId)}`;
  const t0 = Date.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  const body = await res.json().catch(() => ({}));
  return { url, status: res.status, ms: Date.now() - t0, body };
}

async function probeLocal() {
  if (!sessionId) return { skipped: true };
  const { runCheckoutActivationPipeline } = require(path.join(
    root,
    "lib/client/checkout-activation-pipeline.js"
  ));
  const pipeline = await runCheckoutActivationPipeline(
    { profileId: null, profileEmail: null },
    { sessionId, lang: "en" }
  );
  return { local: true, pipeline };
}

async function main() {
  const report = {
    schema: "bossmind-checkout-activation-trace-v1",
    generatedAt: new Date().toISOString(),
    sessionId: sessionId || null,
    remote: await probeRemote(),
    local: await probeLocal(),
  };
  console.log(JSON.stringify(report, null, 2));
  const status = report.remote?.body?.activationStatus || report.local?.pipeline?.activationStatus;
  process.exit(status === "complete" || status === "needs_sign_in" ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
