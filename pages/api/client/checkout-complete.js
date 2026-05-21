require("../../../lib/shared/ensure-project-env");
const { readEngagementActor } = require("../../../lib/engagement/http-context");
const { runActivationEngine } = require("../../../lib/client/activation-engine");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Single authoritative post-checkout activation — server-side retries, state machine, structured logs.
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
    let payload = null;
    const serverAttempts = 3;

    for (let i = 1; i <= serverAttempts; i++) {
      payload = await runActivationEngine(actor, sessionId, { lang, maxAttempts: 1 });
      if (payload.activationSuccess || payload.activationStatus === "needs_sign_in") {
        break;
      }
      if (i < serverAttempts) await sleep(700 * i);
    }

    if (!payload.activationSuccess && payload.failedStep) {
      console.error("[checkout-complete] activation_incomplete", {
        sessionId: sessionId.slice(0, 22),
        phase: payload.phase,
        failedStep: payload.failedStep,
        signedIn: payload.signedIn,
      });
    }

    const { logs, failedStep, ...clientSafe } = payload;
    return res.status(200).json({
      ok: payload.ok !== false,
      ...clientSafe,
      activationStatus: payload.activationStatus,
      activationSuccess: payload.activationSuccess === true,
    });
  } catch (e) {
    console.error("[checkout-complete] server_error", e.message);
    return res.status(500).json({
      ok: false,
      activationStatus: "failed",
      activationSuccess: false,
      failedStep: "server_error",
      redirectTo: "/studio",
    });
  }
}
