/**
 * Stripe webhook event handlers — fulfillment, dunning, revocation, CRM sync.
 * Idempotent (Firestore-backed event dedupe) + structured error logging.
 */
const { sendDunningEmail, resolveDunningPhase } = require('./stripeDunning');
const { dunningReminder, queueEmail } = require('./emailTemplates');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const PROCESSED_COLLECTION = 'stripe_processed_events';

/** @type {Map<string, number>} */
const invoiceFailureAttempts = new Map();

function emailConfig() {
  return {
    resendApiKey: process.env.RESEND_API_KEY || '',
    sendgridApiKey: process.env.SENDGRID_API_KEY || '',
    fromEmail: process.env.DUNNING_FROM_EMAIL || 'billing@resumora.net',
  };
}

function db() {
  return getFirestore();
}

/** Structured error log with Stripe context (feeds Cloud Logging / Error Reporting). */
function reportError(context, err) {
  console.error(
    '[stripe] error',
    JSON.stringify({
      scope: 'stripeWebhook',
      eventId: context.eventId || null,
      eventType: context.eventType || null,
      stripeCustomerId: context.stripeCustomerId || null,
      uid: context.uid || null,
      message: err && err.message ? err.message : String(err || 'unknown'),
    })
  );
}

/** Resolve Firebase UID from a Stripe object (session / charge / metadata). */
function resolveFirebaseUid(obj) {
  if (!obj) return null;
  const m = obj.metadata && typeof obj.metadata === 'object' ? obj.metadata : {};
  const val = String(
    obj.client_reference_id || m.firebaseUid || m.firebaseUID || m.uid || m.firebase_uid || ''
  ).trim();
  return val || null;
}

/** Persistent idempotency: has this Stripe event.id already been processed? */
async function isAlreadyProcessed(eventId) {
  if (!eventId) return false;
  try {
    const snap = await db().collection(PROCESSED_COLLECTION).doc(String(eventId)).get();
    return snap.exists;
  } catch (err) {
    // Fail-open: availability > strict dedupe (the grant itself is idempotent).
    reportError({ eventId }, err);
    return false;
  }
}

