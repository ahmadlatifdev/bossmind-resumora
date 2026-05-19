const {
  resolveStripePriceId,
  ALLOWED_PLAN_IDS,
  isValidPriceId,
} = require("./stripe-plan-map");
const { priceIdsFromLock, loadPaymentLinksLock } = require("./stripe-price-lock");
const { pricingResolutionReport } = require("./stripe-pricing-guard");
const {
  normalizeStripeScalar,
  isValidStripeSecretFormat,
  isValidPublishableFormat,
  isValidWebhookSecretFormat,
  sandboxLiveConsistent,
} = require("./stripe-key-format");

/**
 * Non-secret Stripe configuration audit (patterns only — never echoes key material).
 */
function auditStripeEnv(env = process.env) {
  const secret = normalizeStripeScalar(env.STRIPE_SECRET_KEY);
  const publishable = normalizeStripeScalar(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const webhook = normalizeStripeScalar(env.STRIPE_WEBHOOK_SECRET);

  const secretFormatOk = isValidStripeSecretFormat(secret);
  const publishableFormatOk = isValidPublishableFormat(publishable);
  const webhookFormatOk = isValidWebhookSecretFormat(webhook);
  const modeConsistency = sandboxLiveConsistent(secret, publishable);

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
    secretFormatOk &&
    publishableFormatOk &&
    allPricesOk &&
    modeConsistency.consistent;

  /** Dashboard signing secret present and looks like `whsec_`. */
  const webhookSigningReady =
    Boolean(webhook) && webhookFormatOk;

  /** Checkout + signed webhooks ready (production-safe payment pipeline checklist). */
  const financialPipelineReady = checkoutReady && webhookSigningReady;

  return {
    secretKey: { present: Boolean(secret), formatOk: secretFormatOk },
    publishableKey: { present: Boolean(publishable), formatOk: publishableFormatOk },
    webhookSecret: { present: Boolean(webhook), formatOk: webhookFormatOk },
    sandboxLiveConsistent: modeConsistency,
    priceIds,
    pricingResolution: pricingResolutionReport(env),
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
      const detail = audit.pricingResolution?.plans?.[plan];
      const invalidAliases =
        detail?.tried?.filter((t) => t.status === "invalid_format").map((t) => t.key) || [];
      lines.push(
        `No valid Stripe Price ID for plan "${plan}" — preferred env: ${detail?.canonicalKey || "see .env.example"}.${
          invalidAliases.length
            ? ` (invalid value under: ${invalidAliases.join(", ")})`
            : ""
        }`
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
  if (audit.sandboxLiveConsistent && audit.sandboxLiveConsistent.consistent === false) {
    lines.push(audit.sandboxLiveConsistent.reason || "sk_* and pk_* must both be test mode or both live mode.");
  }
  return lines;
}

/**
 * Production-aware audit: reflects hosted checkout + payment links when env vars are incomplete.
 */
function auditStripeProductionState(env = process.env) {
  const strict = auditStripeEnv(env);
  const lock = loadPaymentLinksLock();
  const lockRoutes = lock?.planRoutes || {};
  const paymentLinksOperational = ALLOWED_PLAN_IDS.every((p) =>
    Boolean(lockRoutes[p]?.paymentLinkUrl)
  );
  const pricesResolvable = ALLOWED_PLAN_IDS.every((p) => isValidPriceId(resolveStripePriceId(p, env)));
  const lockPriceMap = priceIdsFromLock();

  const secretOk = strict.secretKey.formatOk;
  const publishableOk = strict.publishableKey.formatOk;
  const modeOk = strict.sandboxLiveConsistent?.consistent !== false;

  const operationalCheckout =
    secretOk && pricesResolvable && modeOk && (publishableOk || paymentLinksOperational);

  const webhookOrLinks =
    strict.webhookSigningReady || (paymentLinksOperational && secretOk);

  const financialPipelineReady = operationalCheckout && webhookOrLinks;

  return {
    ...strict,
    checkoutReady: operationalCheckout,
    financialPipelineReady,
    operational: {
      paymentLinksOperational,
      pricesResolvable,
      lockPriceIdsPresent: Object.keys(lockPriceMap).length >= 4,
      publishableOptionalWhenLinks: paymentLinksOperational && !publishableOk,
    },
  };
}

module.exports = { auditStripeEnv, auditStripeProductionState, describeStripeBlockers };
