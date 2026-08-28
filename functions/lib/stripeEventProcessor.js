/**
 * Stripe webhook event handlers — fulfillment, dunning, CRM sync.
 */
const { sendDunningEmail, resolveDunningPhase } = require('./stripeDunning');
const { dunningReminder, queueEmail } = require('./emailTemplates');

/** @type {Map<string, number>} */
const invoiceFailureAttempts = new Map();

function emailConfig() {
  return {
    resendApiKey: process.env.RESEND_API_KEY || '',
    sendgridApiKey: process.env.SENDGRID_API_KEY || '',
    fromEmail: process.env.DUNNING_FROM_EMAIL || 'billing@resumora.net',
  };
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
    planId: session.metadata?.planId || null,
    customer: session.customer || null,
  });

  // Mark subscription / customer as active in Firestore when possible
  try {
    const { getFirestore } = require('firebase-admin/firestore');
    const { FieldValue } = require('firebase-admin/firestore');
    const db = getFirestore();
    const uid = session.client_reference_id || session.metadata?.firebaseUid;
    if (uid) {
      await db
        .collection('users')
        .doc(String(uid))
        .set(
          {
            subscriptionStatus: 'active',
            stripeCustomerId: session.customer || null,
            stripeSubscriptionId: session.subscription || null,
            planId: session.metadata?.planId || null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    }
  } catch (_) {
    /* optional */
  }

  return { action: 'checkout_fulfilled', sessionId: session.id, subscriptionActive: true };
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
 * @param {import('stripe').Stripe.Event} event
 * @param {import('stripe').Stripe | null} [stripe]
 */
async function processStripeEvent(event, stripe = null) {
  switch (event.type) {
    case 'payment_intent.succeeded':
      return handlePaymentIntentSucceeded(event);
    case 'checkout.session.completed':
      return handleCheckoutSessionCompleted(event);
    case 'customer.subscription.updated':
    case 'subscription.updated':
      return handleSubscriptionUpdated(event);
    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(event, stripe);
    default:
      return { action: 'ignored', type: event.type };
  }
}

module.exports = { processStripeEvent };
