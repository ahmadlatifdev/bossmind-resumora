require("../../../lib/shared/ensure-project-env");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { ensureEngagementSchema } = require("../../../lib/shared/neon-memory");
const { runActivationEngine } = require("../../../lib/client/activation-engine");
const { getWorkspaceOverview } = require("../../../lib/client/workspace-store");
const { getDeliverableForPlan } = require("../../../lib/client/deliverables-catalog");

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

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const lang = String(req.query.lang || req.body?.lang || "en").toLowerCase() === "fr" ? "fr" : "en";
  const sessionId = String(req.query.session_id || req.body?.session_id || "").trim();

  try {
    await ensureEngagementSchema();
    const actor = await readEngagementActor(req, res);

    console.info("[activate-plan] session_id_received", {
      sessionIdPrefix: sessionId ? sessionId.slice(0, 22) : null,
      signedIn: Boolean(actor?.profileId),
    });

    if (!sessionId) {
      return res.status(400).json({
        ok: false,
        error: "session_id_required",
        recoveryRequired: true,
      });
    }

    const payload = await runActivationEngine(actor, sessionId, { lang, maxAttempts: 2 });
    console.info("[activate-plan] entitlement_result", {
      activationSuccess: payload.activationSuccess === true,
      activationStatus: payload.activationStatus,
      failedStep: payload.failedStep || null,
      hasAccess: payload.hasAccess === true,
    });

    let plans = payload.plans || [];
    if (actor.profileId && !plans.length && payload.planId) {
      const base = await getWorkspaceOverview(actor.profileId, actor.profileEmail, lang);
      plans = mapPlans(base, lang);
    }

    const entitled = plans.length > 0 || payload.hasAccess === true;

    if (entitled) {
      console.info("[activate-plan] studio_unlocked", { planId: payload.planId || plans[0]?.planId });
    }

    const { logs, ...clientSafe } = payload;
    return res.status(200).json({
      ok: payload.ok !== false,
      ...clientSafe,
      signedIn: Boolean(actor.profileId),
      needsSignIn: payload.needsSignIn === true,
      hasAccess: entitled,
      plans,
      plansCount: Math.max(plans.length, payload.plansCount || 0),
      fulfillmentOk: payload.fulfillmentOk === true || entitled,
      activationSuccess: payload.activationSuccess === true,
      recoveryRequired: payload.recoveryRequired === true,
    });
  } catch (e) {
    console.error("[activate-plan] server_error", e.message);
    return res.status(500).json({
      ok: false,
      error: e.message || "activation_failed",
      recoveryRequired: true,
      failedStep: "server_error",
    });
  }
}
