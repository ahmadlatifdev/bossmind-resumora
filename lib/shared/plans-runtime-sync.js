/**
 * Validate all Resumora plan metadata is synchronized (no secrets).
 */
const fs = require("fs");
const path = require("path");
const { ALLOWED_PLAN_IDS, resolveStripePriceId } = require("../marketing/stripe-plan-map");

const PLAN_IDS = ["basic", "professional", "elite", "essential_advanced"];

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
}

function auditPlansRuntime(env = process.env) {
  const deliverables = loadJson("config/resumora-client-deliverables.json");
  const paymentLinks = fs.existsSync(
    path.join(process.cwd(), "config/resumora-stripe-payment-links-lock.json")
  )
    ? loadJson("config/resumora-stripe-payment-links-lock.json")
    : null;

  const plans = {};
  for (const planId of PLAN_IDS) {
    const d = deliverables.plans?.[planId];
    const priceId = resolveStripePriceId(planId, env);
    const route = paymentLinks?.planRoutes?.[planId];
    plans[planId] = {
      deliverable: Boolean(d?.studioPath),
      studioPath: d?.studioPath || null,
      bilingual: Boolean(d?.displayName?.en && d?.displayName?.fr),
      stripePriceConfigured: Boolean(priceId),
      paymentLinkConfigured: Boolean(route?.paymentLinkUrl),
      paymentLinkTestMode: route?.paymentLinkUrl?.includes("/test_") || false,
    };
  }

  const allDeliverables = PLAN_IDS.every((p) => plans[p].deliverable);
  const allStripePrices = PLAN_IDS.every((p) => plans[p].stripePriceConfigured);
  const allPaymentLinks = PLAN_IDS.every((p) => plans[p].paymentLinkConfigured);

  return {
    ok: allDeliverables && allStripePrices,
    planIds: PLAN_IDS,
    plans,
    paymentLinksManifest: Boolean(paymentLinks),
    allDeliverables,
    allStripePrices,
    allPaymentLinks,
  };
}

module.exports = { PLAN_IDS, auditPlansRuntime };
