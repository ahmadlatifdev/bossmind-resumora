/**
 * Authoritative post-checkout activation pipeline with step tracing.
 * Payment success → entitlement → workspace unlock → definitive client status.
 */
const { createStripeServerClient } = require("../marketing/stripe-server");
const { activateFromStripeSession, activateBySessionId, finalizeEntitlementBinding } = require("./entitlement-activation");
const { getWorkspaceOverview } = require("./workspace-store");
const { getDeliverableForPlan } = require("./deliverables-catalog");
const { listEntitlementsByStripeSession } = require("./entitlements-store");
const { getSqlClient, ensureEngagementSchema } = require("../shared/neon-memory");

const SERVER_BUDGET_MS = 18000;

function step(name, ok, detail = {}) {
  return { step: name, ok, at: new Date().toISOString(), ...detail };
}

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

function minimalPlan(planId, lang) {
  const d = getDeliverableForPlan(planId, lang);
  return [
    {
      planId,
      displayName: d?.displayName || planId,
      studioPath: d?.studioPath || "/studio",
      features: d?.features || [],
      freeEditsLabel: d?.freeEditsLabel || "",
      documents: [],
      editRequests: [],
      freeEdits: { included: 0, accepted: 0, remaining: 0 },
      generationStatus: "queued",
      generationMeta: {},
      progressTracker: { steps: [], percent: 0 },
      delivery: null,
      grantedAt: new Date().toISOString(),
    },
  ];
}

/**
 * @returns {Promise<object>} activation payload for API + client
 */
