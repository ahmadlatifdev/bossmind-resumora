require("../../../lib/shared/ensure-project-env");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { runCheckoutActivationPipeline } = require("../../../lib/client/checkout-activation-pipeline");

/**
 * Single authoritative post-checkout activation endpoint.
 * Returns activationStatus: complete | needs_sign_in | failed | pending
 * and failedStep for diagnostics.
 */
export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const lang = String(req.query.lang || req.body?.lang || "en").toLowerCase() === "fr" ? "fr" : "en";
  const sessionId = String(req.query.session_id || req.body?.session_id || "").trim();
  const attempt = Math.min(2, Math.max(1, parseInt(String(req.query.attempt || "1"), 10) || 1));

  try {
    const actor = await readEngagementActor(req, res);
    let payload = await runCheckoutActivationPipeline(actor, { sessionId, lang });

    const retriable =
      payload.activationStatus === "pending" ||
      payload.activationStatus === "failed" ||
      !payload.activationComplete;
    if (attempt === 2 && retriable && sessionId) {
      payload = await runCheckoutActivationPipeline(actor, { sessionId, lang, silentRetry: true });
    }

    if (payload.failedStep || payload.steps?.length) {
      console.info("[checkout-complete]", {
        sessionId: sessionId.slice(0, 20),
        attempt,
        activationStatus: payload.activationStatus,
        failedStep: payload.failedStep,
      });
    }

    const { steps, failedStep, ...clientSafe } = payload;
    return res.status(200).json({
      ok: payload.ok !== false,
      ...clientSafe,
      activationStatus: payload.activationStatus,
    });
  } catch (e) {
    console.error("[checkout-complete]", e.message);
    return res.status(500).json({
      ok: false,
      activationStatus: "failed",
      failedStep: "server_error",
      error: e.message || "checkout_complete_failed",
      steps: [{ step: "server_error", ok: false, error: e.message }],
      redirectTo: "/studio",
    });
  }
}
