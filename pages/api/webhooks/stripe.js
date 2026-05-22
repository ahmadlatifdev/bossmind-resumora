import Stripe from "stripe";

export const config = {
  api: {
    bodyParser: false,
  },
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "method_not_allowed",
      allowed: "POST",
    });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey) {
    return res.status(503).json({
      ok: false,
      error: "missing_STRIPE_SECRET_KEY",
    });
  }

  if (!webhookSecret) {
    return res.status(503).json({
      ok: false,
      error: "missing_STRIPE_WEBHOOK_SECRET",
    });
  }

  const signature = req.headers["stripe-signature"];

  if (!signature) {
    return res.status(400).json({
      ok: false,
      error: "missing_stripe_signature",
    });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
  });

  let event;

  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: "stripe_signature_verification_failed",
      message: error.message,
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        console.log("STRIPE_CHECKOUT_COMPLETED", {
          sessionId: session.id,
          customerEmail: session.customer_details?.email || session.customer_email || null,
          paymentStatus: session.payment_status,
          amountTotal: session.amount_total,
          currency: session.currency,
          mode: session.mode,
          metadata: session.metadata || {},
        });

        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;

        console.log("STRIPE_PAYMENT_SUCCEEDED", {
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          status: paymentIntent.status,
        });

        break;
      }

      default: {
        console.log("STRIPE_EVENT_RECEIVED", {
          type: event.type,
          id: event.id,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      received: true,
      eventType: event.type,
      eventId: event.id,
    });
  } catch (error) {
    console.error("STRIPE_WEBHOOK_HANDLER_FAILED", error);

    return res.status(500).json({
      ok: false,
      error: "stripe_webhook_handler_failed",
      message: error.message,
    });
  }
}