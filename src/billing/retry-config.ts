/**
 * Subscription retry defaults + Billing Portal configuration (TypeScript mirror).
 */
import Stripe from 'stripe';

export const SUBSCRIPTION_PAYMENT_SETTINGS = {
  collection_method: 'charge_automatically' as const,
  payment_settings: {
    save_default_payment_method: 'on_subscription' as const,
    payment_method_types: [
      'card',
      'link',
    ] as Stripe.SubscriptionCreateParams.PaymentSettings.PaymentMethodType[],
  },
};

export function buildSubscriptionParams(
  base: Stripe.SubscriptionCreateParams = {}
): Stripe.SubscriptionCreateParams {
  return {
    ...base,
    ...SUBSCRIPTION_PAYMENT_SETTINGS,
    payment_settings: {
      ...SUBSCRIPTION_PAYMENT_SETTINGS.payment_settings,
      ...(base.payment_settings || {}),
    },
  };
}

export async function ensureBillingPortalConfiguration(
  stripe: Stripe,
  idempotencyKey = 'resumora_billing_portal_v2_retention'
): Promise<Stripe.BillingPortal.Configuration> {
  const existing = await stripe.billingPortal.configurations.list({ limit: 20 });
  const match = existing.data.find((c) => c.metadata?.source === 'cursor_hands_free');

  const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
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
      business_profile: { headline: 'Manage your Resumora subscription' },
      features,
      metadata: { source: 'cursor_hands_free', version: 'v2' },
    },
    { idempotencyKey }
  );
}

export const DUNNING_SCHEDULE = {
  earlyRetries: 4,
  earlyWindowDays: 30,
  extendedRetries: 12,
  extendedWindowDays: 50,
  retryDays: [1, 3, 7, 14, 21, 30, 35, 40, 45, 47, 49, 50, 52, 54, 56, 58, 60],
} as const;
