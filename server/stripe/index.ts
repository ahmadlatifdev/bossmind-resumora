/**
 * Local Express: webhooks + billing APIs for cancel/refund (dev / E2E).
 */
import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { enqueueStripeEvent, getQueueStats } = require('../../functions/lib/stripeWebhookQueue.js');
const { processStripeEvent } = require('../../functions/lib/stripeEventProcessor.js');
const {
  recordServiceEvent,
  listRefunds,
  _resetMemoryForTests,
} = require('../../functions/lib/serviceDelivery.js');
const {
  buildRefundPreview,
  cancelSubscriptionWithRefund,
} = require('../../functions/lib/refundEngine.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });
dotenv.config({ path: path.join(root, 'functions', '.env'), quiet: true });

const PORT = Number(process.env.PORT || 3000);
const secret = process.env.STRIPE_SECRET_KEY || 'sk_test_PLACEHOLDER_REPLACE_WITH_REAL_KEY';
const webhookSecret =
  process.env.STRIPE_WEBHOOK_SECRET || 'whsec_PLACEHOLDER_REPLACE_WITH_REAL_SECRET';
const hasRealKey = Boolean(secret && !secret.includes('PLACEHOLDER'));

const stripe = hasRealKey ? new Stripe(secret, { apiVersion: '2024-11-20.acacia' }) : null;
const app = express();

app.get('/health', (_req, res) => {
  res.json({ ok: true, queue: getQueueStats(), stripe: hasRealKey });
});

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig || !webhookSecret || !stripe) {
    res.status(400).send('Missing signature, webhook secret, or Stripe key');
    return;
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Invalid'}`);
    return;
  }
  const result = enqueueStripeEvent(event, {
    onProcess: async (evt) => processStripeEvent(evt, stripe),
  });
  res.status(200).json({ received: true, eventId: event.id, ...result, queue: getQueueStats() });
});

app.use(express.json());

app.get('/api/refund-preview', async (req, res) => {
  try {
    const preview = await buildRefundPreview({
      customerId: String(req.query.customerId || 'cus_test'),
      subscriptionId: String(req.query.subscriptionId || 'sub_test'),
      planId: String(req.query.planId || 'basic'),
      totalPaidCents: Number(req.query.totalPaidCents || 2900),
    });
    res.json({ ok: true, ...preview });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'preview failed' });
  }
});

app.post('/api/cancel-subscription', async (req, res) => {
  try {
    const body = req.body || {};
    if (!stripe) {
      // Offline simulation for E2E without live Stripe cancel
      const preview = await buildRefundPreview({
        customerId: body.customerId || 'cus_test',
        subscriptionId: body.subscriptionId || 'sub_test',
        planId: body.planId || 'basic',
        totalPaidCents: body.totalPaidCents || 2900,
      });
      return res.json({
        ok: true,
        simulated: true,
        subscription_status: 'canceled',
        preview,
        refund: { amount: preview.refund_cents, status: 'completed', reason: preview.reason },
      });
    }
    const result = await cancelSubscriptionWithRefund(stripe, {
      customerId: body.customerId,
      subscriptionId: body.subscriptionId,
      planId: body.planId || 'basic',
      email: body.email,
      userId: body.userId,
      cancelAtPeriodEnd: Boolean(body.cancelAtPeriodEnd),
      totalPaidCents: body.totalPaidCents,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'cancel failed' });
  }
});

app.post('/api/service-event', async (req, res) => {
  try {
    const body = req.body || {};
    const event = await recordServiceEvent({
      customerId: body.customerId || body.customer_id,
      subscriptionId: body.subscriptionId || body.subscription_id || '',
      eventType: body.eventType || body.event_type,
      metadata: body.metadata || {},
      userId: body.userId || null,
    });
    res.json({ ok: true, event });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'record failed' });
  }
});

app.get('/api/refunds', async (req, res) => {
  const refunds = await listRefunds(String(req.query.customerId || ''), null);
  res.json({ ok: true, refunds });
});

/** Test-only reset */
app.post('/api/_test/reset', (_req, res) => {
  _resetMemoryForTests();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Stripe+billing server on http://localhost:${PORT} (webhook=/webhook)`);
});
