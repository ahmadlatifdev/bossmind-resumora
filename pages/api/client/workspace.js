require("../../../lib/shared/ensure-project-env");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { getWorkspaceOverview } = require("../../../lib/client/workspace-store");
const { getDeliverableForPlan } = require("../../../lib/client/deliverables-catalog");
const {
  activateBySessionId,
  retryActivateForActor,
} = require("../../../lib/client/entitlement-activation");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const lang = String(req.query.lang || "en").toLowerCase() === "fr" ? "fr" : "en";
  const sessionId = String(req.query.session_id || "").trim();

  try {
    const actor = await readEngagementActor(req, res);
    if (!actor.profileId) {
      return res.status(200).json({ ok: true, signedIn: false, hasAccess: false, plans: [] });
    }

    let activationMeta = null;
    if (sessionId) {
      activationMeta = await activateBySessionId(sessionId, actor, lang).catch(() => null);
    }

    let base = await getWorkspaceOverview(actor.profileId, actor.profileEmail, lang);
    if (!base.plans?.length) {
      const retry = await retryActivateForActor(actor, {
        sessionId: sessionId || undefined,
        email: actor.profileEmail,
        lang,
      }).catch(() => null);
      if (retry?.result) activationMeta = retry.result;
      base = await getWorkspaceOverview(actor.profileId, actor.profileEmail, lang);
    }

    let plans = base.plans.map((p) => {
      const deliverable = getDeliverableForPlan(p.planId, lang);
      return {
        ...p,
        displayName: deliverable?.displayName || p.planId,
        studioPath: deliverable?.studioPath || "/studio",
        features: deliverable?.features || [],
        freeEditsLabel: deliverable?.freeEditsLabel || "",
      };
    });

    if (!plans.length && activationMeta?.planId) {
      const deliverable = getDeliverableForPlan(activationMeta.planId, lang);
      plans = [
        {
          planId: activationMeta.planId,
          displayName: deliverable?.displayName || activationMeta.planId,
          studioPath: deliverable?.studioPath || "/studio",
          features: deliverable?.features || [],
          freeEditsLabel: deliverable?.freeEditsLabel || "",
          documents: [],
          generationStatus: "queued",
        },
      ];
    }

    const fulfillmentOk = activationMeta?.planActivated === true;
    return res.status(200).json({
      ok: true,
      signedIn: true,
      email: actor.profileEmail || null,
      hasAccess: plans.length > 0,
      fulfillmentOk,
      planId: activationMeta?.planId || plans[0]?.planId || null,
      displayName: activationMeta?.displayName || plans[0]?.displayName || null,
      stripeCheckoutEmail: activationMeta?.stripeCheckoutEmail || null,
      supportEmail: process.env.RESUMORA_SUPPORT_EMAIL || "support@resumora.net",
      plans,
      activation: {
        paymentConfirmed: plans.length > 0,
        planActivated: plans.length > 0,
        workspaceReady: plans.length > 0,
        uploadsUnlocked: plans.length > 0,
        generationReady: plans.length > 0,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
