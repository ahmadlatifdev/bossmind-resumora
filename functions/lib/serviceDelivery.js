/**
 * Service delivery audit — Firestore ServiceEvents + Plans milestones.
 * In-memory fallback for local/E2E when Admin SDK is unavailable.
 */
const { FieldValue } = require('firebase-admin/firestore');

const EVENT_TYPES = Object.freeze([
  'resume_uploaded',
  'consultation_completed',
  'final_resume_delivered',
  'video_generated',
  'onboarding_completed',
]);

/** total_milestones per plan tier */
const PLAN_MILESTONES = Object.freeze({
  basic: 2,
  balanced: 3,
  professional: 5,
  advanced: 5,
  starter: 2,
  pro: 5,
  enterprise: 5,
});

const MILESTONE_LABELS = Object.freeze({
  resume_uploaded: 'Resume uploaded',
  consultation_completed: 'Consultation completed',
  final_resume_delivered: 'Final resume delivered',
  video_generated: 'Video generated',
  onboarding_completed: 'Onboarding completed',
});

/** @type {Map<string, object[]>} */
const memoryEvents = new Map();
/** @type {Map<string, object>} */
const memoryRefunds = new Map();

function memoryKey(customerId, subscriptionId) {
  return `${customerId || 'anon'}::${subscriptionId || 'none'}`;
}

function getDb() {
  try {
    const { getFirestore } = require('firebase-admin/firestore');
    return getFirestore();
  } catch {
    return null;
  }
}

function resolveTotalMilestones(planId) {
  const key = String(planId || 'basic').toLowerCase();
  return PLAN_MILESTONES[key] || PLAN_MILESTONES.basic;
}

/**
 * Insert a ServiceEvents row (Firestore or memory).
 */
