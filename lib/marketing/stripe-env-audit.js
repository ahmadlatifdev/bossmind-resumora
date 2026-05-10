const {
  resolveStripePriceId,
  ALLOWED_PLAN_IDS,
  isValidPriceId,
} = require("./stripe-plan-map");

/**
 * Non-secret Stripe configuration audit (patterns only — never echoes key material).
 */
function auditStripeEnv(env = process.env) {
  const secret = String(env.STRIPE_SECRET_KEY ?? "").trim();
  const publishable = String(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").trim();
  const webhook = String(env.STRIPE_WEBHOOK_SECRET ?? "").trim();

  const secretFormatOk = /^sk_(test|live)_[A-Za-z0-9]+$/.test(secret);
  const publishableFormatOk = /^pk_(test|live)_[A-Za-z0-9]+$/.test(publishable);
  const webhookFormatOk = /^whsec_[A-Za-z0-9]+$/.test(webhook);

  const priceIds = {};
  for (const plan of ALLOWED_PLAN_IDS) {
    const raw = resolveStripePriceId(plan, env);
    priceIds[plan] = {
      configured: Boolean(raw),
      valid: isValidPriceId(raw),
    };
  }

  const allPricesOk = ALLOWED_PLAN_IDS.every((p) => priceIds[p].valid);
  const checkoutReady =
    secretFormatOk && publishableFormatOk && allPricesOk;

  /** Dashboard signing secret present and looks like `whsec_`. */
  const webhookSigningReady =
    Boolean(webhook) && webhookFormatOk;

  /** Checkout + signed webhooks ready (production-safe payment pipeline checklist). */
  const financialPipelineReady = checkoutReady && webhookSigningReady;

  return {
    secretKey: { present: Boolean(secret), formatOk: secretFormatOk },
    publishableKey: { present: Boolean(publishable), formatOk: publishableFormatOk },
    webhookSecret: { present: Boolean(webhook), formatOk: webhookFormatOk },
    priceIds,
    checkoutReady,
    webhookSigningReady,
    financialPipelineReady,
  };
}

function describeStripeBlockers(audit) {
  const lines = [];
  if (!audit.secretKey.present) {
    lines.push("STRIPE_SECRET_KEY is missing (add to .env.local).");
  } else if (!audit.secretKey.formatOk) {
    lines.push("STRIPE_SECRET_KEY is present but not a valid sk_test_* or sk_live_* key.");
  }
  if (!audit.publishableKey.present) {
    lines.push("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing.");
  } else if (!audit.publishableKey.formatOk) {
    lines.push("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not a valid pk_test_* or pk_live_* key.");
  }
  for (const plan of ALLOWED_PLAN_IDS) {
    const p = audit.priceIds[plan];
    if (!p.valid) {
      lines.push(
        `No valid Stripe Price ID for plan "${plan}" (set one of the env aliases in .env.example).`
      );
    }
  }
  if (!audit.webhookSecret.present) {
    lines.push("STRIPE_WEBHOOK_SECRET is missing — webhooks cannot verify signatures until set.");
  } else if (!audit.webhookSecret.formatOk) {
    lines.push(
      "STRIPE_WEBHOOK_SECRET format looks wrong — use whsec_* from Stripe Dashboard » Webhooks."
    );
  }
  return lines;
}

module.exports = { auditStripeEnv, describeStripeBlockers };
