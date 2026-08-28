/**
 * Apply Optimized Checkout, Payment Links, and Billing Portal via Stripe SDK.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import { createRequire } from 'node:module';
import { ensureBillingPortalConfiguration } from '../src/billing/retry-config.ts';

const require = createRequire(import.meta.url);
const {
  fetchDefaultPaymentMethodConfigurationId,
  createOptimizedPaymentLink,
  buildOptimizedCheckoutParams,
  resolveCurrency,
} = require('../functions/lib/stripeCheckoutOptimizations.js');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, '.env'), quiet: true });
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });
dotenv.config({ path: path.join(root, 'functions', '.env'), quiet: true });

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) {
  console.error('Missing STRIPE_SECRET_KEY');
  process.exit(1);
}

const stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
const mode = secret.startsWith('sk_live') ? 'live' : 'test';

const MASTER_PRICE =
  process.env.STRIPE_PRICE_BALANCED ||
  process.env.VITE_STRIPE_PRICE_BALANCED ||
  'price_1TYBCSGjsXTaeZBgt9c9wB02';

async function main() {
  const report: Record<string, unknown> = { mode, timestamp: new Date().toISOString() };

  const pmcId = await fetchDefaultPaymentMethodConfigurationId(stripe);
  report.paymentMethodConfigurationId = pmcId;

  const paymentLink = await createOptimizedPaymentLink(stripe, MASTER_PRICE, {
    idempotencyKey: 'cursor_checkout_master_link_v3_optimized',
  });
  report.paymentLinkId = paymentLink.id;
  report.paymentLinkUrl = paymentLink.url;

  let portalConfig;
  try {
    portalConfig = await ensureBillingPortalConfiguration(stripe);
    report.billingPortalConfigurationId = portalConfig.id;
  } catch (err) {
    report.billingPortalConfigurationError =
      err instanceof Error ? err.message : 'billing portal create failed';
  }

  const sampleSessionParams = buildOptimizedCheckoutParams(
    {
      mode: 'payment',
      line_items: [{ price: MASTER_PRICE, quantity: 1 }],
      success_url: 'https://resumora.net/pricing?checkout=success',
      cancel_url: 'https://resumora.net/pricing?checkout=canceled',
      metadata: { source: 'cursor_hands_free', version: 'v2_optimized' },
    },
    {
      paymentMethodConfigurationId: pmcId,
      currency: resolveCurrency({ locale: 'en-GB', country: 'GB' }),
    }
  );
  report.sampleCheckoutParams = {
    payment_method_types: sampleSessionParams.payment_method_types,
    automatic_tax: sampleSessionParams.automatic_tax,
    payment_method_options: sampleSessionParams.payment_method_options,
    currency: sampleSessionParams.currency,
    payment_method_configuration: sampleSessionParams.payment_method_configuration || null,
  };

  console.log('=== Stripe Checkout Optimizations ===');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
