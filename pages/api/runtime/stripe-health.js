export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "method_not_allowed",
      allowed: "GET",
    });
  }

  const keys = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
    NEXT_PUBLIC_STRIPE_PRICE_BASIC:
      process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC || "",
    NEXT_PUBLIC_STRIPE_PRICE_PRO:
      process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || "",
    NEXT_PUBLIC_STRIPE_PRICE_ELITE:
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE || "",
    NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL_ADVANCED:
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL_ADVANCED || "",
  };

  const masked = Object.fromEntries(
    Object.entries(keys).map(([key, value]) => [
      key,
      {
        present: Boolean(value),
        mode: value.startsWith("sk_live_") || value.startsWith("pk_live_") ? "live" :
              value.startsWith("sk_test_") || value.startsWith("pk_test_") ? "test" :
              value.startsWith("whsec_") ? "webhook_secret" :
              value.startsWith("price_") ? "price_id" :
              value ? "unknown" : "missing",
      },
    ])
  );

  const checkoutReady =
    masked.STRIPE_SECRET_KEY.present &&
    masked.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.present &&
    masked.NEXT_PUBLIC_STRIPE_PRICE_BASIC.present &&
    masked.NEXT_PUBLIC_STRIPE_PRICE_PRO.present &&
    masked.NEXT_PUBLIC_STRIPE_PRICE_ELITE.present &&
    masked.NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL_ADVANCED.present;

  const webhookReady =
    masked.STRIPE_WEBHOOK_SECRET.present &&
    masked.STRIPE_WEBHOOK_SECRET.mode === "webhook_secret";

  return res.status(200).json({
    ok: true,
    env: process.env.NODE_ENV || null,
    checkoutReady,
    webhookReady,
    stripe: masked,
  });
}