const Stripe = require("stripe");
const {
  isPlanId,
  isValidPriceId,
  resolveStripePriceId,
} = require("../../lib/marketing/stripe-plan-map");
const { auditStripeEnv } = require("../../lib/marketing/stripe-env-audit");

function getStripeClient() {
  const trimmed = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!trimmed) return { stripe: null, reason: "missing_secret" };
  if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(trimmed)) {
    return { stripe: null, reason: "invalid_secret_format" };
  }
  try {
    return { stripe: new Stripe(trimmed), reason: "" };
  } catch {
    return { stripe: null, reason: "stripe_init_failed" };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { stripe, reason } = getStripeClient();
  if (!stripe) {
    const audit = auditStripeEnv();
    const hints =
      reason === "invalid_secret_format"
        ? ["STRIPE_SECRET_KEY must match sk_test_… or sk_live_… from the Stripe Dashboard (API keys)."]
        : reason === "stripe_init_failed"
          ? ["Stripe client failed to initialize; confirm the secret key copy has no stray spaces."]
          : [
              "Create .env.local in the repo root with STRIPE_SECRET_KEY (see .env.example).",
              "If using `npm run start`, the custom server loads .env.local automatically; restart after edits.",
              `Publishable + price readiness: checkoutReady=${audit.checkoutReady}`,
            ];
    return res.status(503).json({
      error:
        reason === "invalid_secret_format"
          ? "Stripe secret key format is invalid. Use sk_test_… or sk_live_…."
          : "Stripe is not configured. Set STRIPE_SECRET_KEY in your environment.",
      hint: hints.join(" "),
    });
  }

  try {
    const {
      priceId: clientPriceId,
      planId,
      planName,
      planPrice,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      serviceDraftSummary,
    } = req.body || {};

    if (!isPlanId(planId)) {
      return res.status(400).json({
        error: "Invalid or missing planId",
        hint: "Expected planId: basic | professional | elite",
      });
    }

    let priceId = resolveStripePriceId(planId);
    if (!priceId && isValidPriceId(clientPriceId)) {
      priceId = clientPriceId.trim();
    }

    if (!priceId) {
      return res.status(400).json({
        error: `No Stripe Price ID configured for plan "${planId}".`,
        hint: "Set STRIPE_PRICE_BASIC / STRIPE_PRICE_PROFESSIONAL / STRIPE_PRICE_ELITE or NEXT_PUBLIC_STRIPE_PRICE_* in .env.local, then restart.",
        planId,
      });
    }

    if (!isValidPriceId(priceId)) {
      return res.status(400).json({
        error: "Invalid Stripe price id",
        hint: "Price IDs must look like price_xxxxxxxx",
      });
    }

    const metaSlice = (v) => String(v ?? "").slice(0, 500);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "payment",
      success_url: `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/cancel`,
      metadata: {
        plan_id: metaSlice(planId),
        plan_name: metaSlice(planName),
        plan_price: metaSlice(planPrice),
        utm_source: metaSlice(utmSource),
        utm_medium: metaSlice(utmMedium),
        utm_campaign: metaSlice(utmCampaign),
        service_scope: metaSlice(typeof serviceDraftSummary === "string" ? serviceDraftSummary : ""),
      },
    });

    return res.status(200).json({ id: session.id });
  } catch (error) {
    console.error("Stripe Checkout Error:", error);

    return res.status(500).json({
      error: error.message || "Internal Server Error",
    });
  }
};
