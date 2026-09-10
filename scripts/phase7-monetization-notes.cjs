/**
 * Phase 7 notes — Resumora monetization (existing Stripe stack).
 *
 * Canonical plans remain: basic ($29) / balanced ($49) / professional ($79) / advanced ($110).
 * Free/Pro/Enterprise aliases map to free / professional / advanced in subscriptionSync.
 *
 * After merge + GHA deploy:
 * 1. Confirm Secret Manager: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 * 2. Stripe Dashboard webhook → https://resumora.net/api/webhook
 *    Events: checkout.session.completed, customer.subscription.updated,
 *            customer.subscription.deleted, invoice.payment_failed
 * 3. Optional: set video_registry.access_level = free|paid|enterprise
 */
'use strict';

module.exports = {
  plans: ['basic', 'balanced', 'professional', 'advanced'],
  webhookPath: '/api/webhook',
  billingPortalPath: '/api/billing-portal',
};
