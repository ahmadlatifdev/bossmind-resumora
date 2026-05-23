import { pricingPlans } from "@/lib/marketing/site-copy";
import { freeEditsLabel } from "@/lib/client/plan-policy";

/** Suggested upgrade paths from each owned tier (additive when multiple plans owned). */
const UPGRADE_PATHS = {
  basic: ["professional", "elite", "essential_advanced"],
  professional: ["elite", "essential_advanced"],
  elite: ["essential_advanced"],
  essential_advanced: [],
};

const EXECUTIVE_PACKAGE_IDS = ["essential_advanced", "elite"];

const ALL_PLAN_IDS = pricingPlans.map((p) => p.id);

function normalizeOwned(ownedPlanIds = []) {
  return [...new Set(ownedPlanIds.map((id) => String(id || "").trim().toLowerCase()).filter(Boolean))];
}

/**
 * Plans the client can purchase next (not already owned), respecting upgrade paths.
 * @param {'all'|'executive'|'service'} mode
 */
export function getUpgradeOffers(ownedPlanIds, mode = "all") {
  const owned = normalizeOwned(ownedPlanIds);
  let candidateIds = new Set();

  if (owned.length === 0) {
    candidateIds = new Set(ALL_PLAN_IDS);
  } else {
    for (const id of owned) {
      (UPGRADE_PATHS[id] || []).forEach((u) => candidateIds.add(u));
    }
    if (candidateIds.size === 0) {
      ALL_PLAN_IDS.forEach((id) => {
        if (!owned.includes(id)) candidateIds.add(id);
      });
    }
  }

  owned.forEach((id) => candidateIds.delete(id));

  if (mode === "executive") {
    candidateIds = new Set([...candidateIds].filter((id) => EXECUTIVE_PACKAGE_IDS.includes(id)));
  }

  const order = new Map(ALL_PLAN_IDS.map((id, i) => [id, i]));
  return pricingPlans
    .filter((p) => candidateIds.has(p.id))
    .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
}

export function planBenefitLine(plan, lang = "en") {
  const features = plan.features?.[lang === "fr" ? "fr" : "en"] || plan.features?.en || [];
  return features[0] || "";
}

export function planOfferMeta(plan, lang = "en") {
  return {
    id: plan.id,
    name: plan.name[lang === "fr" ? "fr" : "en"] || plan.name.en,
    price: plan.price,
    benefit: planBenefitLine(plan, lang),
    revisions: freeEditsLabel(plan.id, lang),
    featured: Boolean(plan.featured),
    badge: plan.badge,
  };
}

export function hasUpgradeOffers(ownedPlanIds, mode = "all") {
  return getUpgradeOffers(ownedPlanIds, mode).length > 0;
}
