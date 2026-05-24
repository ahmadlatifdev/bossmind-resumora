/**
 * Stripe webhook readiness probe (backend validation only — no secrets exposed).
 */
export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "method_not_allowed", allowed: "GET" });
  }

  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  const publishableKey = String(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "").trim();

  const stripeMode = secretKey.startsWith("sk_live_")
    ? "live"
    : secretKey.startsWith("sk_test_")
      ? "test"
      : secretKey
        ? "unknown"
        : "missing";

  const missing = [];
  if (!secretKey) missing.push("STRIPE_SECRET_KEY");
  if (!webhookSecret) missing.push("STRIPE_WEBHOOK_SECRET");

  const webhookReady = Boolean(webhookSecret && webhookSecret.startsWith("whsec_"));
  const commerceReady = Boolean(secretKey && publishableKey);

  const checkoutReadyStrict =
    commerceReady &&
    Boolean(process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC) &&
    Boolean(process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO) &&
    Boolean(process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE) &&
    Boolean(process.env.NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL_ADVANCED);

  return res.status(200).json({
    ok: webhookReady && Boolean(secretKey),
    webhookReady,
    commerceReady,
    checkoutReady: checkoutReadyStrict,
    checkoutReadyViaPaymentLinks: commerceReady,
    stripeMode,
    webhookEndpoint: "/api/webhooks/stripe",
    activationModule: "lib/client/webhook-activation.js",
    missingEnvKeys: missing,
    timestamp: Date.now(),
  });
}
