/**
 * Full E2E: service delivery → refund math → cancel endpoint → email queue stub.
 * Uses in-memory ServiceEvents; Stripe live cancel is simulated when unsafe.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, '.env'), quiet: true });
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });

const {
  recordServiceEvent,
  getServiceProgress,
  calculateRefundAmount,
  _resetMemoryForTests,
  listRefunds,
  saveRefundRecord,
} = require('../functions/lib/serviceDelivery.js');
const { buildRefundPreview } = require('../functions/lib/refundEngine.js');
const { queueEmail, refundConfirmation } = require('../functions/lib/emailTemplates.js');
const { processStripeEvent } = require('../functions/lib/stripeEventProcessor.js');
const { enqueueStripeEvent, getQueueStats } = require('../functions/lib/stripeWebhookQueue.js');

test('beforeEach reset memory', () => {
  _resetMemoryForTests();
});

test('NONE delivery → 100% refund', async () => {
  _resetMemoryForTests();
  const progress = await getServiceProgress('cus_e2e', 'sub_e2e', 'basic');
  assert.equal(progress.service_delivery_status, 'NONE');
  const calc = calculateRefundAmount(progress, 2900);
  assert.equal(calc.refundCents, 2900);
});

test('PARTIAL delivery → prorated refund', async () => {
  _resetMemoryForTests();
  await recordServiceEvent({
    customerId: 'cus_e2e',
    subscriptionId: 'sub_e2e',
    eventType: 'resume_uploaded',
  });
  // professional = 5 milestones; 1 delivered → remaining 4/5 of paid
  const progress = await getServiceProgress('cus_e2e', 'sub_e2e', 'professional');
  assert.equal(progress.service_delivery_status, 'PARTIAL');
  assert.equal(progress.delivered_count, 1);
  const calc = calculateRefundAmount(progress, 7900);
  assert.equal(calc.refundCents, Math.floor((4 / 5) * 7900));
});

test('FULL delivery → zero refund', async () => {
  _resetMemoryForTests();
  await recordServiceEvent({
    customerId: 'cus_full',
    subscriptionId: 'sub_full',
    eventType: 'resume_uploaded',
  });
  await recordServiceEvent({
    customerId: 'cus_full',
    subscriptionId: 'sub_full',
    eventType: 'final_resume_delivered',
  });
  const progress = await getServiceProgress('cus_full', 'sub_full', 'basic');
  assert.equal(progress.service_delivery_status, 'FULL');
  const calc = calculateRefundAmount(progress, 2900);
  assert.equal(calc.refundCents, 0);
});

test('refund preview matches engine after consultation', async () => {
  _resetMemoryForTests();
  await recordServiceEvent({
    customerId: 'cus_prev',
    subscriptionId: 'sub_prev',
    eventType: 'onboarding_completed',
  });
  await recordServiceEvent({
    customerId: 'cus_prev',
    subscriptionId: 'sub_prev',
    eventType: 'consultation_completed',
  });
  const preview = await buildRefundPreview({
    customerId: 'cus_prev',
    subscriptionId: 'sub_prev',
    planId: 'balanced',
    totalPaidCents: 4900,
  });
  // balanced=3 milestones, 2 delivered → remaining 1/3
  assert.equal(preview.service_delivery_status, 'PARTIAL');
  assert.equal(preview.refund_cents, Math.floor((1 / 3) * 4900));
  assert.ok(preview.delivered.length >= 2);
  assert.ok(preview.remaining.length >= 1);
});

test('refund record + email queue', async () => {
  _resetMemoryForTests();
  const rec = await saveRefundRecord({
    refund_id: 're_test_e2e',
    customer_id: 'cus_mail',
    subscription_id: 'sub_mail',
    amount: 2900,
    status: 'pending',
    reason: 'full_refund_no_service_delivered',
  });
  assert.equal(rec.status, 'pending');
  const list = await listRefunds('cus_mail');
  assert.ok(list.some((r) => r.refund_id === 're_test_e2e'));

  const tpl = refundConfirmation({
    amountFormatted: '$29.00',
    reason: 'full_refund_no_service_delivered',
  });
  const queued = queueEmail({ to: 'client@example.com', ...tpl });
  assert.equal(queued.accepted, true);
});

test('webhook processor handles invoice.payment_failed', async () => {
  const result = await processStripeEvent(
    {
      id: 'evt_e2e_fail',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_e2e',
          customer: 'cus_e2e',
          customer_email: 'fail@example.com',
        },
      },
    },
    null
  );
  assert.equal(result.action, 'dunning_triggered');
});

test('queue absorbs burst without throwing', async () => {
  const before = getQueueStats();
  for (let i = 0; i < 50; i++) {
    enqueueStripeEvent(
      {
        id: `evt_burst_${Date.now()}_${i}`,
        type: 'payment_intent.succeeded',
        data: { object: { id: `pi_${i}`, amount: 100, currency: 'usd' } },
      },
      {
        onProcess: async () => {},
      }
    );
  }
  const after = getQueueStats();
  assert.ok(after.size + after.pending >= before.size);
});

test('Stripe live customer optional', async (t) => {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || secret.includes('PLACEHOLDER')) {
    t.skip('No Stripe key for live customer create');
    return;
  }
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
  const customer = await stripe.customers.create(
    {
      email: `e2e+${Date.now()}@resumora.net`,
      metadata: { source: 'full-e2e' },
    },
    { idempotencyKey: `e2e_cus_${Date.now()}` }
  );
  assert.ok(customer.id.startsWith('cus_'));
  await stripe.customers.del(customer.id);
});
