require("../../../lib/shared/ensure-project-env");
const { createStripeServerClient } = require("../../../lib/marketing/stripe-server");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { ensureEngagementSchema, getSqlClient } = require("../../../lib/shared/neon-memory");
const {
  fulfillStripeCheckoutSession,
  resolvePlanIdFromStripeSession,
  linkEntitlementsToProfile,
  grantEntitlement,
  listEntitlementsForUser,
} = require("../../../lib/client/entitlements-store");
const { provisionAfterPayment } = require("../../../lib/client/post-purchase-provision");
const { markOnboarding } = require("../../../lib/client/onboarding-journey");
const { getDeliverableForPlan } = require("../../../lib/client/deliverables-catalog");
const { getStudioCheckoutSuccessUrl } = require("../../../lib/marketing/stripe-checkout-urls");

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const lang = String(req.query.lang || req.body?.lang || "en").toLowerCase() === "fr" ? "fr" : "en";
  const sessionId = String(req.query.session_id || req.body?.session_id || "").trim();
  const emailLookup = String(req.query.email || req.body?.email || "")
    .trim()
    .toLowerCase();

  try {
    await ensureEngagementSchema();
    const actor = await readEngagementActor(req, res);
    const sql = getSqlClient();

    if (sessionId) {
      const { stripe } = createStripeServerClient();
      if (!stripe) return res.status(503).json({ error: "stripe_unconfigured" });
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const valid = session.payment_status === "paid";
      let fulfillment = null;
      const planId = valid ? resolvePlanIdFromStripeSession(session) : null;
      const email =
        session.customer_details?.email ||
        session.customer_email ||
        actor.profileEmail ||
        null;

      if (valid) {
        fulfillment = await fulfillStripeCheckoutSession(session).catch(() => ({ ok: false }));
        if (actor.profileId && email) {
          await linkEntitlementsToProfile(actor.profileId, email).catch(() => {});
          if (planId) {
            await grantEntitlement({
              planId,
              profileId: actor.profileId,
              customerEmail: email,
              stripeSessionId: session.id,
              metadata: session.metadata || {},
            }).catch(() => {});
          }
        }
        if (fulfillment?.ok) {
          await provisionAfterPayment(session, fulfillment).catch(() => {});
          const pid = fulfillment.entitlement?.profile_id || actor.profileId;
          if (pid && planId) {
            await markOnboarding(pid, {
              paymentCompleted: true,
              planSelected: true,
              activePlanId: planId,
            }).catch(() => {});
          }
        }
      }

      const deliverable = planId ? getDeliverableForPlan(planId, lang) : null;
      return res.status(200).json({
        ok: true,
        recovered: valid,
        valid,
        planId,
        studioPath: "/studio",
        continueUrl: `/studio?checkout=success&session_id=${encodeURIComponent(sessionId)}`,
        displayName: deliverable?.displayName || planId,
        fulfillmentOk: fulfillment?.ok === true,
      });
    }

    if (emailLookup && sql) {
      const rows = await sql.query(
        `SELECT plan_id, profile_id, granted_at FROM client_entitlements
         WHERE LOWER(customer_email) = $1
         ORDER BY granted_at DESC LIMIT 5`,
        [emailLookup]
      );
      const entitlements = rows || [];
      if (actor.profileId) {
        await linkEntitlementsToProfile(actor.profileId, emailLookup).catch(() => {});
      }
      const plans = actor.profileId
        ? await listEntitlementsForUser(actor.profileId, emailLookup)
        : entitlements;
      return res.status(200).json({
        ok: true,
        recovered: plans.length > 0,
        email: emailLookup,
        plans: plans.map((p) => ({
          planId: p.plan_id,
          studioPath: "/studio",
          displayName: getDeliverableForPlan(p.plan_id, lang)?.displayName || p.plan_id,
        })),
        continueUrl: plans.length ? "/studio" : "/pricing",
      });
    }

    return res.status(400).json({
      error: "session_id_or_email_required",
      continueUrl: "/studio",
      studioSuccessUrl: getStudioCheckoutSuccessUrl(),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "recovery_failed", continueUrl: "/studio" });
  }
}
