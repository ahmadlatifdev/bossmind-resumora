/**
 * Stripe webhook — verifies signature, logs financial events to Neon event_log (BossMind centralized tracking).
 * Configure endpoint in Stripe Dashboard + STRIPE_WEBHOOK_SECRET.
 */
const { createStripeServerClient } = require("../../../lib/marketing/stripe-server");
const {
  saveEvent,
  initializeSharedMemory,
  ensureEngagementSchema,
  getSqlClient,
} = require("../../../lib/shared/neon-memory");
const { fulfillStripeCheckoutSession } = require("../../../lib/client/entitlements-store");
const { provisionAfterPayment } = require("../../../lib/client/post-purchase-provision");

export const config = {
  api: {
    bodyParser: false,
  },
};

function bossmindProjectKey() {
  return process.env.BOSSMIND_PROJECT_KEY || "resumora";
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { stripe } = createStripeServerClient();
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  if (
    !stripe ||
    !secret ||
    !/^whsec_[A-Za-z0-9]+$/.test(secret)
  ) {
    return res.status(503).json({ error: "Stripe webhook is not configured" });
  }

  const sig = req.headers["stripe-signature"];
  if (!sig || typeof sig !== "string") {
    return res.status(400).json({ error: "Missing stripe-signature" });
  }

  let event;
  try {
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    console.error("stripe webhook verify:", e.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  await initializeSharedMemory().catch(() => {});
  await ensureEngagementSchema().catch(() => {});

  if (event.type === "checkout.session.completed") {
    try {
      const grant = await fulfillStripeCheckoutSession(event.data.object);
      if (grant?.ok) {
        await provisionAfterPayment(event.data.object, grant);
      }
    } catch (e) {
      console.error("checkout fulfillment:", e.message);
    }
  }

  try {
    const sql = getSqlClient();
    if (sql) {
      const dup = await sql.query(
        `SELECT 1 FROM event_log WHERE project_key = $1 AND event_key = $2 AND source = $3 LIMIT 1`,
        [bossmindProjectKey(), event.id, "stripe"]
      );
      if (Array.isArray(dup) && dup.length > 0) {
        return res.status(200).json({ received: true, duplicate: true });
      }
    }
  } catch (e) {
    console.error("stripe webhook dedupe check:", e.message);
  }

  try {
    await saveEvent({
      projectKey: bossmindProjectKey(),
      eventType: `stripe_webhook.${event.type}`,
      severity: event.type.includes("failed") ? "error" : "info",
      source: "stripe",
      eventKey: event.id,
      payload: {
        type: event.type,
        livemode: event.livemode,
        objectId: event.data?.object?.id,
        metadata: event.data?.object?.metadata,
        amount: event.data?.object?.amount_total ?? event.data?.object?.amount,
        currency: event.data?.object?.currency,
      },
    });
  } catch (e) {
    console.error("stripe webhook saveEvent:", e);
  }

  return res.status(200).json({ received: true });
}
