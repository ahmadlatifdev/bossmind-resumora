const {
  auditStripeEnv,
  describeStripeBlockers,
} = require("../../../lib/marketing/stripe-env-audit");

/** Dev / diagnostics — no secrets. Gated OFF in production unless BOSSMIND_DIAGNOSTICS=1. */
export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const allow =
    process.env.NODE_ENV === "development" || process.env.BOSSMIND_DIAGNOSTICS === "1";
  if (!allow) {
    return res.status(404).json({ error: "Not found" });
  }

  const audit = auditStripeEnv();
  const blockers = describeStripeBlockers(audit);

  return res.status(200).json({
    project: "resumora",
    checkoutReady: audit.checkoutReady,
    webhookSigningReady: audit.webhookSigningReady,
    financialPipelineReady: audit.financialPipelineReady,
    keys: {
      secretKey: { configured: audit.secretKey.present, formatOk: audit.secretKey.formatOk },
      publishableKey: {
        configured: audit.publishableKey.present,
        formatOk: audit.publishableKey.formatOk,
      },
      webhookSecret: {
        configured: audit.webhookSecret.present,
        formatOk: audit.webhookSecret.formatOk,
      },
    },
    priceIdsOk: audit.priceIds,
    blockers,
  });
}
