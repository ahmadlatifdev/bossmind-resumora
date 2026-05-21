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
      const activation = await activateBySessionId(sessionId, actor, lang);
      const deliverable = activation.planId ? getDeliverableForPlan(activation.planId, lang) : null;
      return res.status(200).json({
        ok: true,
        recovered: activation.ok || activation.plansCount > 0,
        valid: activation.planActivated,
        planId: activation.planId,
        studioPath: "/studio",
        continueUrl: `/studio?checkout=success&session_id=${encodeURIComponent(sessionId)}`,
        displayName: deliverable?.displayName || activation.displayName,
        fulfillmentOk: activation.planActivated === true,
        hasAccess: activation.plansCount > 0,
        activation: activation.activation,
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
