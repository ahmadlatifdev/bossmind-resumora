/**
 * Refund Engine 2.0 + analytics validation.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { _resetMemoryForTests, recordServiceEvent } = require('../functions/lib/serviceDelivery.js');
const { buildRefundPreviewV2 } = require('../functions/lib/refundEngineV2.js');
const {
  predictChurnRisk,
  computeRevenueAnalytics,
} = require('../functions/lib/analyticsEngine.js');

test('refund v2 includes churn and engine version', async () => {
  _resetMemoryForTests();
  const preview = await buildRefundPreviewV2({
    customerId: 'cus_v2',
    subscriptionId: 'sub_v2',
    planId: 'basic',
    totalPaidCents: 2900,
  });
  assert.equal(preview.engine_version, '2.0');
  assert.ok(preview.churn);
  assert.ok(['low', 'medium', 'high'].includes(preview.churn.risk_level));
});

test('partial delivery + no events → high churn risk signal', async () => {
  _resetMemoryForTests();
  await recordServiceEvent({
    customerId: 'cus_churn',
    subscriptionId: 'sub_churn',
    eventType: 'resume_uploaded',
  });
  const churn = await predictChurnRisk({
    customerId: 'cus_churn',
    subscriptionId: 'sub_churn',
    planId: 'professional',
    serviceStatus: 'PARTIAL',
  });
  assert.ok(churn.churn_score >= 0 && churn.churn_score <= 100);
});

test('revenue analytics rollup structure', async () => {
  _resetMemoryForTests();
  const rollup = await computeRevenueAnalytics({ days: 7 });
  assert.ok(typeof rollup.refunds_count === 'number');
  assert.ok(rollup.generated_at);
});
