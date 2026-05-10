/**
 * Stripe webhook — verifies signature, logs financial events to Neon event_log (BossMind centralized tracking).
 * Configure endpoint in Stripe Dashboard + STRIPE_WEBHOOK_SECRET.
 */
const Stripe = require("stripe");
const { saveEvent } = require("../../../lib/shared/neon-memory");

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

export const config = {
  api: {
    bodyParser: false,
  },
};

function projectKey() {
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

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
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

  try {
    await saveEvent({
      projectKey: projectKey(),
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
