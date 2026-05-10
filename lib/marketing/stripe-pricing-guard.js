/**
 * Stripe Price ID anti-regression — single resolution path + diagnostics (no secrets).
 * Canonical env names (set ONE valid price_* per plan): see PLAN_PRICE_ENV_KEYS order in stripe-plan-map.js
 */
const {
  PLAN_PRICE_ENV_KEYS,
  ALLOWED_PLAN_IDS,
  resolveStripePriceId,
  isValidPriceId,
} = require("./stripe-plan-map");
const { normalizeStripeScalar } = require("./stripe-key-format");

/** Recommended primary keys (documented in .env.example). */
const CANONICAL_PRICE_ENV = {
  basic: "NEXT_PUBLIC_STRIPE_PRICE_BASIC",
  professional: "NEXT_PUBLIC_STRIPE_PRICE_PRO",
  elite: "NEXT_PUBLIC_STRIPE_PRICE_ELITE",
};

function normalizeScalarEnv(v) {
  if (v == null || v === "") return "";
  return normalizeStripeScalar(typeof v === "string" ? v : String(v));
}

function inspectPlanPriceSources(planId, env = process.env) {
  const keys = PLAN_PRICE_ENV_KEYS[planId] || [];
  const tried = [];
  let winningKey = null;
  for (const k of keys) {
    const cleaned = normalizeScalarEnv(env[k]);
    let status = "missing";
    if (cleaned) {
      status = isValidPriceId(cleaned) ? "valid" : "invalid_format";
      if (status === "valid" && !winningKey) winningKey = k;
    }
    tried.push({ key: k, status });
  }
  const resolved = resolveStripePriceId(planId, env);
  return {
    planId,
    resolved: Boolean(resolved && isValidPriceId(resolved)),
    winningKey,
    canonicalKey: CANONICAL_PRICE_ENV[planId],
    tried,
  };
}

function pricingResolutionReport(env = process.env) {
  const plans = {};
  for (const planId of ALLOWED_PLAN_IDS) {
    plans[planId] = inspectPlanPriceSources(planId, env);
  }
  return { plans, canonicalKeys: CANONICAL_PRICE_ENV };
}

function allPlansHaveValidPriceIds(env = process.env) {
  return ALLOWED_PLAN_IDS.every((p) => {
    const id = resolveStripePriceId(p, env);
    return id && isValidPriceId(id);
  });
}

/** Checkout API hint — lists canonical + alias keys for one plan. */
function pricingSetupHintForPlan(planId) {
  const keys = PLAN_PRICE_ENV_KEYS[planId] || [];
  const canonical = CANONICAL_PRICE_ENV[planId];
  const ordered = canonical ? [canonical, ...keys.filter((k) => k !== canonical)] : keys;
  const unique = [...new Set(ordered)];
  return `Set ONE valid Stripe Price ID for this tier in .env.local — preferred: ${canonical}=price_xxx — aliases: ${unique.join(", ")}. Restart dev after edits.`;
}

function describePricingAliasesMissing(env = process.env) {
  const lines = [];
  for (const planId of ALLOWED_PLAN_IDS) {
    const id = resolveStripePriceId(planId, env);
    if (!id || !isValidPriceId(id)) {
      const canon = CANONICAL_PRICE_ENV[planId];
      lines.push(
        `Plan "${planId}": missing valid price_* — set ${canon} (or any alias in stripe-plan-map PLAN_PRICE_ENV_KEYS).`
      );
    }
  }
  return lines;
}

/**
 * Server boot (instrumentation): log gaps; optionally hard-fail CI/production gates.
 */
function runStripePricingBootCheck() {
  const strictBlock = process.env.STRIPE_BLOCK_INCOMPLETE_PRICING === "1";
  const ok = allPlansHaveValidPriceIds();
  if (ok) return;

  const lines = describePricingAliasesMissing();
  const msg = `[Stripe pricing] Incomplete Price IDs — checkout will fail until set:\n${lines.map((l) => `  - ${l}`).join("\n")}`;
  if (strictBlock) {
    throw new Error(`${msg}\n(STRIPE_BLOCK_INCOMPLETE_PRICING=1)`);
  }
  if (process.env.NODE_ENV === "development") {
    console.warn(msg);
  } else {
    console.error(msg);
  }
}

module.exports = {
  CANONICAL_PRICE_ENV,
  inspectPlanPriceSources,
  pricingResolutionReport,
  allPlansHaveValidPriceIds,
  pricingSetupHintForPlan,
  describePricingAliasesMissing,
  runStripePricingBootCheck,
};
