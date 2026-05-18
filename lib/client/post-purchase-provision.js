const { saveEvent, upsertTaskState, getSqlClient } = require("../shared/neon-memory");
const { resolvePlanIdFromStripeSession } = require("./entitlements-store");
const { getDeliverableForPlan } = require("./deliverables-catalog");

function projectKey() {
  return process.env.BOSSMIND_PROJECT_KEY || "resumora";
}

async function notifyPostPurchaseWebhook(payload) {
  const url = String(process.env.RESUMORA_POST_PURCHASE_WEBHOOK_URL || "").trim();
  if (!url.startsWith("https://")) return { sent: false, reason: "webhook_unset" };

  const secret = process.env.RESUMORA_POST_PURCHASE_WEBHOOK_SECRET || "";
  const headers = { "Content-Type": "application/json" };
  if (secret) headers.Authorization = `Bearer ${secret}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    return { sent: res.ok, status: res.status };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

/**
 * After Stripe payment: Neon audit, optional n8n/email webhook, task_state for concierge.
 */
async function provisionAfterPayment(session, grantResult) {
  const planId = resolvePlanIdFromStripeSession(session);
  const deliverable = planId ? getDeliverableForPlan(planId) : null;
  const email =
    session.customer_details?.email ||
    session.customer_email ||
    session.metadata?.customer_email ||
    "";

  const payload = {
    planId,
    email: email ? `${email.slice(0, 3)}***` : null,
    sessionId: session.id,
    grantOk: grantResult?.ok === true,
    studioPath: deliverable?.studioPath || "/studio",
    langHint: session.metadata?.lang || "en",
    amountTotal: session.amount_total,
    currency: session.currency,
    ts: new Date().toISOString(),
  };

  const sql = getSqlClient();
  if (sql) {
    await saveEvent({
      projectKey: projectKey(),
      eventType: "post_purchase.provisioned",
      severity: "info",
      source: "post-purchase-provision",
      eventKey: `provision:${session.id}`,
      payload: {
        planId,
        grantOk: grantResult?.ok === true,
        studioPath: payload.studioPath,
      },
    }).catch(() => {});

    await upsertTaskState({
      projectKey: projectKey(),
      taskKey: `post_purchase:${session.id}`,
      status: "completed",
      assignedAgent: "stripe-fulfillment",
      payload: {
        planId,
        customerEmail: email,
        studioPath: payload.studioPath,
        deliverableFeatures: deliverable?.features || {},
      },
    }).catch(() => {});
  }

  const webhook = await notifyPostPurchaseWebhook({
    event: "resumora.post_purchase",
    planId,
    customerEmail: email,
    stripeSessionId: session.id,
    studioUrl: payload.studioPath,
    deliverable,
  });

  return { ok: true, planId, webhook, studioPath: payload.studioPath };
}

module.exports = { provisionAfterPayment, notifyPostPurchaseWebhook };
