/**
 * Stripe webhook event handlers — fulfillment, dunning, CRM sync.
 */
const { sendDunningEmail, resolveDunningPhase } = require('./stripeDunning');
const { dunningReminder, queueEmail } = require('./emailTemplates');
const { syncSubscriptionState } = require('./subscriptionSync');

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

  const uid = session.client_reference_id || session.metadata?.firebaseUid || session.metadata?.uid;
  await syncSubscriptionState({
    uid,
    email: session.customer_details?.email || session.customer_email || null,
    planId: session.metadata?.planId || 'basic',
    subscriptionStatus: 'active',
    stripeCustomerId: session.customer || null,
    stripeSubscriptionId: session.subscription || null,
  });

  return { action: 'checkout_fulfilled', sessionId: session.id, subscriptionActive: true, uid };
}

async function handleSubscriptionUpdated(event) {
  const sub = event.data.object;
  console.info('[stripe] subscription.updated', {
    id: sub.id,
    status: sub.status,
    customer: sub.customer,
    planId: sub.metadata?.planId || null,
  });

  const uid = sub.metadata?.firebaseUid || sub.metadata?.uid || null;
  if (uid) {
    const active = sub.status === 'active' || sub.status === 'trialing';
    await syncSubscriptionState({
      uid,
      planId: active ? sub.metadata?.planId || 'basic' : 'free',
      subscriptionStatus: sub.status,
      stripeCustomerId: sub.customer || null,
      stripeSubscriptionId: sub.id,
    });
  }

  return { action: 'crm_sync', subscriptionId: sub.id, status: sub.status };
}

async function handleSubscriptionDeleted(event) {
  const sub = event.data.object;
  const uid = sub.metadata?.firebaseUid || sub.metadata?.uid || null;
  console.info('[stripe] customer.subscription.deleted', { id: sub.id, uid });
  if (uid) {
    await syncSubscriptionState({
      uid,
      planId: 'free',
      subscriptionStatus: 'inactive',
      stripeCustomerId: sub.customer || null,
      stripeSubscriptionId: sub.id,
    });
  }
  return { action: 'downgraded_to_free', subscriptionId: sub.id, uid };
}

async function handleInvoicePaymentFailed(event, stripe) {
  const invoice = event.data.object;
  const prev = invoiceFailureAttempts.get(invoice.id) || 0;
  const attempt = prev + 1;
  invoiceFailureAttempts.set(invoice.id, attempt);
  const phase = resolveDunningPhase(attempt);

  let customerEmail = '';
  try {
    if (stripe && invoice.customer) {
      const customer = await stripe.customers.retrieve(invoice.customer);
      customerEmail = customer.email || '';
    }
  } catch (_) {
    /* optional */
  }

  const emailResult = await sendDunningEmail({
    attempt,
    phase,
    invoiceId: invoice.id,
    customerEmail,
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
    case 'customer.subscription.deleted':
    case 'subscription.deleted':
      return handleSubscriptionDeleted(event);
    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(event, stripe);
    default:
      return { action: 'ignored', type: event.type };
  }
}

module.exports = { processStripeEvent };
