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
  const clientAttempt = Number(req.query.attempt || req.body?.attempt || 1) || 1;

  if (!sessionId) {
    console.error("[checkout-complete] missing_session_id");
    return res.status(400).json({
      ok: false,
      activationStatus: "failed",
      activationSuccess: false,
      failedStep: "missing_session_id",
      recoveryRequired: true,
    });
  }

  console.info("[checkout-complete] session_id_received", {
    sessionIdPrefix: sessionId.slice(0, 22),
    clientAttempt,
  });

  try {
    const actor = await readEngagementActor(req, res);
    console.info("[checkout-complete] user_resolved", {
      signedIn: Boolean(actor?.profileId),
      profileId: actor?.profileId ? String(actor.profileId).slice(0, 8) : null,
    });
    let payload = null;
    const serverAttempts = 3;

    for (let i = 1; i <= serverAttempts; i++) {
      payload = await runActivationEngine(actor, sessionId, { lang, maxAttempts: 1 });
      if (payload.activationSuccess || payload.activationStatus === "needs_sign_in") {
        break;
      }
      if (i < serverAttempts) await sleep(700 * i);
    }

    if (payload.logs?.length) {
      const failed = payload.logs.filter((e) => e.ok === false);
      if (failed.length) {
        console.error("[checkout-complete] activation_trace", {
          sessionId: sessionId.slice(0, 22),
          failedSteps: failed.map((e) => e.phase),
        });
      }
    }
    if (!payload.activationSuccess && payload.failedStep) {
      console.error("[checkout-complete] activation_incomplete", {
        sessionId: sessionId.slice(0, 22),
        phase: payload.phase,
        failedStep: payload.failedStep,
        signedIn: payload.signedIn,
        activationStatus: payload.activationStatus,
      });
    }

    const { logs, failedStep, ...clientSafe } = payload;
    const stripeLookup = logs?.find((e) => e.phase === "payment_verified");
    console.info("[checkout-complete] activation_result", {
      sessionIdPrefix: sessionId.slice(0, 22),
      activationStatus: payload.activationStatus,
      activationSuccess: payload.activationSuccess === true,
      failedStep: payload.failedStep || null,
      stripeLookupOk: stripeLookup?.ok,
      hasAccess: payload.hasAccess === true,
      signedIn: payload.signedIn === true,
    });
    if (payload.activationSuccess) {
      console.info("[checkout-complete] studio_unlocked", {
        planId: payload.planId || null,
        plansCount: payload.plansCount || payload.plans?.length || 0,
      });
    } else if (payload.failedStep) {
      console.error("[checkout-complete] failure_reason", {
        failedStep: payload.failedStep,
        activationStatus: payload.activationStatus,
      });
    }

    return res.status(200).json({
      ok: payload.ok !== false,
      ...clientSafe,
      activationStatus: payload.activationStatus,
      activationSuccess: payload.activationSuccess === true,
      recoveryRequired: payload.recoveryRequired === true,
      sessionInvalid: payload.sessionInvalid === true,
      clientAttempt,
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
