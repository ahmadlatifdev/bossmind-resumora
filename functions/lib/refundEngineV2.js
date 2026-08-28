/**
 * Refund Engine 2.0 — retention offers, churn-aware refund adjustments, audit trail.
 */
const { buildRefundPreview } = require('./refundEngine');
const { predictChurnRisk } = require('./analyticsEngine');
const { saveRefundRecord } = require('./serviceDelivery');

const RETENTION_DISCOUNT_BPS = 1500; // 15% retention credit on partial cancel

/**
 * Enhanced preview with churn score + optional retention offer.
 */
async function buildRefundPreviewV2(opts) {
  const base = await buildRefundPreview(opts);
  const churn = await predictChurnRisk({
    customerId: opts.customerId,
    subscriptionId: opts.subscriptionId,
    planId: opts.planId,
    serviceStatus: base.service_delivery_status,
  });

  let retentionOffer = null;
  if (
    base.service_delivery_status === 'PARTIAL' &&
    churn.risk_level === 'high' &&
    base.refund_cents > 0
  ) {
    const creditCents = Math.floor((base.refund_cents * RETENTION_DISCOUNT_BPS) / 10000);
    retentionOffer = {
      type: 'retention_credit',
      credit_cents: creditCents,
      credit_formatted: `$${(creditCents / 100).toFixed(2)}`,
      message: 'Stay on your plan and receive a one-time credit instead of cancelling.',
      adjusted_refund_cents: Math.max(0, base.refund_cents - creditCents),
    };
  }

  return {
    ...base,
    engine_version: '2.0',
    churn,
    retention_offer: retentionOffer,
    recommended_action:
      churn.risk_level === 'high' && retentionOffer
        ? 'offer_retention_before_refund'
        : base.refund_cents > 0
          ? 'process_refund'
          : 'cancel_no_refund',
  };
}

/**
 * Log v2 decision without exposing PII.
 */
async function logRefundDecisionV2(record) {
  return saveRefundRecord({
    ...record,
    reason: `[v2] ${record.reason || ''}`.trim(),
    metadata: {
      engine_version: '2.0',
      churn_risk: record.churnRisk || null,
      retention_offered: Boolean(record.retentionOffer),
    },
  });
}

module.exports = {
  buildRefundPreviewV2,
  logRefundDecisionV2,
  RETENTION_DISCOUNT_BPS,
};
