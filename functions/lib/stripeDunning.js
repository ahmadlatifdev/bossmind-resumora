/**
 * Dunning email + retry schedule for failed invoice payments.
 */
const DUNNING_SCHEDULE_DAYS = Object.freeze([
  1, 3, 7, 14, 21, 30, 35, 40, 45, 47, 49, 50, 52, 54, 56, 58, 60,
]);

const EARLY_RETRIES = 4;
const EARLY_WINDOW_DAYS = 30;

async function sendDunningEmail(payload) {
  const { to, invoiceId, customerId, attempt, phase, resendApiKey, sendgridApiKey, fromEmail } =
    payload;

  if (!to) {
    console.warn('[dunning] skipped — no recipient', { invoiceId, customerId, attempt });
    return { sent: false, reason: 'no_recipient' };
  }

  const subject = `[Resumora] Payment failed — action required (attempt ${attempt})`;
  const html = `<p>We could not process payment for invoice <strong>${invoiceId || 'unknown'}</strong>.</p>
<p>Phase: ${phase}. Please update your payment method at resumora.net/pricing.</p>`;

  if (resendApiKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: fromEmail, to: [to], subject, html }),
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
        content: [{ type: 'text/html', value: html }],
      }),
    });
    return { sent: res.ok, provider: 'sendgrid', status: res.status };
  }

  console.info('[dunning] email stub (no provider key)', {
    invoiceId,
    customerId,
    attempt,
    phase,
    to: to.replace(/(.{2}).+(@.+)/, '$1***$2'),
  });
  return { sent: false, reason: 'no_email_provider', stub: true };
}

function resolveDunningPhase(attempt) {
  if (attempt <= EARLY_RETRIES) return `early_${EARLY_RETRIES}_over_${EARLY_WINDOW_DAYS}d`;
  return 'extended_45_50d_smart';
}

function nextRetryDay(attempt) {
  const idx = Math.min(Math.max(attempt - 1, 0), DUNNING_SCHEDULE_DAYS.length - 1);
  return DUNNING_SCHEDULE_DAYS[idx];
}

module.exports = {
  DUNNING_SCHEDULE_DAYS,
  EARLY_RETRIES,
  EARLY_WINDOW_DAYS,
  sendDunningEmail,
  resolveDunningPhase,
  nextRetryDay,
};
