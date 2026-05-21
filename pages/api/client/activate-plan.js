require("../../../lib/shared/ensure-project-env");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { ensureEngagementSchema } = require("../../../lib/shared/neon-memory");
const {
  activateBySessionId,
  retryActivateForActor,
} = require("../../../lib/client/entitlement-activation");
const { getWorkspaceOverview } = require("../../../lib/client/workspace-store");
const { getDeliverableForPlan } = require("../../../lib/client/deliverables-catalog");

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const lang = String(req.query.lang || req.body?.lang || "en").toLowerCase() === "fr" ? "fr" : "en";
  const sessionId = String(req.query.session_id || req.body?.session_id || "").trim();
  const email = String(req.query.email || req.body?.email || "").trim();

  try {
    await ensureEngagementSchema();
    const actor = await readEngagementActor(req, res);

    let activation = { ok: false };
    if (sessionId) {
      activation = await activateBySessionId(sessionId, actor, lang);
    } else if (actor.profileId) {
      activation = await retryActivateForActor(actor, { email: email || actor.profileEmail, lang });
      if (activation.ok) activation = activation.result;
    }

    if (!activation.ok && sessionId) {
      activation = await activateBySessionId(sessionId, actor, lang);
    }

    const profileId = actor.profileId;
    let plans = [];
    if (profileId) {
      const base = await getWorkspaceOverview(profileId, actor.profileEmail, lang);
      plans = base.plans.map((p) => {
        const d = getDeliverableForPlan(p.planId, lang);
        return {
          ...p,
          displayName: d?.displayName || p.planId,
          studioPath: d?.studioPath || "/studio",
          features: d?.features || [],
          freeEditsLabel: d?.freeEditsLabel || "",
        };
      });
    }

    if (profileId && sessionId && plans.length === 0 && activation.planActivated) {
      const retry = await activateBySessionId(sessionId, actor, lang);
      if (retry.plansCount > 0) {
        activation = retry;
        const base = await getWorkspaceOverview(profileId, actor.profileEmail, lang);
        plans = base.plans.map((p) => {
          const d = getDeliverableForPlan(p.planId, lang);
          return {
            ...p,
            displayName: d?.displayName || p.planId,
            studioPath: d?.studioPath || "/studio",
            features: d?.features || [],
            freeEditsLabel: d?.freeEditsLabel || "",
          };
        });
      }
    }

    const entitled = plans.length > 0 || activation.plansCount > 0;

    return res.status(200).json({
      ok: true,
      signedIn: Boolean(profileId),
      needsSignIn: !profileId && (activation.planActivated === true || activation.paymentConfirmed === true),
      stripeCheckoutEmail: activation.stripeCheckoutEmail || null,
      activation: activation.activation || {
        paymentConfirmed: activation.planActivated === true,
        planActivated: activation.planActivated === true,
        workspaceReady: plans.length > 0,
        uploadsUnlocked: plans.length > 0,
        generationReady: plans.length > 0,
        interviewToolkitReady: (activation.planId || plans[0]?.planId) === "essential_advanced",
      },
      luxuryStages: activation.luxuryStages || [],
      conciergeMessage: activation.conciergeMessage || null,
      progressPercent: activation.progressPercent ?? (plans.length ? 100 : 0),
      preload: activation.preload || { studio: "/studio" },
      planId: activation.planId || plans[0]?.planId || null,
      displayName: activation.displayName || null,
      hasAccess: entitled,
      plans,
      plansCount: Math.max(plans.length, activation.plansCount || 0),
      fulfillmentOk: activation.planActivated === true,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "activation_failed" });
  }
}
