/**
 * Cancellation + conditional refund engine (Stripe + service delivery audit).
 */
const {
  getServiceProgress,
  calculateRefundAmount,
  saveRefundRecord,
} = require('./serviceDelivery');
const { refundConfirmation, cancellationNoRefund, queueEmail } = require('./emailTemplates');

function formatUsd(cents) {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

/**
 * Build refund preview without mutating Stripe.
 */
async function buildRefundPreview({ customerId, subscriptionId, planId, totalPaidCents }) {
  const progress = await getServiceProgress(customerId, subscriptionId, planId);
  const calc = calculateRefundAmount(progress, totalPaidCents);
  return {
    progress,
    refund_cents: calc.refundCents,
    refund_formatted: formatUsd(calc.refundCents),
    reason: calc.reason,
    service_delivery_status: calc.status,
    total_paid_cents: Math.max(0, Math.floor(Number(totalPaidCents) || 0)),
    total_paid_formatted: formatUsd(totalPaidCents),
    delivered: progress.delivered,
    remaining: progress.remaining,
  };
}

/**
 * Cancel subscription and issue conditional refund.
 * @param {import('stripe').Stripe} stripe
 */
async function cancelSubscriptionWithRefund(stripe, opts) {
  const {
    customerId,
    subscriptionId,
    planId = 'basic',
    userId = null,
    email = '',
    cancelAtPeriodEnd = false,
    totalPaidCents: overridePaid,
  } = opts;

  if (!subscriptionId) {
    throw Object.assign(new Error('subscriptionId is required'), { code: 'BAD_REQUEST' });
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice.payment_intent', 'latest_invoice.charge'],
  });

  let chargeId = null;
  let totalPaid = Number(overridePaid);
  if (!Number.isFinite(totalPaid) || totalPaid <= 0) {
    totalPaid = 0;
    try {
      const invoices = await stripe.invoices.list({
        subscription: subscriptionId,
        status: 'paid',
        limit: 20,
      });
      for (const inv of invoices.data) {
        totalPaid += Number(inv.amount_paid || 0);
        if (!chargeId && inv.charge) chargeId = String(inv.charge);
      }
    } catch (_) {
      /* fall through */
    }
  }

  if (!chargeId && subscription.latest_invoice) {
    const inv =
      typeof subscription.latest_invoice === 'string'
        ? await stripe.invoices.retrieve(subscription.latest_invoice)
        : subscription.latest_invoice;
    if (inv?.charge) chargeId = String(inv.charge);
    if (!totalPaid && inv?.amount_paid) totalPaid = Number(inv.amount_paid);
  }

  const preview = await buildRefundPreview({
    customerId: customerId || subscription.customer,
    subscriptionId,
    planId: planId || subscription.metadata?.planId || 'basic',
    totalPaidCents: totalPaid,
  });

  let stripeRefund = null;
  let refundRecord = null;

  if (preview.refund_cents > 0) {
    if (!chargeId && !subscription.latest_invoice) {
      throw Object.assign(new Error('No charge found to refund'), { code: 'NO_CHARGE' });
    }

    const idempotencyKey = `${subscriptionId}-refund-${Date.now()}`;
    const refundParams = {
      amount: preview.refund_cents,
      reason: 'requested_by_customer',
      metadata: {
        source: 'cursor_hands_free',
        service_delivery_status: preview.service_delivery_status,
        reason: preview.reason,
        subscription_id: subscriptionId,
      },
    };
    if (chargeId) refundParams.charge = chargeId;
    else if (
      typeof subscription.latest_invoice === 'object' &&
      subscription.latest_invoice?.payment_intent
    ) {
      const pi = subscription.latest_invoice.payment_intent;
      refundParams.payment_intent = typeof pi === 'string' ? pi : pi.id;
    }

    try {
      stripeRefund = await stripe.refunds.create(refundParams, { idempotencyKey });
      refundRecord = await saveRefundRecord({
        refund_id: stripeRefund.id,
        stripe_refund_id: stripeRefund.id,
        customer_id: String(customerId || subscription.customer),
        subscription_id: subscriptionId,
        user_id: userId,
        amount: preview.refund_cents,
        status: stripeRefund.status === 'succeeded' ? 'completed' : 'pending',
        reason: preview.reason,
        charge_id: chargeId,
      });
    } catch (err) {
      await saveRefundRecord({
        refund_id: `failed_${Date.now()}`,
        customer_id: String(customerId || subscription.customer),
        subscription_id: subscriptionId,
        user_id: userId,
        amount: preview.refund_cents,
        status: 'failed',
        reason: err.message || preview.reason,
        charge_id: chargeId,
      });
      throw err;
    }
  } else {
    refundRecord = await saveRefundRecord({
      refund_id: `none_${subscriptionId}_${Date.now()}`,
      customer_id: String(customerId || subscription.customer),
      subscription_id: subscriptionId,
      user_id: userId,
      amount: 0,
      status: 'completed',
      reason: preview.reason,
      charge_id: chargeId,
    });
  }

  let cancelled;
  if (cancelAtPeriodEnd) {
    cancelled = await stripe.subscriptions.update(
      subscriptionId,
      { cancel_at_period_end: true },
      { idempotencyKey: `${subscriptionId}-cancel-pe-${Date.now()}` }
    );
  } else {
    cancelled = await stripe.subscriptions.cancel(subscriptionId, {
      idempotencyKey: `${subscriptionId}-cancel-${Date.now()}`,
    });
  }

  if (email) {
    const tpl =
      preview.refund_cents > 0
        ? refundConfirmation({
            amountFormatted: preview.refund_formatted,
            reason: preview.reason,
          })
        : cancellationNoRefund({ reason: preview.reason });
    queueEmail({ to: email, ...tpl });
  }

  return {
    ok: true,
    subscription_id: subscriptionId,
    subscription_status: cancelled.status,
    cancel_at_period_end: Boolean(cancelled.cancel_at_period_end),
    preview,
    refund: refundRecord,
    stripe_refund_id: stripeRefund?.id || null,
  };
}

module.exports = {
  buildRefundPreview,
  cancelSubscriptionWithRefund,
  formatUsd,
};
