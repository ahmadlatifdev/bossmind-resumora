/** Lightweight liveness probe for dev preview status / orchestration. */

require("../../lib/shared/ensure-project-env");
const { probeDatabaseConnection } = require("../../lib/shared/neon-memory");
const { auditStripeProductionState } = require("../../lib/marketing/stripe-env-audit");
const { auditPlansRuntime } = require("../../lib/shared/plans-runtime-sync");
const { databaseRecoveryHint } = require("../../lib/shared/database-resilience");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false });
  }

  const mem = process.memoryUsage();
  const database = await probeDatabaseConnection();
  const stripe = auditStripeProductionState();
  const plans = auditPlansRuntime();
  const ok = database.ok;
  const commerceReady = stripe.checkoutReady && plans.allPaymentLinks;
  const essentialAdvancedReady =
    plans.plans?.essential_advanced?.stripePriceConfigured &&
    plans.plans?.essential_advanced?.paymentLinkConfigured &&
    plans.plans?.essential_advanced?.deliverable;

  return res.status(ok ? 200 : 503).json({
    ok,
    env: process.env.NODE_ENV || "development",
    port: process.env.PORT || null,
    render: Boolean(process.env.RENDER),
    gitCommit: process.env.RENDER_GIT_COMMIT || process.env.RENDER_GIT_COMMIT_SHA || null,
    gitBranch: process.env.RENDER_GIT_BRANCH || null,
    ts: Date.now(),
    uptime: process.uptime(),
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    database,
    stripe: {
      checkoutReady: stripe.checkoutReady,
      financialPipelineReady: stripe.financialPipelineReady,
      mode: stripe.sandboxLiveConsistent?.mode || null,
      operational: stripe.operational || null,
    },
    commerceReady,
    essentialAdvanced: {
      ready: essentialAdvancedReady,
      studioPath: plans.plans?.essential_advanced?.studioPath || "/studio/essential-advanced",
      stripePriceConfigured: plans.plans?.essential_advanced?.stripePriceConfigured,
      paymentLinkConfigured: plans.plans?.essential_advanced?.paymentLinkConfigured,
    },
    plans: {
      ok: plans.ok || commerceReady,
      allDeliverables: plans.allDeliverables,
      allStripePrices: plans.allStripePrices,
      allPaymentLinks: plans.allPaymentLinks,
      plans: plans.plans,
    },
    recoveryHint: ok ? null : databaseRecoveryHint(database.reason),
    monitoring: "/api/runtime/database-health",
  });
}
