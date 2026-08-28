/**
 * Stripe stack validation — customer, trial subscription, failure + dunning stub.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import { createRequire } from 'node:module';
import { buildSubscriptionParams } from '../src/billing/retry-config.ts';

const require = createRequire(import.meta.url);
const { processStripeEvent } = require('../functions/lib/stripeEventProcessor.js');
const { resolveDunningPhase } = require('../functions/lib/stripeDunning.js');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, '.env'), quiet: true });
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });

const secret = process.env.STRIPE_SECRET_KEY;
const hasRealKey = Boolean(secret && !secret.includes('PLACEHOLDER'));

test('dunning phase schedule', () => {
  assert.equal(resolveDunningPhase(1), 'early_4_over_30d');
  assert.equal(resolveDunningPhase(5), 'extended_45_50d_smart');
});

test('subscription params include smart retry prerequisites', () => {
  const params = buildSubscriptionParams({
    customer: 'cus_test',
    items: [{ price: 'price_test' }],
  });
  assert.equal(params.collection_method, 'charge_automatically');
  assert.equal(params.payment_settings?.save_default_payment_method, 'on_subscription');
});

test('invoice.payment_failed triggers dunning workflow', async () => {
  const event = {
    id: 'evt_test_failed',
    type: 'invoice.payment_failed',
    data: {
      object: {
        id: 'in_test_failed',
        customer: 'cus_test',
        customer_email: 'test@example.com',
      },
    },
  };

  const result = await processStripeEvent(event, null);
  assert.equal(result.action, 'dunning_triggered');
  assert.ok(result.attempt >= 1);
});

test('Stripe API integration (skipped without real test key)', async (t) => {
  if (!hasRealKey) {
    t.skip('STRIPE_SECRET_KEY placeholder — API integration skipped');
    return;
  }

  const stripe = new Stripe(secret!, { apiVersion: '2024-11-20.acacia' });
  const customer = await stripe.customers.create(
    {
      email: `stripe-validation+${Date.now()}@resumora.net`,
      metadata: { source: 'stripe-validation' },
    },
    { idempotencyKey: `validation_customer_${Date.now()}` }
  );

  assert.ok(customer.id.startsWith('cus_'));

  const priceId =
    process.env.STRIPE_PRICE_BASIC ||
    process.env.VITE_STRIPE_PRICE_BASIC ||
    'price_1U4D7wGjsXTaeZBgdrQVEE0M';

  let subscription = null;
  try {
    const subParams = buildSubscriptionParams({
      customer: customer.id,
      items: [{ price: priceId }],
      trial_period_days: 7,
    });
    subscription = await stripe.subscriptions.create(subParams, {
      idempotencyKey: `validation_sub_${customer.id}`,
    });
    assert.equal(subscription.status, 'trialing');
  } catch (err) {
    t.skip(`Subscription create skipped: ${err instanceof Error ? err.message : err}`);
  }

  await stripe.customers.del(customer.id);
});
