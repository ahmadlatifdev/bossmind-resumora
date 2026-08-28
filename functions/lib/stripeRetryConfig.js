/**
 * Subscription retry defaults + Billing Portal configuration.
 */

const SUBSCRIPTION_PAYMENT_SETTINGS = Object.freeze({
  collection_method: 'charge_automatically',
  payment_settings: {
    save_default_payment_method: 'on_subscription',
    payment_method_types: ['card', 'link'],
  },
});

/**
 * @param {import('stripe').Stripe} stripe
 * @param {object} [baseParams]
 */
function buildSubscriptionParams(baseParams = {}) {
  return {
    ...baseParams,
    ...SUBSCRIPTION_PAYMENT_SETTINGS,
    payment_settings: {
      ...SUBSCRIPTION_PAYMENT_SETTINGS.payment_settings,
      ...(baseParams.payment_settings || {}),
    },
  };
}

/**
 * @param {import('stripe').Stripe} stripe
 */
async function ensureBillingPortalConfiguration(stripe) {
  const idempotencyKey = 'resumora_billing_portal_v2_retention';

  const existing = await stripe.billingPortal.configurations.list({ limit: 20 });
  const match = existing.data.find((c) => c.metadata?.source === 'cursor_hands_free');

  const features = {
    customer_update: {
      enabled: true,
      allowed_updates: ['email', 'address', 'phone', 'tax_id'],
    },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      enabled: true,
      mode: 'at_period_end',
      cancellation_reason: {
        enabled: true,
        options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'],
      },
    },
  };

  if (match) {
    return stripe.billingPortal.configurations.update(
      match.id,
      { features, metadata: { source: 'cursor_hands_free', version: 'v2' } },
      { idempotencyKey: `${idempotencyKey}_update` }
    );
  }

  return stripe.billingPortal.configurations.create(
    {
      business_profile: {
        headline: 'Manage your Resumora subscription',
      },
      features,
      metadata: { source: 'cursor_hands_free', version: 'v2' },
    },
    { idempotencyKey }
  );
}

module.exports = {
  SUBSCRIPTION_PAYMENT_SETTINGS,
  buildSubscriptionParams,
  ensureBillingPortalConfiguration,
};
