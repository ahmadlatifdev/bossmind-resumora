/**
 * Server-side Stripe webhook activation (no browser / no signed-in actor required).
 * Idempotent: safe to call from webhook retries and client activation in parallel.
 */
const { createStripeServerClient } = require("../marketing/stripe-server");
const { activateFromStripeSession } = require("./entitlement-activation");
const { listEntitlementsByStripeSession } = require("./entitlements-store");
const { getSqlClient, ensureEngagementSchema, saveEvent } = require("../shared/neon-memory");

const PROJECT_KEY = () => process.env.BOSSMIND_PROJECT_KEY || "resumora";

async function recordWebhookEvent(eventType, sessionId, payload = {}) {
  await saveEvent({
    projectKey: PROJECT_KEY(),
    eventType: `stripe_webhook.${eventType}`,
    severity: payload.ok === false ? "warn" : "info",
    source: "webhook-activation",
    eventKey: sessionId ? `webhook:${sessionId}:${eventType}` : undefined,
    payload: {
      sessionIdPrefix: sessionId ? String(sessionId).slice(0, 22) : null,
      ...payload,
    },
  }).catch(() => {});
}

/**
 * Activate entitlement from checkout.session.completed webhook payload.
 * @param {object} stripeSession - Stripe checkout session object from webhook
 */
async function runStripeWebhookActivation(stripeSession) {
  const sessionId = String(stripeSession?.id || "").trim();
  if (!sessionId) {
    return { ok: false, reason: "missing_session_id" };
  }

  if (stripeSession.payment_status !== "paid") {
    return {
      ok: false,
      reason: "not_paid",
      paymentStatus: stripeSession.payment_status,
      sessionId,
    };
  }

  await ensureEngagementSchema();

  const existing = await listEntitlementsByStripeSession(sessionId);
  if (existing.length > 0) {
    await recordWebhookEvent("activation_idempotent_skip", sessionId, {
      ok: true,
      planId: existing[0].plan_id,
      entitlementCount: existing.length,
    });
    return {
      ok: true,
      idempotent: true,
      planId: existing[0].plan_id,
      entitlementCount: existing.length,
      sessionId,
    };
  }

  let session = stripeSession;
  const { stripe } = createStripeServerClient();
  if (stripe) {
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["line_items.data.price", "customer_details"],
      });
    } catch (err) {
      console.error("[webhook-activation] session_retrieve_failed", {
        sessionIdPrefix: sessionId.slice(0, 22),
        message: err.message,
      });
    }
  }

  const activation = await activateFromStripeSession(session, {
    profileId: null,
    profileEmail: null,
    lang: "en",
  });

  const result = {
    ok: activation.ok === true,
    sessionId,
    planId: activation.planId || null,
    planActivated: activation.planActivated === true,
    reason: activation.reason || null,
    needsSignIn: !(activation.grantResult?.entitlement?.profile_id) && activation.planActivated,
  };

  if (activation.ok) {
    const sql = getSqlClient();
    if (sql) {
      await sql
        .query(
          `INSERT INTO client_checkout_activation (stripe_session_id, phase, plan_id, customer_email, logs)
           VALUES ($1, 'entitlement_created', $2, $3, $4::jsonb)
           ON CONFLICT (stripe_session_id) DO UPDATE SET
             phase = CASE
               WHEN client_checkout_activation.phase = 'completed' THEN client_checkout_activation.phase
               ELSE EXCLUDED.phase
             END,
             plan_id = COALESCE(client_checkout_activation.plan_id, EXCLUDED.plan_id),
             customer_email = COALESCE(client_checkout_activation.customer_email, EXCLUDED.customer_email),
             updated_at = NOW()`,
          [
            sessionId,
            activation.planId || null,
            activation.stripeCheckoutEmail || null,
            JSON.stringify([
              {
                phase: "webhook_entitlement_created",
                ok: true,
                at: new Date().toISOString(),
                source: "stripe_webhook",
              },
            ]),
          ]
        )
        .catch(() => {});
    }
  }

  await recordWebhookEvent("activation_result", sessionId, result);
  return result;
}

/**
 * Retry-safe webhook handler entry for checkout.session.completed.
 */
async function handleCheckoutSessionCompleted(session) {
  return runStripeWebhookActivation(session);
}

module.exports = {
  runStripeWebhookActivation,
  handleCheckoutSessionCompleted,
};