async function runCheckoutActivationPipeline(actor, { sessionId, lang = "en" } = {}) {
  const startedAt = Date.now();
  const steps = [];
  const sid = String(sessionId || "").trim();

  if (!sid) {
    return {
      ok: false,
      activationStatus: "failed",
      failedStep: "missing_session_id",
      steps: [step("session_id", false, { reason: "missing_session_id" })],
      signedIn: Boolean(actor?.profileId),
      hasAccess: false,
      redirectTo: "/studio",
    };
  }

  const { stripe, reason: stripeReason } = createStripeServerClient();
  if (!stripe) {
    steps.push(step("stripe_session", false, { reason: stripeReason || "stripe_unconfigured" }));
    return {
      ok: false,
      activationStatus: "failed",
      failedStep: "stripe_session",
      steps,
      signedIn: Boolean(actor?.profileId),
      hasAccess: false,
      redirectTo: "/login",
    };
  }

  let stripeSession;
  try {
    stripeSession = await stripe.checkout.sessions.retrieve(sid, {
      expand: ["line_items.data.price", "customer_details"],
    });
    steps.push(step("stripe_session", true, { sessionId: sid, paymentStatus: stripeSession.payment_status }));
  } catch (e) {
    steps.push(step("stripe_session", false, { error: e.message }));
    return {
      ok: false,
      activationStatus: "failed",
      failedStep: "stripe_session",
      steps,
      signedIn: Boolean(actor?.profileId),
      hasAccess: false,
      redirectTo: "/studio",
    };
  }

  if (Date.now() - startedAt > SERVER_BUDGET_MS) {
    steps.push(step("timeout", false, { budgetMs: SERVER_BUDGET_MS }));
    return buildPending(steps, actor, stripeSession, lang);
  }

  if (stripeSession.payment_status !== "paid") {
    steps.push(step("payment_confirmed", false, { paymentStatus: stripeSession.payment_status }));
    return {
      ok: false,
      activationStatus: "pending",
      failedStep: "payment_confirmed",
      steps,
      signedIn: Boolean(actor?.profileId),
      hasAccess: false,
      paymentStatus: stripeSession.payment_status,
      redirectTo: "/studio",
      stripeCheckoutEmail:
        stripeSession.customer_details?.email || stripeSession.customer_email || null,
    };
  }
  steps.push(step("payment_confirmed", true));

  await ensureEngagementSchema().catch(() => {});
  const sql = getSqlClient();
  if (!sql) {
    steps.push(step("database_save", false, { reason: "database_unavailable" }));
    return {
      ok: false,
      activationStatus: "failed",
      failedStep: "database_save",
      steps,
      signedIn: Boolean(actor?.profileId),
      hasAccess: false,
      redirectTo: "/studio",
    };
  }
  steps.push(step("database_save", true, { source: "neon_connected" }));

  let activation = await activateFromStripeSession(stripeSession, {
    profileId: actor?.profileId || null,
    profileEmail: actor?.profileEmail || null,
    lang,
  });

  if (!activation.planId) {
    steps.push(step("plan_resolve", false, { reason: activation.reason || "plan_id_unresolved" }));
    return {
      ok: false,
      activationStatus: "failed",
      failedStep: "plan_resolve",
      steps,
      signedIn: Boolean(actor?.profileId),
      hasAccess: false,
      redirectTo: "/pricing#pricing",
      stripeCheckoutEmail: activation.stripeCheckoutEmail || null,
    };
  }
  steps.push(step("plan_resolve", true, { planId: activation.planId }));

  const grantOk = activation.planActivated === true || activation.grantResult?.ok === true;
  if (!grantOk) {
    steps.push(step("entitlement_grant", false, {
      reason: activation.grantResult?.error || activation.reason || "grant_failed",
    }));
    return {
      ok: false,
      activationStatus: "failed",
      failedStep: "entitlement_grant",
      steps,
      signedIn: Boolean(actor?.profileId),
      hasAccess: false,
      planId: activation.planId,
      redirectTo: "/studio",
      stripeCheckoutEmail: activation.stripeCheckoutEmail || null,
    };
  }
  steps.push(step("entitlement_grant", true, { planId: activation.planId }));

  if (actor?.profileId) {
    const bound = await finalizeEntitlementBinding(actor.profileId, actor.profileEmail, stripeSession);
    if (bound.length) {
      activation.plans = bound;
      activation.plansCount = bound.length;
    }
    if (!bound.length) {
      activation = await activateBySessionId(sid, actor, lang);
    }
  }

  let plans = [];
  if (actor?.profileId) {
    const base = await getWorkspaceOverview(actor.profileId, actor.profileEmail, lang);
    plans = mapPlans(base, lang);
  }

  if (!plans.length && activation.plans?.length) {
    plans = mapPlans(
      {
        plans: activation.plans.map((p) => ({
          planId: p.plan_id || p.planId,
          grantedAt: p.granted_at,
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

  if (!plans.length && activation.planId && actor?.profileId) {
    plans = minimalPlan(activation.planId, lang);
  }

  if (!plans.length && !actor?.profileId) {
    const bySession = await listEntitlementsByStripeSession(sid);
    if (bySession.length) {
      plans = minimalPlan(bySession[0].plan_id, lang);
    }
  }

  const workspaceUnlocked =
    plans.length > 0 ||
    (Boolean(actor?.profileId) && grantOk && Boolean(activation.planId));

  if (!workspaceUnlocked && actor?.profileId) {
    steps.push(step("workspace_unlock", false, { plansCount: 0 }));
    return {
      ok: false,
      activationStatus: "failed",
      failedStep: "workspace_unlock",
      steps,
      signedIn: true,
      hasAccess: false,
      planId: activation.planId,
      fulfillmentOk: grantOk,
      redirectTo: "/studio",
      stripeCheckoutEmail: activation.stripeCheckoutEmail || null,
    };
  }

  steps.push(step("workspace_unlock", true, { plansCount: plans.length }));

  if (!actor?.profileId && grantOk) {
    steps.push(step("redirect", true, { target: "login" }));
    return {
      ok: true,
      activationStatus: "needs_sign_in",
      failedStep: null,
      steps,
      signedIn: false,
      needsSignIn: true,
      hasAccess: false,
      fulfillmentOk: true,
      planId: activation.planId,
      displayName: activation.displayName,
      plans: [],
      plansCount: 0,
      stripeCheckoutEmail: activation.stripeCheckoutEmail || null,
      redirectTo: `/login?next=${encodeURIComponent(`/studio?session_id=${encodeURIComponent(sid)}`)}`,
      activationComplete: false,
    };
  }

  steps.push(step("redirect", true, { target: "/studio" }));

  return {
    ok: true,
    activationStatus: "complete",
    failedStep: null,
    steps,
    signedIn: Boolean(actor?.profileId),
    needsSignIn: false,
    hasAccess: workspaceUnlocked,
    fulfillmentOk: grantOk,
    planId: activation.planId,
    displayName: activation.displayName,
    plans,
    plansCount: plans.length,
    stripeCheckoutEmail: activation.stripeCheckoutEmail || actor?.profileEmail || null,
    email: actor?.profileEmail || activation.stripeCheckoutEmail || null,
    redirectTo: "/studio",
    activationComplete: true,
    preload: activation.preload || { studio: "/studio" },
    activation: activation.activation || {
      paymentConfirmed: true,
      planActivated: true,
      workspaceReady: true,
      uploadsUnlocked: true,
      generationReady: true,
    },
    elapsedMs: Date.now() - startedAt,
  };
}

function buildPending(steps, actor, stripeSession, lang) {
  return {
    ok: false,
    activationStatus: "pending",
    failedStep: "timeout",
    steps,
    signedIn: Boolean(actor?.profileId),
    hasAccess: false,
    redirectTo: "/studio",
    stripeCheckoutEmail:
      stripeSession?.customer_details?.email || stripeSession?.customer_email || null,
  };
}

module.exports = { runCheckoutActivationPipeline, SERVER_BUDGET_MS };
