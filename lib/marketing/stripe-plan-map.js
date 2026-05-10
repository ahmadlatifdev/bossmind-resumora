/**
 * Maps Basic / Professional / Elite to Stripe Price IDs via env (aliases supported).
 *
 * CANONICAL (recommended — match .env.example): set exactly one valid price_* per tier using:
 *   NEXT_PUBLIC_STRIPE_PRICE_BASIC
 *   NEXT_PUBLIC_STRIPE_PRICE_PRO          ← Professional tier (planId "professional")
 *   NEXT_PUBLIC_STRIPE_PRICE_ELITE
 *
 * Resolution order is first-match wins (top → bottom). Keep NEXT_PUBLIC_* canonical names first.
 */

const { normalizeStripeScalar } = require("./stripe-key-format");

const PLAN_PRICE_ENV_KEYS = {
  basic: [
    "NEXT_PUBLIC_STRIPE_PRICE_BASIC",
    "NEXT_PUBLIC_STRIPE_PRICE_STARTER",
    "STRIPE_PRICE_BASIC",
    "STRIPE_PRICE_ID_BASIC",
  ],
  professional: [
    "NEXT_PUBLIC_STRIPE_PRICE_PRO",
    "NEXT_PUBLIC_STRIPE_PRICE_PROFESSIONAL",
    "STRIPE_PRICE_PRO",
    "STRIPE_PRICE_PROFESSIONAL",
    "STRIPE_PRICE_ID_PROFESSIONAL",
  ],
  elite: [
    "NEXT_PUBLIC_STRIPE_PRICE_ELITE",
    "STRIPE_PRICE_ELITE",
    "STRIPE_PRICE_ID_ELITE",
  ],
};

const ALLOWED_PLAN_IDS = Object.keys(PLAN_PRICE_ENV_KEYS);

function isValidPriceId(value) {
  return typeof value === "string" && /^price_[a-zA-Z0-9]+$/.test(value.trim());
}

/** Resolve first matching Stripe Price ID for plan (reads from env object, default process.env). */
function resolveStripePriceId(planId, env = process.env) {
  const keys = PLAN_PRICE_ENV_KEYS[planId];
  if (!keys) return "";
  for (const k of keys) {
    const raw = env[k];
    if (raw == null || raw === "") continue;
    const cleaned =
      typeof raw === "string" ? normalizeStripeScalar(raw) : String(raw).trim();
    if (isValidPriceId(cleaned)) return cleaned;
  }
  return "";
}

function isPlanId(value) {
  return typeof value === "string" && ALLOWED_PLAN_IDS.includes(value);
}

module.exports = {
  ALLOWED_PLAN_IDS,
  PLAN_PRICE_ENV_KEYS,
  isPlanId,
  isValidPriceId,
  resolveStripePriceId,
};
