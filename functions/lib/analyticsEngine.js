/**
 * Churn prediction + revenue analytics (Firestore-backed, memory fallback).
 */
const { listServiceEvents, listRefunds, PLAN_MILESTONES } = require('./serviceDelivery');

/** @type {Map<string, object>} */
const memoryAnalytics = new Map();

function getDb() {
  try {
    const { getFirestore } = require('firebase-admin/firestore');
    return getFirestore();
  } catch {
    return null;
  }
}

/**
 * Rule-based churn score (0–100). Replace with ML model when training data exists.
 */
async function predictChurnRisk({ customerId, subscriptionId, planId, serviceStatus }) {
  const events = await listServiceEvents(customerId, subscriptionId);
  const refunds = await listRefunds(customerId);
  const milestones = PLAN_MILESTONES[planId] || 2;
  const delivered = new Set(events.map((e) => e.event_type)).size;
  const progress = milestones > 0 ? delivered / milestones : 0;

  let score = 50;
  if (serviceStatus === 'NONE') score += 25;
  if (serviceStatus === 'PARTIAL' && progress < 0.5) score += 15;
  if (refunds.some((r) => r.status === 'failed')) score += 10;
  if (delivered >= milestones) score -= 30;
  if (events.length === 0) score += 20;

  score = Math.max(0, Math.min(100, score));
  const risk_level = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';

  return {
    churn_score: score,
    risk_level,
    signals: {
      service_status: serviceStatus,
      progress_ratio: progress,
      event_count: events.length,
      prior_refund_attempts: refunds.length,
    },
  };
}

/**
 * Revenue rollup from Refunds + plan catalog (placeholder MRR from static price map).
 */
const PLAN_CENTS = { basic: 2900, balanced: 4900, professional: 7900, advanced: 11000 };

async function computeRevenueAnalytics({ days = 30 } = {}) {
  const db = getDb();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  let refunds = [];

  if (db) {
    try {
      const snap = await db.collection('Refunds').where('timestamp', '>=', since).limit(500).get();
      refunds = snap.docs.map((d) => d.data());
    } catch (_) {
      /* fallback */
    }
  }

  const refundedCents = refunds.reduce((s, r) => s + Number(r.amount || 0), 0);
  const completed = refunds.filter((r) => r.status === 'completed').length;
  const failed = refunds.filter((r) => r.status === 'failed').length;

  const rollup = {
    period_days: days,
    refunds_count: refunds.length,
    refunded_total_cents: refundedCents,
    refunded_total_formatted: `$${(refundedCents / 100).toFixed(2)}`,
    refunds_completed: completed,
    refunds_failed: failed,
    estimated_mrr_cents: PLAN_CENTS.professional,
    net_revenue_signal_cents: Math.max(0, PLAN_CENTS.professional * 10 - refundedCents),
    generated_at: new Date().toISOString(),
  };

  memoryAnalytics.set(`revenue_${days}`, rollup);

  if (db) {
    try {
      const { FieldValue } = require('firebase-admin/firestore');
      await db
        .collection('RevenueAnalytics')
        .add({ ...rollup, createdAt: FieldValue.serverTimestamp() });
    } catch (_) {
      /* optional */
    }
  }

  return rollup;
}

module.exports = {
  predictChurnRisk,
  computeRevenueAnalytics,
  PLAN_CENTS,
};