async function markProcessed(eventId, eventType) {
  if (!eventId) return;
  try {
    await db()
      .collection(PROCESSED_COLLECTION)
      .doc(String(eventId))
      .set(
        {
          eventId: String(eventId),
          type: eventType || null,
          processedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  } catch (err) {
    reportError({ eventId, eventType }, err);
  }
}

async function handlePaymentIntentSucceeded(event) {
  const pi = event.data.object;
  console.info('[stripe] payment_intent.succeeded', {
    id: pi.id,
    amount: pi.amount,
    currency: pi.currency,
    customer: pi.customer || null,
  });
  return { action: 'fulfillment_triggered', paymentIntentId: pi.id };
}

async function handleCheckoutSessionCompleted(event) {
  const session = event.data.object;
  console.info('[stripe] checkout.session.completed', {
    id: session.id,
    mode: session.mode,
    paymentStatus: session.payment_status || null,
    livemode: session.livemode,
    planId: session.metadata?.planId || null,
    customer: session.customer || null,
  });

  // Only grant premium access for genuinely paid payment/subscription sessions.
  if (session.mode !== 'payment' && session.mode !== 'subscription') {
    return { action: 'ignored', sessionId: session.id, reason: 'non_payment_mode' };
  }
  // Strict allow-list: entitlement is granted ONLY for paid (or no_payment_required)
  // sessions. An 'unpaid' (or missing) payment_status must never grant access.
  const paymentStatus = String(session.payment_status || '');
  if (paymentStatus !== 'paid' && paymentStatus !== 'no_payment_required') {
    console.warn('[stripe] refusing entitlement', {
      sessionId: session.id,
      paymentStatus: paymentStatus || '(missing)',
    });
    return {
      action: 'ignored',
      sessionId: session.id,
      reason: `payment_status=${paymentStatus || 'missing'}`,
    };
  }

  const uid = resolveFirebaseUid(session);
  if (!uid) {
    return { action: 'no_uid', sessionId: session.id, subscriptionActive: false };
  }

  // Mark subscription / customer as active in Firestore (webhook-only, verified paid).
  try {
    const { getFirestore } = require('firebase-admin/firestore');
    const { FieldValue } = require('firebase-admin/firestore');
    const db = getFirestore();
    await db
      .collection('users')
      .doc(String(uid))
      .set(
        {
          subscriptionStatus: 'active',
          entitlementState: 'active',
          hasActiveSubscription: true,
          paid: true,
          paymentStatus,
          stripeCustomerId: session.customer || null,
          stripeSubscriptionId: session.subscription || null,
          planId: session.metadata?.planId || null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    return { action: 'checkout_fulfilled', sessionId: session.id, uid, subscriptionActive: true };
  } catch (err) {
    console.error('[stripe] failed to mark active', err?.message || err);
    return { action: 'fulfillment_failed', sessionId: session.id, uid };
  }
}

async function handleSubscriptionUpdated(event) {
  const sub = event.data.object;
  console.info('[stripe] subscription.updated', {
    id: sub.id,
    status: sub.status,
    customer: sub.customer,
    planId: sub.metadata?.planId || null,
  });
  return { action: 'crm_sync', subscriptionId: sub.id, status: sub.status };
}

async function handleInvoicePaymentFailed(event, stripe) {
  const invoice = event.data.object;
  const prev = invoiceFailureAttempts.get(invoice.id) || 0;
  const attempt = prev + 1;
  invoiceFailureAttempts.set(invoice.id, attempt);

  let customerEmail = invoice.customer_email || '';
  if (!customerEmail && invoice.customer && stripe) {
    try {
      const customer = await stripe.customers.retrieve(String(invoice.customer));
      if (customer && !customer.deleted) customerEmail = customer.email || '';
    } catch (_) {
      /* optional */
    }
  }

  const phase = resolveDunningPhase(attempt);
  const emailResult = await sendDunningEmail({
    to: customerEmail,
    invoiceId: invoice.id,
    customerId: invoice.customer,
    attempt,
    phase,
    ...emailConfig(),
  });

  if (customerEmail) {
    const tpl = dunningReminder({ attempt, phase, invoiceId: invoice.id });
    queueEmail({ to: customerEmail, ...tpl });
  }

  console.info('[stripe] invoice.payment_failed', {
    invoiceId: invoice.id,
    attempt,
    phase,
    email: emailResult,
  });

  return { action: 'dunning_triggered', invoiceId: invoice.id, attempt, phase, emailResult };
}

/**
 * Revoke entitlements for a refunded / disputed charge.
 * Matches the Firebase user by uid (metadata) or stripeCustomerId.
 */
async function revokeEntitlement({ charge, reason, eventId, eventType }) {
  const customerId = charge && charge.customer ? String(charge.customer).trim() : null;
  const uid = resolveFirebaseUid(charge);
  let userRef = null;
  let matchedBy = '';

  try {
    if (uid) {
      userRef = db().collection('users').doc(String(uid));
      matchedBy = 'uid';
    } else if (customerId) {
      const snap = await db()
        .collection('users')
        .where('stripeCustomerId', '==', customerId)
        .limit(1)
        .get();
      if (!snap.empty) {
        userRef = snap.docs[0].ref;
        matchedBy = 'stripeCustomerId';
      }
    }
  } catch (err) {
    reportError({ eventId, eventType, stripeCustomerId: customerId, uid }, err);
    return { action: 'revoke_error', reason };
  }

  if (!userRef) {
    console.warn('[stripe] revoke skipped — no user match', {
      eventId,
      eventType,
      stripeCustomerId: customerId,
      uid,
      reason,
    });
    return { action: 'revoke_skipped', reason, stripeCustomerId: customerId, uid };
  }

  try {
    await userRef.set(
      {
        hasActiveSubscription: false,
        entitlementState: 'revoked',
        paid: false,
        subscriptionStatus: 'inactive',
        paymentStatus: reason === 'disputed' ? 'disputed' : 'refunded',
        planId: null,
        revokedAt: FieldValue.serverTimestamp(),
        revokedReason: reason,
      },
      { merge: true }
    );
    return { action: 'entitlement_revoked', reason, matchedBy, uid, stripeCustomerId: customerId };
  } catch (err) {
    reportError({ eventId, eventType, stripeCustomerId: customerId, uid }, err);
    return { action: 'revoke_failed', reason };
  }
}

async function handleChargeRefunded(event) {
  const charge = event.data.object;
  console.info('[stripe] charge.refunded', {
    chargeId: charge.id,
    customer: charge.customer || null,
    amountRefunded: charge.amount_refunded,
  });
  return revokeEntitlement({
    charge,
    reason: 'refunded',
    eventId: event.id,
    eventType: event.type,
  });
}

async function handleDisputeCreated(event, stripe) {
  const dispute = event.data.object;
  console.info('[stripe] charge.dispute.created', {
    disputeId: dispute.id,
    charge: dispute.charge || null,
  });

  let charge = null;
  if (dispute.charge && stripe) {
    try {
      charge = await stripe.charges.retrieve(String(dispute.charge));
    } catch (err) {
      reportError({ eventId: event.id, eventType: event.type }, err);
    }
  }
  if (!charge) {
    console.warn('[stripe] dispute without resolvable charge', { disputeId: dispute.id });
    return { action: 'revoke_skipped', reason: 'disputed', note: 'no charge object' };
  }
  return revokeEntitlement({
    charge,
    reason: 'disputed',
    eventId: event.id,
    eventType: event.type,
  });
}

async function dispatchStripeEvent(event, stripe) {
  switch (event.type) {
    case 'payment_intent.succeeded':
      return handlePaymentIntentSucceeded(event);
    case 'checkout.session.completed':
      return handleCheckoutSessionCompleted(event);
    case 'charge.refunded':
      return handleChargeRefunded(event);
    case 'charge.dispute.created':
      return handleDisputeCreated(event, stripe);
    case 'customer.subscription.updated':
    case 'subscription.updated':
      return handleSubscriptionUpdated(event);
    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(event, stripe);
    default:
      return { action: 'ignored', type: event.type };
  }
}

/**
 * Process a Stripe event exactly once (Firestore-backed dedupe) and never throw.
 * @param {import('stripe').Stripe.Event} event
 * @param {import('stripe').Stripe | null} [stripe]
 */
async function processStripeEvent(event, stripe = null) {
  const eventId = event && event.id;
  const eventType = event && event.type;
  if (!eventId) return { action: 'ignored', reason: 'missing_event_id' };

  try {
    if (await isAlreadyProcessed(eventId)) {
      return { action: 'deduplicated', eventId, eventType };
    }
  } catch (err) {
    reportError({ eventId, eventType }, err);
  }

  let result;
  try {
    result = await dispatchStripeEvent(event, stripe);
  } catch (err) {
    reportError({ eventId, eventType }, err);
    result = {
      action: 'error',
      eventId,
      eventType,
      message: err && err.message ? err.message : String(err),
    };
  }

  await markProcessed(eventId, eventType);
  return result;
}

module.exports = { processStripeEvent };
