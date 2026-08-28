/**
 * Email HTML + plain-text templates + queue (never blocks request path).
 */
const { enqueueStripeEvent } = require('./stripeWebhookQueue');

function emailConfig() {
  return {
    resendApiKey: process.env.RESEND_API_KEY || '',
    sendgridApiKey: process.env.SENDGRID_API_KEY || '',
    fromEmail:
      process.env.DUNNING_FROM_EMAIL || process.env.BILLING_FROM_EMAIL || 'billing@resumora.net',
  };
}

function refundConfirmation({ amountFormatted, reason, processingDays = '5–10' }) {
  const subject = 'Your Resumora refund has been initiated';
  const text = `We've started a refund of ${amountFormatted}.
Reason: ${reason}
Stripe typically completes refunds in ${processingDays} business days.
Manage your account at https://resumora.net/account`;
  const html = `<div style="font-family:Georgia,serif;background:#0a1a3a;color:#f9f5eb;padding:32px">
  <h1 style="color:#d4af37;margin:0 0 16px">Refund initiated</h1>
  <p>We've started a refund of <strong>${amountFormatted}</strong>.</p>
  <p>Reason: ${reason}</p>
  <p>Stripe typically completes refunds in ${processingDays} business days.</p>
  <p><a href="https://resumora.net/account" style="color:#d4af37">View your account</a></p>
</div>`;
  return { subject, text, html };
}

function cancellationNoRefund({ reason }) {
  const subject = 'Your Resumora plan has been cancelled';
  const text = `Your subscription has been cancelled.
No refund is available because service was fully delivered (${reason}).
Questions? Reply to this email or visit https://resumora.net/account`;
  const html = `<div style="font-family:Georgia,serif;background:#0a1a3a;color:#f9f5eb;padding:32px">
  <h1 style="color:#d4af37;margin:0 0 16px">Plan cancelled</h1>
  <p>Your subscription has been cancelled.</p>
  <p>No refund is available because service was fully delivered.</p>
  <p style="opacity:.8">${reason}</p>
</div>`;
  return { subject, text, html };
}

function dunningReminder({ attempt, phase, invoiceId }) {
  const subject = `Resumora payment reminder (attempt ${attempt})`;
  const text = `We could not process payment for invoice ${invoiceId || 'your account'}.
Phase: ${phase}. Please update your payment method at https://resumora.net/pricing`;
  const html = `<div style="font-family:Georgia,serif;background:#0a1a3a;color:#f9f5eb;padding:32px">
  <h1 style="color:#d4af37">Payment reminder</h1>
  <p>We could not process payment for invoice <strong>${invoiceId || 'your account'}</strong>.</p>
  <p>Phase: ${phase}. Attempt ${attempt}.</p>
  <p><a href="https://resumora.net/pricing" style="color:#d4af37">Update payment method</a></p>
</div>`;
  return { subject, text, html };
}

async function sendEmail({ to, subject, text, html }) {
  if (!to) return { sent: false, reason: 'no_recipient' };
  const { resendApiKey, sendgridApiKey, fromEmail } = emailConfig();

  if (resendApiKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: fromEmail, to: [to], subject, text, html }),
    });
    return { sent: res.ok, provider: 'resend', status: res.status };
  }

  if (sendgridApiKey) {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromEmail },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    });
    return { sent: res.ok, provider: 'sendgrid', status: res.status };
  }

  console.info('[email] stub queued', {
    to: String(to).replace(/(.{2}).+(@.+)/, '$1***$2'),
    subject,
  });
  return { sent: false, reason: 'no_email_provider', stub: true, subject };
}

/**
 * Queue email via the same throttled processor (non-blocking).
 */
function queueEmail(payload) {
  const fakeEvent = {
    id: `email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'internal.email.send',
    data: { object: payload },
  };
  return enqueueStripeEvent(fakeEvent, {
    onProcess: async () => sendEmail(payload),
  });
}

module.exports = {
  refundConfirmation,
  cancellationNoRefund,
  dunningReminder,
  sendEmail,
  queueEmail,
  emailConfig,
};
