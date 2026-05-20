/**
 * Resolve Stripe Price IDs from locked payment-links manifest when env vars are unset.
 * Uses static JSON import so it is safe in server + client bundles.
 */
let LOCK = null;
try {
  // eslint-disable-next-line global-require
  LOCK = require("../../config/resumora-stripe-payment-links-lock.json");
} catch {
  LOCK = null;
}

function loadPaymentLinksLock() {
  return LOCK;
}

/** @returns {Record<string, string>} planId -> price_xxx */
function priceIdsFromLock() {
  const lock = loadPaymentLinksLock();
  const out = {};
  if (!lock?.services) return out;
  for (const svc of lock.services) {
    const planId = (svc.planIds || [])[0];
    if (!planId || !svc.priceId) continue;
    if (!out[planId]) out[planId] = svc.priceId;
  }
  return out;
}

function resolveLockPriceId(planId) {
  const map = priceIdsFromLock();
  return map[planId] || "";
}

module.exports = { loadPaymentLinksLock, priceIdsFromLock, resolveLockPriceId };
