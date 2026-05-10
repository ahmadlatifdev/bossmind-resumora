#!/usr/bin/env node
/**
 * Stripe env diagnostic — no secrets printed (prefix classes + lengths only).
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
const { normalizeStripeScalar } = require(path.join(root, "lib/marketing/stripe-key-format.js"));

function classifyKey(raw) {
  const s = normalizeStripeScalar(raw);
  if (!s) return { present: false, length: 0 };
  let modeHint = "unknown-shape";
  if (/^sk_test_/.test(s)) modeHint = "sk_test_*";
  else if (/^sk_live_/.test(s)) modeHint = "sk_live_*";
  else if (/^pk_test_/.test(s)) modeHint = "pk_test_*";
  else if (/^pk_live_/.test(s)) modeHint = "pk_live_*";
  else if (/^whsec_/.test(s)) modeHint = "whsec_*";
  else if (/^pk_/.test(s) || /^sk_/.test(s)) modeHint = "sk_or_pk_unusual_prefix";
  return { present: true, length: s.length, modeHint };
}

const audit = auditStripeEnv();
const maskMeta = {
  STRIPE_SECRET_KEY: classifyKey(process.env.STRIPE_SECRET_KEY),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: classifyKey(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
  STRIPE_WEBHOOK_SECRET: classifyKey(process.env.STRIPE_WEBHOOK_SECRET),
};
console.log(
  JSON.stringify(
    {
      checkoutReady: audit.checkoutReady,
      sandboxLiveConsistent: audit.sandboxLiveConsistent,
      keysMeta: maskMeta,
      priceIds: audit.priceIds,
      blockers: describeStripeBlockers(audit),
    },
    null,
    2
  )
);
