/**
 * Single-call post-checkout bootstrap — activate + workspace overview (fewer round trips).
 */
const { activateBySessionId, retryActivateForActor } = require("./entitlement-activation");
const { getWorkspaceOverview } = require("./workspace-store");
const { getDeliverableForPlan } = require("./deliverables-catalog");
const {
  buildLuxuryStages,
  activeConciergeMessage,
  progressPercent,
} = require("./activation-stages");

function mapPlans(base, lang) {
  return (base.plans || []).map((p) => {
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

function plansFromActivationRows(activation, lang) {
  const rows = activation?.plans || [];
  if (!rows.length) return [];
  return mapPlans(
    {
      plans: rows.map((p) => ({
        planId: p.plan_id || p.planId,
        grantedAt: p.granted_at || new Date().toISOString(),
        documents: [],
        editRequests: [],
        freeEdits: { included: 0, accepted: 0, remaining: 0 },
        generationStatus: "queued",
        generationMeta: {},
        progressTracker: { steps: [], percent: 0 },
        delivery: null,
      })),
    },
    lang
  );
}

function minimalPlanFromActivation(activation, lang) {
  const planId = activation?.planId;
  if (!planId) return [];
  return mapPlans(
    {
      plans: [
        {
          planId,
          grantedAt: new Date().toISOString(),
          documents: [],
          editRequests: [],
          freeEdits: { included: 0, accepted: 0, remaining: 0 },
          generationStatus: "queued",
          generationMeta: {},
          progressTracker: { steps: [], percent: 0 },
          delivery: null,
        },
      ],
    },
    lang
  );
}

async function bootstrapClientCheckout(actor, { sessionId = null, lang = "en" } = {}) {
  let activation = { ok: false, plansCount: 0 };
  if (sessionId) {
    activation = await activateBySessionId(sessionId, actor, lang);
  } else if (actor.profileId) {
    const retry = await retryActivateForActor(actor, { email: actor.profileEmail, lang });
    if (retry.ok) activation = { ...retry.result, ok: true };
  }

  let plans = [];
  if (actor.profileId) {
    let base = await getWorkspaceOverview(actor.profileId, actor.profileEmail, lang);
    if (!base.plans?.length && sessionId) {
      activation = await activateBySessionId(sessionId, actor, lang);
      base = await getWorkspaceOverview(actor.profileId, actor.profileEmail, lang);
    }
    plans = mapPlans(base, lang);
    if (!plans.length) {
      plans = plansFromActivationRows(activation, lang);
    }
    if (!plans.length && activation.planActivated && activation.planId) {
      plans = minimalPlanFromActivation(activation, lang);
    }
  }

  const activationFlags = activation.activation || {
    paymentConfirmed: activation.planActivated === true,
    planActivated: activation.planActivated === true,
    workspaceReady: plans.length > 0,
    uploadsUnlocked: plans.length > 0,
    generationReady: plans.length > 0,
    interviewToolkitReady: (activation.planId || plans[0]?.planId) === "essential_advanced",
  };
  const luxuryStages = buildLuxuryStages(activationFlags, 0, lang);

  return {
    signedIn: Boolean(actor.profileId),
    email: actor.profileEmail || activation.stripeCheckoutEmail || null,
    supportEmail: process.env.RESUMORA_SUPPORT_EMAIL || "support@resumora.net",
    hasAccess: plans.length > 0,
    needsSignIn: !actor.profileId && activation.planActivated === true,
    stripeCheckoutEmail: activation.stripeCheckoutEmail || null,
    activation: activationFlags,
    luxuryStages,
    conciergeMessage: activeConciergeMessage(luxuryStages, lang),
    progressPercent: plans.length ? 100 : progressPercent(activationFlags, 0),
    preload: activation.preload || { studio: "/studio" },
    planId: activation.planId || plans[0]?.planId || null,
    displayName: activation.displayName || plans[0]?.displayName || null,
    plans,
    plansCount: plans.length,
    fulfillmentOk: activation.planActivated === true,
  };
}

module.exports = { bootstrapClientCheckout };
