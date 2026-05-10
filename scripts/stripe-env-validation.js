#!/usr/bin/env node
/**
 * Loads .env.local / .env, prints Stripe readiness (no secrets), optional Neon error_memory ping.
 *
 * Strict CI: STRIPE_CI_STRICT=1 → exit 1 when checkoutReady is false.
 */
const { loadProjectEnv } = require("../lib/shared/load-project-env");
const {
  auditStripeEnv,
  describeStripeBlockers,
} = require("../lib/marketing/stripe-env-audit");
const {
  initializeSharedMemory,
  upsertErrorMemory,
} = require("../lib/shared/neon-memory");

async function main() {
  const { loadedFiles } = loadProjectEnv();
  console.log(
    loadedFiles.length
      ? `Loaded env files: ${loadedFiles.join(", ")}`
      : "No .env.local or .env found (only process.env)."
  );

  const audit = auditStripeEnv();
  console.log(
    JSON.stringify(
      { checkoutReady: audit.checkoutReady, priceIds: audit.priceIds },
      null,
      2
    )
  );

  const blockers = describeStripeBlockers(audit);
  if (blockers.length) {
    console.log("Blockers:");
    for (const b of blockers) console.log(`  - ${b}`);
  }

  const memory = await initializeSharedMemory();
  if (!memory.enabled) {
    console.log(`Shared memory unavailable: ${memory.reason}`);
  } else if (!audit.checkoutReady) {
    await upsertErrorMemory({
      projectKey: process.env.BOSSMIND_PROJECT_KEY || "resumora",
      errorType: "stripe_configuration",
      errorMessage: blockers.slice(0, 6).join(" | ").slice(0, 980),
      rootCause:
        "Stripe env incomplete or malformed (see stripe-env-validation and /api/stripe/status in development).",
      fixPattern:
        "Copy .env.example to .env.local; add sk_* and pk_* keys and price_* IDs from Stripe Dashboard; restart server.",
    });
    console.log("Recorded stripe_configuration fingerprint in Neon error_memory (if DB writable).");
  }

  const strict = process.env.STRIPE_CI_STRICT === "1";
  if (strict && !audit.checkoutReady) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
