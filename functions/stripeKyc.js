/**
 * Stripe account KYC / payouts health check.
 * Never logs full secret keys or account person PII beyond requirement codes.
 */
const { FieldValue } = require('firebase-admin/firestore');

const HEALTH_COL = 'system_health';
const HEALTH_DOC = 'current';
const NOTIFY_COL = 'notification_history';
const DASHBOARD = 'https://resumora.net/admin/system-health';
const KYC_COOLDOWN_MS = 20 * 60 * 60 * 1000; // ~20h — daily job won't spam

async function sendAlert({ subject, text }) {
  const apiKey = String(process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY || '').trim();
  const to =
    String(
      process.env.STRIPE_KYC_ALERT_EMAIL ||
        process.env.SELF_HEAL_ADMIN_EMAIL ||
        process.env.ADMIN_NOTIFY_EMAIL ||
        'info@resumora.net'
    ).trim() || 'info@resumora.net';
  const from =
    String(process.env.SELF_HEAL_EMAIL_FROM || process.env.REFUND_EMAIL_FROM || '').trim() ||
    'Resumora Alerts <onboarding@resend.dev>';

  const slackUrl = String(
    process.env.SELF_HEAL_SLACK_WEBHOOK || process.env.SLACK_WEBHOOK_URL || ''
  ).trim();
  if (slackUrl) {
    try {
      await fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `${subject}\n${text}` }),
      });
    } catch (_) {
      /* ignore */
    }
  }

  if (!apiKey) {
    console.warn(
      JSON.stringify({ scope: 'stripeKyc.notify', skipped: true, reason: 'no_email_key' })
    );
    return { skipped: true };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!res.ok) {
    console.error(JSON.stringify({ scope: 'stripeKyc.notify', status: res.status }));
    return { ok: false, status: res.status };
  }
  return { ok: true };
}

async function shouldNotify(db, key) {
  const ref = db.collection(NOTIFY_COL).doc(key);
  const snap = await ref.get();
  if (!snap.exists) return true;
  const last = snap.data()?.lastSentAt;
  const ms =
    last && typeof last.toDate === 'function'
      ? Date.now() - last.toDate().getTime()
      : Number.POSITIVE_INFINITY;
  return ms >= KYC_COOLDOWN_MS;
}

async function recordNotify(db, key, payload) {
  await db
    .collection(NOTIFY_COL)
    .doc(key)
    .set(
      {
        key,
        channel: 'email_slack',
        ...payload,
        lastSentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {import('stripe').Stripe} stripe
 */
async function checkStripeAccountHealth(db, stripe) {
  if (!stripe) {
    return { ok: false, error: 'stripe_missing' };
  }

  let account;
  try {
    account = await stripe.accounts.retrieve();
  } catch (err) {
    const msg = String(err && err.message ? err.message : err).slice(0, 160);
    console.error(JSON.stringify({ scope: 'stripeKyc.retrieve', error: msg }));
    return { ok: false, error: msg };
  }

  const currentlyDue = Array.isArray(account.requirements?.currently_due)
    ? account.requirements.currently_due.map((x) => String(x).slice(0, 80))
    : [];
  const pastDue = Array.isArray(account.requirements?.past_due)
    ? account.requirements.past_due.map((x) => String(x).slice(0, 80))
    : [];
  const disabledReason = account.requirements?.disabled_reason
    ? String(account.requirements.disabled_reason).slice(0, 120)
    : null;

  const payoutsEnabled = account.payouts_enabled === true;
  const chargesEnabled = account.charges_enabled === true;
  const kycPending = currentlyDue.length > 0 || pastDue.length > 0;
  const needsAttention = !payoutsEnabled || kycPending || Boolean(disabledReason);

  const status = {
    checkedAt: new Date().toISOString(),
    payoutsEnabled,
    chargesEnabled,
    kycPending,
    needsAttention,
    currentlyDueCount: currentlyDue.length,
    pastDueCount: pastDue.length,
    currentlyDueSample: currentlyDue.slice(0, 8),
    pastDueSample: pastDue.slice(0, 8),
    disabledReason,
    // Never store full business / owner PII from account.business_profile
    country: account.country || null,
    defaultCurrency: account.default_currency || null,
  };

  await db.collection(HEALTH_COL).doc(HEALTH_DOC).set({ stripeAccount: status }, { merge: true });

  if (!needsAttention) {
    await db.collection(NOTIFY_COL).doc('stripe_kyc_payouts').set(
      {
        key: 'stripe_kyc_payouts',
        resolved: true,
        resolvedAt: FieldValue.serverTimestamp(),
        note: 'Payouts active and no pending KYC requirements',
      },
      { merge: true }
    );
    return { ok: true, status, alerted: false };
  }

  let alerted = false;
  if (await shouldNotify(db, 'stripe_kyc_payouts')) {
    const when = status.checkedAt;
    const subject = '[Resumora] Stripe KYC / payouts require attention';
    const text = [
      'Stripe account needs attention.',
      '',
      `Time: ${when}`,
      `payouts_enabled: ${payoutsEnabled}`,
      `charges_enabled: ${chargesEnabled}`,
      `KYC pending: ${kycPending}`,
      `currently_due count: ${currentlyDue.length}`,
      `past_due count: ${pastDue.length}`,
      `disabled_reason: ${disabledReason || '—'}`,
      '',
      `Dashboard: ${DASHBOARD}`,
      'Stripe Dashboard → Settings → Account details / Payouts',
      '',
      'FR: Vérification d’identité / paiements Stripe en pause — action requise.',
      'ES: Verificación KYC / pagos de Stripe en pausa — se requiere acción.',
    ].join('\n');

    await sendAlert({ subject, text });
    await recordNotify(db, 'stripe_kyc_payouts', {
      type: 'stripe_kyc_payouts',
      subject,
      payoutsEnabled,
      kycPending,
      resolved: false,
    });
    alerted = true;
  }

  return { ok: true, status, alerted };
}

module.exports = {
  checkStripeAccountHealth,
};
