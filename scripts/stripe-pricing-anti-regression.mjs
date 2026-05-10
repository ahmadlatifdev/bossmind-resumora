#!/usr/bin/env node
/**
 * Fails when any tier lacks a valid Stripe Price ID (anti-regression gate).
 * STRIPE_PRICING_STRICT=1 or STRIPE_CI_STRICT=1 → exit 1 if incomplete.
 */
import { createRequire } from "module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

const { auditStripeEnv, describeStripeBlockers } = require(path.join(
  root,
  "lib/marketing/stripe-env-audit.js"
));
const { allPlansHaveValidPriceIds } = require(path.join(root, "lib/marketing/stripe-pricing-guard.js"));

const audit = auditStripeEnv();
const pricesOk = allPlansHaveValidPriceIds();

console.log(
  JSON.stringify(
    {
      allPriceIdsOk: pricesOk,
      pricingResolution: audit.pricingResolution,
      priceIds: audit.priceIds,
    },
    null,
    2
  )
);

const blockers = describeStripeBlockers(audit).filter(
  (b) => b.includes("Stripe Price ID") || b.includes("price_*") || b.includes("NEXT_PUBLIC_STRIPE_PRICE")
);
if (blockers.length) {
  console.log("Pricing-related blockers:");
  for (const b of blockers) console.log(`  - ${b}`);
}

const strict =
  process.env.STRIPE_PRICING_STRICT === "1" || process.env.STRIPE_CI_STRICT === "1";
if (strict && !pricesOk) {
  console.error(
    "stripe-pricing-anti-regression: FAILED — set NEXT_PUBLIC_STRIPE_PRICE_BASIC, NEXT_PUBLIC_STRIPE_PRICE_PRO, NEXT_PUBLIC_STRIPE_PRICE_ELITE to valid price_* IDs"
  );
  process.exit(1);
}

if (!pricesOk) {
  console.warn(
    "stripe-pricing-anti-regression: incomplete Price IDs (exit 0). Use STRIPE_PRICING_STRICT=1 to fail CI."
  );
}
process.exit(0);
