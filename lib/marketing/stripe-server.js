const Stripe = require("stripe");

/**
 * Single Stripe server client factory — consistent secret trimming + format checks.
 * Used by checkout, webhooks, and session verification.
 */
function getStripeSecretTrimmed(env = process.env) {
  return String(env.STRIPE_SECRET_KEY ?? "").trim();
}

function isValidStripeSecretFormat(secret) {
  return typeof secret === "string" && /^sk_(test|live)_[A-Za-z0-9]+$/.test(secret);
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
  isValidStripeSecretFormat,
};
