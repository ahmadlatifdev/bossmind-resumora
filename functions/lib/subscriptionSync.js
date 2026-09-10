/**
 * Sync Stripe subscription state → users / user_profiles / users/{uid}/stripe.
 * Preserves Resumora plan ids: basic | balanced | professional | advanced (+ free).
 */
'use strict';

const { getFirestore, FieldValue } = require('firebase-admin/firestore');

function normalizePlanId(raw) {
  const p = String(raw || '')
    .trim()
    .toLowerCase();
  if (['basic', 'balanced', 'professional', 'advanced', 'free'].includes(p)) return p;
  // Legacy aliases from Phase-7 paste scripts
  if (p === 'pro') return 'professional';
  if (p === 'enterprise') return 'advanced';
  return p || 'free';
}

/**
 * @param {{
 *   uid?: string|null,
 *   email?: string|null,
 *   planId?: string|null,
 *   subscriptionStatus?: string|null,
 *   stripeCustomerId?: string|null,
 *   stripeSubscriptionId?: string|null,
 * }} opts
 */
async function syncSubscriptionState(opts = {}) {
  const uid = opts.uid ? String(opts.uid).trim() : '';
  if (!uid) return { ok: false, reason: 'missing_uid' };

  const planId = normalizePlanId(opts.planId || 'free');
  const subscriptionStatus = String(opts.subscriptionStatus || 'inactive').toLowerCase();
  const active = ['active', 'trialing', 'paid'].includes(subscriptionStatus);
  const db = getFirestore();

  const payload = {
    planId,
    plan: planId,
    subscriptionStatus: active ? 'active' : subscriptionStatus || 'inactive',
    stripeCustomerId: opts.stripeCustomerId || null,
    stripeSubscriptionId: opts.stripeSubscriptionId || null,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (opts.email) payload.email = String(opts.email);

  await db.collection('users').doc(uid).set(payload, { merge: true });

  await db
    .collection('users')
    .doc(uid)
    .collection('stripe')
    .doc('subscription')
    .set(
      {
        ...payload,
        customerId: opts.stripeCustomerId || null,
        subscriptionId: opts.stripeSubscriptionId || null,
      },
      { merge: true }
    );

  await db
    .collection('user_profiles')
    .doc(uid)
    .set(
      {
        plan: planId,
        planId,
        subscriptionStatus: payload.subscriptionStatus,
        stripeCustomerId: opts.stripeCustomerId || null,
        lastActive: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  return { ok: true, uid, planId, subscriptionStatus: payload.subscriptionStatus };
}

module.exports = {
  syncSubscriptionState,
  normalizePlanId,
};
