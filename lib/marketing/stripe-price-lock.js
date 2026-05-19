/**
 * Resolve Stripe Price IDs from locked payment-links manifest when env vars are unset.
 */
const fs = require("fs");
const path = require("path");

let _lock = null;

function loadPaymentLinksLock() {
  if (_lock) return _lock;
  try {
    const p = path.join(__dirname, "../../config/resumora-stripe-payment-links-lock.json");
    _lock = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    _lock = null;
  }
  return _lock;
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
