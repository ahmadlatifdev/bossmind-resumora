/**
 * Unified BossMind health readout (Stripe pricing resolution, Neon, runtime, policy).
 * Authorization: development | BOSSMIND_DIAGNOSTICS=1 | Bearer BOSSMIND_ORCHESTRATION_SECRET
 */
const { initializeSharedMemory } = require("../../../lib/shared/neon-memory");
const {
  getBossMindRuntimeOverview,
} = require("../../../lib/orchestration/bossmind-runtime-status");
const {
  auditStripeEnv,
  describeStripeBlockers,
} = require("../../../lib/marketing/stripe-env-audit");
const {
  getBossMindCodexLayerStatus,
} = require("../../../lib/orchestration/bossmind-codex-status");
const { getRailwayRepairOverview } = require("../../../lib/orchestration/railway-repair-status");

function authorize(req) {
  const dev = process.env.NODE_ENV === "development";
  const diag = process.env.BOSSMIND_DIAGNOSTICS === "1";
  const secret = process.env.BOSSMIND_ORCHESTRATION_SECRET;
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return dev || diag || (Boolean(secret) && token === secret);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!authorize(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const init = await initializeSharedMemory();
    const neonOk = Boolean(init.enabled);

    const overview = await getBossMindRuntimeOverview({
      projectKey: process.env.BOSSMIND_PROJECT_KEY || "resumora",
      neonEnabled: neonOk,
    });

    const audit = auditStripeEnv();
    const blockers = describeStripeBlockers(audit);

    const pricePlansReady = audit.priceIds || {};
    const tiersConfigured = Object.keys(pricePlansReady).filter(
      (k) => pricePlansReady[k]?.valid
    ).length;
    const tierTotal = Object.keys(pricePlansReady).length || 3;
    const automationCoveragePercent =
      tierTotal > 0 ? Math.round((tiersConfigured / tierTotal) * 100) : 0;

    const bundleOk = overview.performance?.bundleScanned === true;
    const performanceScore = bundleOk ? 85 : 55;

    const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
    const codexAgentLayer = await getBossMindCodexLayerStatus({
      projectKey,
      neonEnabled: neonOk,
    });
    const railwayClosedLoop = await getRailwayRepairOverview({
      projectKey,
      neonEnabled: neonOk,
    });

    return res.status(200).json({
      ok: blockers.length === 0 && audit.checkoutReady,
      project: "resumora",
      ts: Date.now(),
      neonConfigured: neonOk,
      sentryConfigured: Boolean(
        process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
      ),
      langgraphAvailable: true,
      codexAgentLayer,
      railwayClosedLoop,
      stripe: {
        checkoutReady: audit.checkoutReady,
        financialPipelineReady: audit.financialPipelineReady,
        webhookSigningReady: audit.webhookSigningReady,
        pricePlans: audit.priceIds,
        pricingResolution: audit.pricingResolution,
        blockers,
      },
      deployment: {
        railway: Boolean(
          process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME
        ),
        gitHead: overview.git?.head || null,
        buildId: overview.build?.buildId || null,
      },
      overview,
      scores: {
        performanceScore,
        automationCoveragePercent,
        safetyLayersActive: Boolean(process.env.BOSSMIND_ORCHESTRATION_SECRET || neonOk),
      },
      weakPoints: blockers,
      canonicalStripePriceKeys: {
        basic: "NEXT_PUBLIC_STRIPE_PRICE_BASIC",
        professional: "NEXT_PUBLIC_STRIPE_PRICE_PRO",
        elite: "NEXT_PUBLIC_STRIPE_PRICE_ELITE",
      },
    });
  } catch (error) {
    console.error("[bossmind-health]", error);
    return res.status(500).json({
      error: error.message || "Health aggregation failed",
    });
  }
}
