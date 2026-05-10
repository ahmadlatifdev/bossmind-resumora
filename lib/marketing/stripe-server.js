const Stripe = require("stripe");
const {
  isValidStripeSecretFormat,
  normalizeStripeScalar,
} = require("./stripe-key-format");

/**
 * Single Stripe server client factory — consistent secret trimming + format checks.
 * Used by checkout, webhooks, and session verification.
 */
function getStripeSecretTrimmed(env = process.env) {
  return normalizeStripeScalar(env.STRIPE_SECRET_KEY);
}

function rawStripeSecret(raw) {
  return normalizeStripeScalar(raw);
}

function createStripeServerClient(env = process.env) {
  const trimmed = getStripeSecretTrimmed(env);
  if (!trimmed) {
    return { stripe: null, reason: "missing_secret" };
  }
  if (!isValidStripeSecretFormat(trimmed)) {
    return { stripe: null, reason: "invalid_secret_format" };
  }
  try {
    const stripe = new Stripe(trimmed);
    return { stripe, reason: "" };
  } catch {
    return { stripe: null, reason: "stripe_init_failed" };
  }
}

module.exports = {
  createStripeServerClient,
  getStripeSecretTrimmed,
  rawStripeSecret,
  isValidStripeSecretFormat,
};
