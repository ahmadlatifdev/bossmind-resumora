/**
 * Stripe Dashboard keys — suffix may include underscores (not only [A-Za-z0-9]).
 * Shared by checkout, webhooks, audits.
 */

const STRIPE_SECRET = /^sk_(test|live)_[A-Za-z0-9_]+$/;
const STRIPE_PUBLISHABLE = /^pk_(test|live)_[A-Za-z0-9_]+$/;
const WEBHOOK_SIGNING = /^whsec_[A-Za-z0-9_]+$/;

/** BOM / zero-width / stray whitespace / duplicated quotes — common .env.local corruption. */
function normalizeStripeScalar(raw) {
  let s = String(raw ?? "")
    .replace(/\uFEFF|\u200B|\u200C|\u200D/g, "")
    .trim()
    .replace(/\s+/g, "");
  while (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim().replace(/\s+/g, "");
  }
  return s;
}

function isValidStripeSecretFormat(s) {
  const t = normalizeStripeScalar(s);
  return Boolean(t) && STRIPE_SECRET.test(t);
}

function isValidPublishableFormat(s) {
  const t = normalizeStripeScalar(s);
  return Boolean(t) && STRIPE_PUBLISHABLE.test(t);
}

/** Recover first valid pk_* when .env value was concatenated or corrupted. */
function extractValidPublishableKey(raw) {
  const direct = normalizeStripeScalar(raw);
  if (isValidPublishableFormat(direct)) return direct;
  const matches = String(raw ?? "").match(/pk_(?:test|live)_[A-Za-z0-9_]+/g) || [];
  for (const m of matches) {
    if (isValidPublishableFormat(m)) return m;
  }
  return "";
}

function isValidWebhookSecretFormat(s) {
  const t = normalizeStripeScalar(s);
  return Boolean(t) && WEBHOOK_SIGNING.test(t);
}

/** Both must be test or both live (when both present). */
function sandboxLiveConsistent(secret, publishable) {
  const sk = String(secret ?? "").trim();
  const pk = String(publishable ?? "").trim();
  if (!sk || !pk) return { consistent: true, reason: "partial_keys" };
  const skTest = sk.startsWith("sk_test_");
  const pkTest = pk.startsWith("pk_test_");
  const skLive = sk.startsWith("sk_live_");
  const pkLive = pk.startsWith("pk_live_");
  if ((skTest && pkTest) || (skLive && pkLive)) return { consistent: true, mode: skTest ? "test" : "live" };
  return {
    consistent: false,
    reason: "sk_* and pk_* must both be test or both be live",
    mode: null,
  };
}

module.exports = {
  STRIPE_SECRET,
  STRIPE_PUBLISHABLE,
  WEBHOOK_SIGNING,
  extractValidPublishableKey,
  normalizeStripeScalar,
  isValidStripeSecretFormat,
  isValidPublishableFormat,
  isValidWebhookSecretFormat,
  sandboxLiveConsistent,
};
