require("../../../lib/shared/ensure-project-env");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { getWorkspaceOverview } = require("../../../lib/client/workspace-store");
const { getDeliverableForPlan } = require("../../../lib/client/deliverables-catalog");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const lang = String(req.query.lang || "en").toLowerCase() === "fr" ? "fr" : "en";
  try {
    const actor = await readEngagementActor(req, res);
    if (!actor.profileId) {
      return res.status(200).json({ ok: true, signedIn: false, hasAccess: false, plans: [] });
    }
    const base = await getWorkspaceOverview(actor.profileId, actor.profileEmail, lang);
    const plans = base.plans.map((p) => {
      const deliverable = getDeliverableForPlan(p.planId, lang);
      return {
        ...p,
        displayName: deliverable?.displayName || p.planId,
        studioPath: deliverable?.studioPath || "/studio",
        features: deliverable?.features || [],
        freeEditsLabel: deliverable?.freeEditsLabel || "",
      };
    });
    return res.status(200).json({
      ok: true,
      signedIn: true,
      email: actor.profileEmail || null,
      hasAccess: plans.length > 0,
      plans,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
