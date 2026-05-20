require("../../../lib/shared/ensure-project-env");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { ensureEngagementSchema } = require("../../../lib/shared/neon-memory");
const {
  getOnboardingState,
  getNextAction,
  markOnboarding,
} = require("../../../lib/client/onboarding-journey");
const { getDeliverableForPlan } = require("../../../lib/client/deliverables-catalog");
const { getFreeEditsCount } = require("../../../lib/client/plan-policy");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const lang = String(req.query.lang || "en").toLowerCase() === "fr" ? "fr" : "en";
  try {
    await ensureEngagementSchema();
    const actor = await readEngagementActor(req, res);
    const profileId = actor.profileId;
    if (!profileId) {
      return res.status(200).json({
        ok: true,
        signedIn: false,
        next: { path: "/login", action: "login" },
        progress: { steps: [], percent: 0 },
      });
    }

    const state = await getOnboardingState(profileId, lang);
    const next = await getNextAction(profileId, lang, req.query);
    const planId = state.activePlanId;
    const deliverable = planId ? getDeliverableForPlan(planId, lang) : null;

    return res.status(200).json({
      ok: true,
      signedIn: true,
      email: actor.profileEmail,
      activePlanId: planId,
      displayName: deliverable?.displayName || planId,
      studioPath: deliverable?.studioPath || "/studio",
      freeEditsIncluded: planId ? getFreeEditsCount(planId) : 0,
      progress: {
        steps: state.steps,
        percent: state.percent,
      },
      uploadWizard: state.uploadWizard,
      generationStatus: state.genStatus,
      next,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
