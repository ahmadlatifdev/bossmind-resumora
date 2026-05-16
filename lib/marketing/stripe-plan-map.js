/**
 * Maps Basic / Professional / Elite to Stripe Price IDs via env (aliases supported).
 *
 * Dashboard: each Price must be **one-time** (not recurring) — Checkout uses mode "payment".
 *
 * CANONICAL (recommended — match .env.example): set exactly one valid price_* per tier using:
 *   NEXT_PUBLIC_STRIPE_PRICE_BASIC
 *   NEXT_PUBLIC_STRIPE_PRICE_PRO          ← Professional tier (planId "professional")
 *   NEXT_PUBLIC_STRIPE_PRICE_ELITE
 *   NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL_ADVANCED
 *
 * Resolution order is first-match wins (top → bottom). Keep NEXT_PUBLIC_* canonical names first.
 */

const { normalizeStripeScalar } = require("./stripe-key-format");

/** Preferred env keys (documented / UI mapping) — duplicates stripe-pricing-guard for a single export point. */
const CANONICAL_PRICE_ENV = {
  basic: "NEXT_PUBLIC_STRIPE_PRICE_BASIC",
  professional: "NEXT_PUBLIC_STRIPE_PRICE_PRO",
  elite: "NEXT_PUBLIC_STRIPE_PRICE_ELITE",
  essential_advanced: "NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL_ADVANCED",
};

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
    "NEXT_PUBLIC_STRIPE_PRICE_ID_PROFESSIONAL",
    "STRIPE_PRICE_PRO",
    "STRIPE_PRICE_PROFESSIONAL",
    "STRIPE_PRICE_ID_PRO",
    "STRIPE_PRICE_ID_PROFESSIONAL",
  ],
  elite: [
    "NEXT_PUBLIC_STRIPE_PRICE_ELITE",
    "STRIPE_PRICE_ELITE",
    "STRIPE_PRICE_ID_ELITE",
  ],
  essential_advanced: [
    "NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL_ADVANCED",
    "NEXT_PUBLIC_STRIPE_PRICE_INTERVIEW_ADVANCED",
    "STRIPE_PRICE_ESSENTIAL_ADVANCED",
    "STRIPE_PRICE_ID_ESSENTIAL_ADVANCED",
  ],
};

const ALLOWED_PLAN_IDS = Object.keys(PLAN_PRICE_ENV_KEYS);

function isValidPriceId(value) {
  const t = typeof value === "string" ? value.trim() : "";
  /* Stripe Price IDs start with price_; suffix is alphanumeric (underscore allowed in some dashboards). */
  return Boolean(t) && /^price_[a-zA-Z0-9_]+$/.test(t);
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
  CANONICAL_PRICE_ENV,
  PLAN_PRICE_ENV_KEYS,
  isPlanId,
  isValidPriceId,
  resolveStripePriceId,
};
