require("../../../lib/shared/ensure-project-env");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { ensureEngagementSchema } = require("../../../lib/shared/neon-memory");
const {
  activateBySessionId,
  retryActivateForActor,
} = require("../../../lib/client/entitlement-activation");
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

    if (sessionId) {
      console.info("[checkout-recovery] session_lookup", {
        sessionIdPrefix: sessionId.slice(0, 22),
        signedIn: Boolean(actor?.profileId),
      });
      const activation = await activateBySessionId(sessionId, actor, lang);
      const deliverable = activation.planId ? getDeliverableForPlan(activation.planId, lang) : null;
      const recovered = activation.ok || activation.plansCount > 0;
      const valid = activation.planActivated === true;
      console.info("[checkout-recovery] result", {
        recovered,
        valid,
        reason: activation.reason || null,
        planId: activation.planId || null,
      });
      return res.status(200).json({
        ok: true,
        recovered,
        valid,
        sessionInvalid: !valid && Boolean(activation.reason),
        failureReason: activation.reason || null,
        planId: activation.planId,
        studioPath: "/studio",
        continueUrl: recovered ? "/studio" : `/studio?recovery=session&session_id=${encodeURIComponent(sessionId)}`,
        displayName: deliverable?.displayName || activation.displayName,
        fulfillmentOk: activation.planActivated === true,
        hasAccess: activation.plansCount > 0,
        activation: activation.activation,
        needsSignIn: !actor?.profileId && (activation.planActivated || activation.paymentConfirmed),
        stripeCheckoutEmail: activation.stripeCheckoutEmail || null,
      });
    }

    if (emailLookup) {
      const retry = await retryActivateForActor(actor, { email: emailLookup, lang });
      const plans = retry.result?.plans || [];
      return res.status(200).json({
        ok: true,
        recovered: retry.ok,
        email: emailLookup,
        plans: plans.map((p) => ({
          planId: p.plan_id,
          studioPath: "/studio",
          displayName: getDeliverableForPlan(p.plan_id, lang)?.displayName || p.plan_id,
        })),
        continueUrl: plans.length ? "/studio" : "/pricing",
        activation: retry.result?.activation,
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
