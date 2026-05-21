/**
 * Production-grade Stripe → entitlement → workspace activation (single source of truth).
 */
const { createStripeServerClient } = require("../marketing/stripe-server");
const { resolveStripePriceId } = require("../marketing/stripe-plan-map");
const {
  grantEntitlement,
  linkEntitlementsToProfile,
  listEntitlementsForUser,
  resolvePlanIdFromStripeSession,
  resolveGrantPlanId,
  listEntitlementsByStripeSession,
  isAllowedPlanId,
} = require("./entitlements-store");
const { getSqlClient, ensureEngagementSchema } = require("../shared/neon-memory");
const { provisionAfterPayment } = require("./post-purchase-provision");
const { markOnboarding } = require("./onboarding-journey");
const { upsertDeliveryStatus } = require("./workspace-store");
const { getDeliverableForPlan } = require("./deliverables-catalog");
const {
  buildLuxuryStages,
  activeConciergeMessage,
  progressPercent,
} = require("./activation-stages");

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function resolvePlanIdFromPriceId(priceId) {
  if (!priceId) return null;
  for (const planId of ["basic", "professional", "elite", "essential_advanced"]) {
    if (resolveStripePriceId(planId) === priceId) return planId;
  }
  return null;
}

async function resolvePlanIdFromSession(session, stripe) {
  let planId = resolvePlanIdFromStripeSession(session);
  if (planId) return planId;

  const meta = session?.metadata || {};
  const planIdsRaw = String(meta.plan_ids || meta.planIds || "");
  const firstPlan = planIdsRaw.split(",")[0]?.trim();
  if (isAllowedPlanId(firstPlan)) return firstPlan;
  const grantFromPlan = resolveGrantPlanId(firstPlan);
  if (grantFromPlan) return grantFromPlan;
  const sk = meta.bossmind_service_key || meta.service_key || "";
  if (sk) {
    try {
      const catalog = require("../../config/resumora-client-deliverables.json");
      if (catalog.serviceKeyToPlanId?.[sk]) return catalog.serviceKeyToPlanId[sk];
    } catch {
      /* ignore */
    }
  }

  if (stripe && session?.id) {
    try {
      const full = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["line_items.data.price"],
      });
      const priceId = full.line_items?.data?.[0]?.price?.id || full.line_items?.data?.[0]?.price;
      planId = resolvePlanIdFromPriceId(typeof priceId === "string" ? priceId : priceId?.id);
      if (planId) return planId;
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function linkEntitlementByStripeSession(profileId, stripeSessionId) {
  const sql = getSqlClient();
  if (!sql || !profileId || !stripeSessionId) return { linked: 0 };
  const rows = await sql.query(
    `UPDATE client_entitlements SET profile_id = $1::uuid, granted_at = NOW()
     WHERE stripe_session_id = $2 AND (profile_id IS NULL OR profile_id = $1::uuid)
     RETURNING id, plan_id`,
    [profileId, stripeSessionId]
  );
  return { linked: rows?.length ?? 0, plans: rows || [] };
}

async function bootstrapWorkspaceForPlan(profileId, planId, stripeSessionId) {
  if (!profileId || !planId) return { ok: false };
  await upsertDeliveryStatus({
    profileId,
    planId,
    status: "in_progress",
    message: "Workspace ready. Upload your documents to begin.",
    emailStatus: "queued",
    metadata: { stripeSessionId, bootstrappedAt: new Date().toISOString() },
  }).catch(() => {});
  return { ok: true };
}

/**
 * Activate entitlement after paid Stripe session — idempotent, binds profile + email + session.
 */
async function activateFromStripeSession(stripeSession, { profileId = null, profileEmail = null, lang = "en" } = {}) {
  if (!stripeSession?.id) return { ok: false, reason: "missing_session" };
  if (stripeSession.payment_status !== "paid") {
    return { ok: false, reason: "not_paid", paymentStatus: stripeSession.payment_status };
  }

  await ensureEngagementSchema();
  const { stripe } = createStripeServerClient();
  let planId = await resolvePlanIdFromSession(stripeSession, stripe);
  const purchasedPlanId =
    stripeSession?.metadata?.plan_id ||
    stripeSession?.metadata?.planId ||
    (String(stripeSession?.metadata?.plan_ids || "").split(",")[0] || "").trim() ||
    null;
  if (!planId && purchasedPlanId) planId = resolveGrantPlanId(purchasedPlanId);
  if (!planId) {
    return { ok: false, reason: "plan_id_unresolved", sessionId: stripeSession.id };
  }

  const stripeEmail = normalizeEmail(
    stripeSession.customer_details?.email ||
      stripeSession.customer_email ||
      stripeSession.metadata?.customer_email
  );
  const accountEmail = normalizeEmail(profileEmail);
  const emailForGrant = stripeEmail || accountEmail;

  let grantResult = await grantEntitlement({
    planId,
    profileId,
    customerEmail: emailForGrant,
    stripeSessionId: stripeSession.id,
    metadata: {
      ...(stripeSession.metadata || {}),
      amount_total: stripeSession.amount_total,
      currency: stripeSession.currency,
      activated_at: new Date().toISOString(),
      activation_source: "entitlement_activation",
      ...(purchasedPlanId && purchasedPlanId !== planId ? { purchased_plan_id: purchasedPlanId } : {}),
    },
  });

  if (profileId) {
    if (stripeEmail) await linkEntitlementsToProfile(profileId, stripeEmail);
    if (accountEmail && accountEmail !== stripeEmail) {
      await linkEntitlementsToProfile(profileId, accountEmail);
    }
    await linkEntitlementByStripeSession(profileId, stripeSession.id);
    grantResult = await grantEntitlement({
      planId,
      profileId,
      customerEmail: emailForGrant || accountEmail,
      stripeSessionId: stripeSession.id,
      metadata: stripeSession.metadata || {},
    });
  }

  if (grantResult?.ok) {
    await provisionAfterPayment(stripeSession, grantResult).catch(() => {});
  }

  const pid = profileId || grantResult?.entitlement?.profile_id;
  if (pid) {
    await markOnboarding(pid, {
      paymentCompleted: true,
      planSelected: true,
      activePlanId: planId,
      planActivatedAt: new Date().toISOString(),
    }).catch(() => {});
    await bootstrapWorkspaceForPlan(pid, planId, stripeSession.id);
  }

  let plans = profileId || pid ? await listEntitlementsForUser(pid || profileId, accountEmail || stripeEmail) : [];
  if ((profileId || pid) && !plans.length && stripeSession.id) {
    await linkEntitlementByStripeSession(pid || profileId, stripeSession.id);
    if (stripeEmail) await linkEntitlementsToProfile(pid || profileId, stripeEmail);
    plans = await listEntitlementsForUser(pid || profileId, accountEmail || stripeEmail);
  }
  if (!plans.length && stripeSession.id) {
    const bySession = await listEntitlementsByStripeSession(stripeSession.id);
    if (bySession.length) plans = bySession;
  }

  const deliverable = getDeliverableForPlan(planId, lang);
  const entitled = plans.length > 0;

  const activationFlags = {
    paymentConfirmed: true,
    planActivated: grantResult?.ok === true,
    workspaceReady: entitled || grantResult?.ok === true,
    uploadsUnlocked: entitled,
    generationReady: entitled,
    interviewToolkitReady: planId === "essential_advanced" && entitled,
  };
  const luxuryStages = buildLuxuryStages(activationFlags, 0, lang);
  return {
    ok: grantResult?.ok === true && (profileId || pid ? entitled : true),
    stripeCheckoutEmail: stripeEmail || null,
    planId,
    planActivated: grantResult?.ok === true,
    workspaceReady: Boolean(pid),
    plansCount: plans.length,
    plans,
    displayName: deliverable?.displayName || planId,
    studioPath: deliverable?.studioPath || "/studio",
    grantResult,
    activation: activationFlags,
    luxuryStages,
    conciergeMessage: activeConciergeMessage(luxuryStages, lang),
    progressPercent: progressPercent(activationFlags, 0),
    preload: {
      studio: "/studio",
      onboarding: `/api/client/onboarding?lang=${lang}`,
      essentialAdvanced: planId === "essential_advanced" ? "/studio/essential-advanced" : null,
    },
  };
}

async function activateBySessionId(sessionId, actor = {}, lang = "en") {
  const { stripe } = createStripeServerClient();
  if (!stripe) return { ok: false, reason: "stripe_unconfigured" };
  const session = await stripe.checkout.sessions.retrieve(String(sessionId));
  return activateFromStripeSession(session, {
    profileId: actor.profileId || null,
    profileEmail: actor.profileEmail || null,
    lang,
  });
}

async function retryActivateForActor(actor, { sessionId = null, email = null, lang = "en" } = {}) {
  const attempts = [];
  if (sessionId) {
    const a = await activateBySessionId(sessionId, actor, lang);
    attempts.push({ type: "session_id", ...a });
    if (a.ok) return { ok: true, attempts, result: a };
  }
  if (email || actor.profileEmail) {
    const norm = normalizeEmail(email || actor.profileEmail);
    if (actor.profileId && norm) {
      await linkEntitlementsToProfile(actor.profileId, norm);
      const plans = await listEntitlementsForUser(actor.profileId, norm);
      if (plans.length) {
        return {
          ok: true,
          attempts,
          result: { ok: true, plansCount: plans.length, plans, planId: plans[0]?.plan_id },
        };
      }
    }
  }
  return { ok: false, attempts };
}

module.exports = {
  activateFromStripeSession,
  activateBySessionId,
  retryActivateForActor,
  resolvePlanIdFromSession,
  linkEntitlementByStripeSession,
  bootstrapWorkspaceForPlan,
};
