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

  try {
    const actor = await readEngagementActor(req, res);
    const payload = await runCheckoutActivationPipeline(actor, { sessionId, lang });
    return res.status(200).json({ ok: payload.ok !== false, ...payload });
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
