/**
 * Browser-safe plan → payment link routing (loaded from public API).
 */

const PLAN_TO_SERVICE_KEY = {
  basic: "essential_foundation",
  professional: "professional_career",
  elite: "executive_career",
  essential_advanced: "essential_career",
  addon_linkedin: "linkedin_optimization",
  addon_interview: "interview_preparation",
  addon_cover_letter: "custom_cover_letter",
  addon_translation: "translation_tls",
};

function serviceKeyForPlanId(planId) {
  return PLAN_TO_SERVICE_KEY[planId] || null;
}

module.exports = {
  PLAN_TO_SERVICE_KEY,
  serviceKeyForPlanId,
};
