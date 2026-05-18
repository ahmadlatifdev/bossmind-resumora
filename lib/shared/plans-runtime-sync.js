/**
 * Validate all Resumora plan metadata is synchronized (no secrets).
 * Uses static JSON imports — safe for Turbopack production bundles (no process.cwd fs scans).
 */
const { ALLOWED_PLAN_IDS, resolveStripePriceId } = require("../marketing/stripe-plan-map");
const { auditFreeEditsPolicy, getFreeEditsCount } = require("../client/plan-policy");

const deliverables = require("../../config/resumora-client-deliverables.json");

let paymentLinksLock = null;
try {
  paymentLinksLock = require("../../config/resumora-stripe-payment-links-lock.json");
} catch {
  paymentLinksLock = null;
}

const PLAN_IDS = ["basic", "professional", "elite", "essential_advanced"];

function auditPlansRuntime(env = process.env) {
  const plans = {};
  for (const planId of PLAN_IDS) {
    const d = deliverables.plans?.[planId];
    const priceId = resolveStripePriceId(planId, env);
    const route = paymentLinksLock?.planRoutes?.[planId];
    plans[planId] = {
      deliverable: Boolean(d?.studioPath),
      studioPath: d?.studioPath || null,
      bilingual: Boolean(d?.displayName?.en && d?.displayName?.fr),
      freeEdits: d?.freeEdits ?? getFreeEditsCount(planId),
      stripePriceConfigured: Boolean(priceId),
      paymentLinkConfigured: Boolean(route?.paymentLinkUrl),
      paymentLinkTestMode: route?.paymentLinkUrl?.includes("/test_") || false,
    };
  }

  const allDeliverables = PLAN_IDS.every((p) => plans[p].deliverable);
  const allStripePrices = PLAN_IDS.every((p) => plans[p].stripePriceConfigured);
  const allPaymentLinks = PLAN_IDS.every((p) => plans[p].paymentLinkConfigured);
  const freeEditsAudit = auditFreeEditsPolicy();

  return {
    ok: allDeliverables && allStripePrices && freeEditsAudit.ok,
    planIds: PLAN_IDS,
    plans,
    paymentLinksManifest: Boolean(paymentLinksLock),
    allDeliverables,
    allStripePrices,
    allPaymentLinks,
    freeEditsAudit,
  };
}

module.exports = { PLAN_IDS, auditPlansRuntime };
