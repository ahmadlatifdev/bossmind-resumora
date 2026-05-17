/**
 * Browser-safe Resumora brand authority constants (no fs).
 */
const OFFICIAL_BRAND = "Resumora";

const PLAN_STRIPE_NAMES = {
  basic: "Resumora: Essential Career Foundation",
  professional: "Resumora: Professional Career Optimization",
  elite: "Resumora: Executive Career Package",
  essential_advanced: "Resumora: Essential Advanced Career Upgrade",
};

function officialPlanStripeName(planId) {
  return PLAN_STRIPE_NAMES[planId] || `${OFFICIAL_BRAND}: ${planId}`;
}

module.exports = {
  OFFICIAL_BRAND,
  PLAN_STRIPE_NAMES,
  officialPlanStripeName,
};
