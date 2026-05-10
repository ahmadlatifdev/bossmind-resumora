const Stripe = require("stripe");
const {
  isPlanId,
  isValidPriceId,
  resolveStripePriceId,
} = require("../../lib/marketing/stripe-plan-map");

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({
      error: "Stripe is not configured. Set STRIPE_SECRET_KEY in your environment.",
      hint: "See .env.example for Resumora Stripe variables.",
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
