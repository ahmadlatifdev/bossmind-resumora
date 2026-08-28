/**
 * Checkout session optimization helpers (Link wallet, adaptive tax, 3DS, PMC).
 */

const SHIPPING_COUNTRIES = ['US', 'CA', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'IE', 'BE', 'AT', 'PT'];

const LOCALE_CURRENCY = {
  'en-US': 'usd',
  'en-GB': 'gbp',
  'en-CA': 'cad',
  'fr-FR': 'eur',
  'de-DE': 'eur',
  'es-ES': 'eur',
};

function resolveCurrency({ locale, country, fallback = 'usd' }) {
  if (country === 'GB') return 'gbp';
  if (country === 'CA') return 'cad';
  if (['DE', 'FR', 'ES', 'IT', 'NL', 'IE', 'BE', 'AT', 'PT'].includes(String(country || '')))
    return 'eur';
  if (locale && LOCALE_CURRENCY[locale]) return LOCALE_CURRENCY[locale];
  return fallback;
}

/**
 * @param {import('stripe').Stripe} stripe
 */
async function fetchDefaultPaymentMethodConfigurationId(stripe) {
  const list = await stripe.paymentMethodConfigurations.list({ limit: 20 });
  const active = list.data.find((c) => c.active) || list.data[0];
  return active ? active.id : null;
}

/**
 * Build optimized Checkout Session params (merge-safe).
 * @param {object} base
 * @param {{ paymentMethodConfigurationId?: string | null, currency?: string }} opts
 */
function buildOptimizedCheckoutParams(base, opts = {}) {
  const params = {
    ...base,
    allow_promotion_codes: base.allow_promotion_codes ?? true,
    payment_method_types: ['card', 'link'],
    automatic_tax: { enabled: true },
    payment_method_options: {
      card: { request_three_d_secure: 'automatic' },
    },
  };

  if (base.mode === 'subscription' || base.mode === 'setup') {
    params.payment_method_collection = 'if_required';
  }

  if (opts.paymentMethodConfigurationId) {
    params.payment_method_configuration = opts.paymentMethodConfigurationId;
  }
  if (opts.currency) {
    params.currency = opts.currency;
  }

  return params;
}

/**
 * @param {import('stripe').Stripe} stripe
 * @param {string} priceId
 * @param {object} [opts]
 */
async function createOptimizedPaymentLink(stripe, priceId, opts = {}) {
  const idempotencyKey = opts.idempotencyKey || 'resumora_master_payment_link_v2_optimized';

  const price = await stripe.prices.retrieve(priceId);
  const isRecurring = price.type === 'recurring';

  const existing = await stripe.paymentLinks.list({ limit: 100 });
  const match = existing.data.find(
    (pl) =>
      pl.metadata?.source === 'cursor_hands_free' &&
      pl.metadata?.version === 'v2_optimized' &&
      pl.active
  );

  const linkParams = {
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    payment_method_types: ['card', 'link'],
    shipping_address_collection: { allowed_countries: SHIPPING_COUNTRIES },
    metadata: { source: 'cursor_hands_free', version: 'v2_optimized', priceType: price.type },
    after_completion: {
      type: 'redirect',
      redirect: { url: 'https://resumora.net/pricing?checkout=success' },
    },
  };

  if (isRecurring) {
    linkParams.payment_method_collection = 'if_required';
  }

  if (match) {
    const updateParams = {
      allow_promotion_codes: true,
      payment_method_types: ['card', 'link'],
      shipping_address_collection: { allowed_countries: SHIPPING_COUNTRIES },
      metadata: { source: 'cursor_hands_free', version: 'v2_optimized', priceType: price.type },
      after_completion: {
        type: 'redirect',
        redirect: { url: 'https://resumora.net/pricing?checkout=success' },
      },
    };
    if (isRecurring) updateParams.payment_method_collection = 'if_required';
    return stripe.paymentLinks.update(match.id, updateParams, {
      idempotencyKey: `${idempotencyKey}_update_v4`,
    });
  }

  return stripe.paymentLinks.create(linkParams, { idempotencyKey });
}

module.exports = {
  SHIPPING_COUNTRIES,
  resolveCurrency,
  fetchDefaultPaymentMethodConfigurationId,
  buildOptimizedCheckoutParams,
  createOptimizedPaymentLink,
};