async function recordServiceEvent({
  customerId,
  subscriptionId,
  eventType,
  metadata = {},
  userId = null,
}) {
  if (!EVENT_TYPES.includes(eventType)) {
    throw Object.assign(new Error(`Invalid event_type: ${eventType}`), { code: 'BAD_REQUEST' });
  }

  const row = {
    id: `sev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    customer_id: String(customerId || ''),
    subscription_id: String(subscriptionId || ''),
    user_id: userId || null,
    event_type: eventType,
    timestamp: new Date().toISOString(),
    metadata: metadata || {},
  };

  const db = getDb();
  if (db) {
    try {
      const ref = await db.collection('ServiceEvents').add({
        ...row,
        createdAt: FieldValue.serverTimestamp(),
      });
      row.id = ref.id;
    } catch (err) {
      console.warn('[serviceDelivery] Firestore write failed, using memory', err.message);
      const key = memoryKey(customerId, subscriptionId);
      const list = memoryEvents.get(key) || [];
      list.push(row);
      memoryEvents.set(key, list);
    }
  } else {
    const key = memoryKey(customerId, subscriptionId);
    const list = memoryEvents.get(key) || [];
    list.push(row);
    memoryEvents.set(key, list);
  }

  return row;
}

async function listServiceEvents(customerId, subscriptionId) {
  const db = getDb();
  if (db && customerId) {
    try {
      let q = db.collection('ServiceEvents').where('customer_id', '==', String(customerId));
      if (subscriptionId) {
        q = q.where('subscription_id', '==', String(subscriptionId));
      }
      const snap = await q.limit(100).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn('[serviceDelivery] Firestore read failed', err.message);
    }
  }
  return memoryEvents.get(memoryKey(customerId, subscriptionId)) || [];
}

/**
 * @returns {{ delivered_count, total_milestones, progress_percentage, service_delivery_status, delivered, remaining }}
 */
async function getServiceProgress(customerId, subscriptionId, planId = 'basic') {
  const events = await listServiceEvents(customerId, subscriptionId);
  const uniqueTypes = [...new Set(events.map((e) => e.event_type).filter(Boolean))];
  const total = resolveTotalMilestones(planId);
  const deliveredCount = Math.min(uniqueTypes.length, total);
  const progress = total > 0 ? Math.round((deliveredCount / total) * 100) : 0;

  let status = 'NONE';
  if (deliveredCount <= 0) status = 'NONE';
  else if (deliveredCount >= total) status = 'FULL';
  else status = 'PARTIAL';

  const allTypes = EVENT_TYPES.slice(0, total);
  const delivered = uniqueTypes.map((t) => ({
    event_type: t,
    label: MILESTONE_LABELS[t] || t,
  }));
  const remaining = allTypes
    .filter((t) => !uniqueTypes.includes(t))
    .map((t) => ({ event_type: t, label: MILESTONE_LABELS[t] || t }));

  return {
    delivered_count: deliveredCount,
    total_milestones: total,
    progress_percentage: progress,
    service_delivery_status: status,
    delivered,
    remaining,
    events,
  };
}

/**
 * Compute refund cents from progress + total paid.
 */
function calculateRefundAmount(progress, totalPaidCents) {
  const paid = Math.max(0, Math.floor(Number(totalPaidCents) || 0));
  const status = progress.service_delivery_status;
  if (status === 'NONE') {
    return { refundCents: paid, reason: 'full_refund_no_service_delivered', status };
  }
  if (status === 'FULL') {
    return { refundCents: 0, reason: 'no_refund_service_fully_delivered', status };
  }
  const remaining = Math.max(0, progress.total_milestones - progress.delivered_count);
  const refundCents = Math.floor((remaining / progress.total_milestones) * paid);
  return {
    refundCents,
    reason: 'prorated_partial_service',
    status,
    remaining_milestones: remaining,
  };
}

async function saveRefundRecord(record) {
  const row = {
    refund_id: record.refund_id || null,
    customer_id: record.customer_id,
    subscription_id: record.subscription_id || null,
    user_id: record.user_id || null,
    amount: record.amount,
    currency: record.currency || 'usd',
    status: record.status || 'pending',
    reason: record.reason || '',
    timestamp: new Date().toISOString(),
    stripe_refund_id: record.stripe_refund_id || null,
    charge_id: record.charge_id || null,
  };

  memoryRefunds.set(row.refund_id || `local_${Date.now()}`, row);

  const db = getDb();
  if (db) {
    try {
      await db.collection('Refunds').add({
        ...row,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.warn('[serviceDelivery] Refunds write failed', err.message);
    }
  }
  return row;
}

async function listRefunds(customerId, userId = null) {
  const db = getDb();
  if (db && (customerId || userId)) {
    try {
      let snap;
      if (customerId) {
        snap = await db
          .collection('Refunds')
          .where('customer_id', '==', String(customerId))
          .limit(50)
          .get();
      } else {
        snap = await db
          .collection('Refunds')
          .where('user_id', '==', String(userId))
          .limit(50)
          .get();
      }
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn('[serviceDelivery] Refunds read failed', err.message);
    }
  }
  return [...memoryRefunds.values()].filter(
    (r) => (customerId && r.customer_id === customerId) || (userId && r.user_id === userId)
  );
}

/** Test helper: clear memory stores */
function _resetMemoryForTests() {
  memoryEvents.clear();
  memoryRefunds.clear();
}

/** Seed Plans collection once (idempotent). */
async function ensurePlansSeeded() {
  const db = getDb();
  if (!db) return;
  try {
    const batch = db.batch();
    for (const [planId, total] of Object.entries(PLAN_MILESTONES)) {
      const ref = db.collection('Plans').doc(planId);
      batch.set(ref, { plan_id: planId, total_milestones: total }, { merge: true });
    }
    await batch.commit();
  } catch (err) {
    console.warn('[serviceDelivery] Plans seed skipped', err.message);
  }
}

module.exports = {
  EVENT_TYPES,
  PLAN_MILESTONES,
  MILESTONE_LABELS,
  resolveTotalMilestones,
  recordServiceEvent,
  listServiceEvents,
  getServiceProgress,
  calculateRefundAmount,
  saveRefundRecord,
  listRefunds,
  ensurePlansSeeded,
  _resetMemoryForTests,
};
