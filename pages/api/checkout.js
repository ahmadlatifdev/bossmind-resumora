require("../../lib/shared/ensure-project-env");
const {
  isPlanId,
  isValidPriceId,
  resolveStripePriceId,
} = require("../../lib/marketing/stripe-plan-map");
const { pricingSetupHintForPlan } = require("../../lib/marketing/stripe-pricing-guard");
const { auditStripeEnv } = require("../../lib/marketing/stripe-env-audit");
const { createStripeServerClient } = require("../../lib/marketing/stripe-server");
const { checkoutMetadata } = require("../../lib/marketing/bossmind-brand-authority");
const { getFreeEditsCount } = require("../../lib/client/plan-policy");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { stripe, reason } = createStripeServerClient();
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
        hint: "Expected planId: basic | professional | elite | essential_advanced",
      });
    }

    let priceId = resolveStripePriceId(planId);
    if (!priceId && isValidPriceId(clientPriceId)) {
      priceId = clientPriceId.trim();
    }

    if (!priceId) {
      console.error("[Resumora Stripe][checkout] STRIPE_PRICE_ID_MISSING:", {
        planId,
        code: "STRIPE_PRICE_ID_MISSING",
      });
      return res.status(400).json({
        error: `No Stripe Price ID configured for plan "${planId}".`,
        hint: pricingSetupHintForPlan(planId),
        planId,
      });
    }

    if (!isValidPriceId(priceId)) {
      return res.status(400).json({
        error: "Invalid Stripe price id",
        hint: "Price IDs must look like price_xxxxxxxx",
      });
    }

    let stripePrice;
    try {
      stripePrice = await stripe.prices.retrieve(priceId);
    } catch (e) {
      console.error("[Resumora Stripe][checkout] STRIPE_PRICE_RETRIEVE_FAILED:", {
        planId,
        message: e?.message || String(e),
      });
      return res.status(400).json({
        error: "Unable to validate Stripe Price ID (not found or inaccessible).",
        hint: pricingSetupHintForPlan(planId),
        planId,
      });
    }

    if (stripePrice.type !== "one_time") {
      console.error("[Resumora Stripe][checkout] STRIPE_PRICE_NOT_ONE_TIME:", {
        planId,
        priceId,
        stripePriceType: stripePrice.type,
      });
      return res.status(400).json({
        error:
          "This Stripe Price is recurring/subscription; Resumora checkout requires one-time prices only.",
        hint: pricingSetupHintForPlan(planId),
        planId,
      });
    }

    const metaSlice = (v) => String(v ?? "").slice(0, 500);

    function quoteMetaFromSummary(summaryStr) {
      const extra = {};
      if (typeof summaryStr !== "string" || summaryStr.length < 3) return extra;
      try {
        const o = JSON.parse(summaryStr);
        if (typeof o.p === "number") extra.quote_page_count = metaSlice(Math.min(99, o.p));
        if (typeof o.svc === "string") extra.quote_service_key = metaSlice(o.svc);
        if (typeof o.t === "string") extra.quote_tier_hint = metaSlice(o.t);
        if (typeof o.est === "number") extra.quote_est_usd = metaSlice(Math.min(999999, o.est));
      } catch {
        /* non-JSON intake note */
      }
      return extra;
    }

    const summaryStr =
      typeof serviceDraftSummary === "string" ? serviceDraftSummary : "";
    /* One-time payment only — never subscription mode. */
    const brandMeta = checkoutMetadata({
      planId,
      planName,
      planPrice,
      utm: { utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign },
    });
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "payment",
      success_url: `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/cancel`,
      metadata: {
        ...Object.fromEntries(Object.entries(brandMeta).map(([k, v]) => [k, metaSlice(v)])),
        service_scope: metaSlice(summaryStr),
        free_edits: metaSlice(String(getFreeEditsCount(planId))),
        ...quoteMetaFromSummary(summaryStr),
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
