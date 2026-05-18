/**
 * Plan policy — free edit limits and deliverable metadata (all tiers).
 */
const FREE_EDITS_BY_PLAN = {
  basic: 1,
  professional: 2,
  elite: 3,
  essential_advanced: 2,
};

const PLAN_IDS = Object.keys(FREE_EDITS_BY_PLAN);

function isPlanId(planId) {
  return PLAN_IDS.includes(planId);
}

function getFreeEditsCount(planId) {
  return FREE_EDITS_BY_PLAN[planId] ?? 0;
}

function freeEditsLabel(planId, lang = "en") {
  const n = getFreeEditsCount(planId);
  if (!n) return "";
  const L = lang === "fr" ? "fr" : "en";
  if (planId === "essential_advanced") {
    return L === "fr"
      ? `${n} sprints de révision limités inclus`
      : `${n} limited revision sprints included`;
  }
  if (L === "fr") {
    return n === 1 ? "1 révision gratuite incluse" : `${n} révisions gratuites incluses`;
  }
  return n === 1 ? "1 free edit included" : `${n} free edits included`;
}

function planPolicySummary(planId, lang = "en") {
  return {
    planId,
    freeEdits: getFreeEditsCount(planId),
    freeEditsLabel: freeEditsLabel(planId, lang),
  };
}

function auditFreeEditsPolicy() {
  const expected = { basic: 1, professional: 2, elite: 3, essential_advanced: 2 };
  const ok = PLAN_IDS.every((id) => getFreeEditsCount(id) === expected[id]);
  return { ok, expected, actual: { ...FREE_EDITS_BY_PLAN } };
}

module.exports = {
  PLAN_IDS,
  FREE_EDITS_BY_PLAN,
  isPlanId,
  getFreeEditsCount,
  freeEditsLabel,
  planPolicySummary,
  auditFreeEditsPolicy,
};
