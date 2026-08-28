/**
 * Post-checkout invoice email (Resend).
 * Failures never throw to the webhook caller — always log and return.
 */
const { FieldValue } = require('firebase-admin/firestore');
const { sendTransactionalEmail, emailProviderConfigured } = require('./mail');

const PLAN_DISPLAY = {
  en: {
    basic: 'Basic',
    balanced: 'Pro',
    professional: 'Business',
    advanced: 'Enterprise',
  },
  fr: {
    basic: 'Basic',
    balanced: 'Pro',
    professional: 'Business',
    advanced: 'Enterprise',
  },
  es: {
    basic: 'Básico',
    balanced: 'Pro',
    professional: 'Negocio',
    advanced: 'Empresa',
  },
};

const COPY = {
  en: {
    subject: 'Your Resumora invoice — {{planName}}',
    title: 'Payment confirmed',
    greeting: 'Hello {{name}},',
    intro: 'Thank you for your purchase. Here is your invoice summary.',
    orderId: 'Order ID',
    plan: 'Plan',
    amount: 'Amount paid',
    date: 'Purchase date',
    button: 'Access your account',
    footer: 'Resumora · resumora.net · One-time service plan',
    priceRef: 'Price reference',
  },
  fr: {
    subject: 'Votre facture Resumora — {{planName}}',
    title: 'Paiement confirmé',
    greeting: 'Bonjour {{name}},',
    intro: 'Merci pour votre achat. Voici le résumé de votre facture.',
    orderId: 'N° de commande',
    plan: 'Forfait',
    amount: 'Montant payé',
    date: 'Date d’achat',
    button: 'Accéder à mon compte',
    footer: 'Resumora · resumora.net · Forfait unique',
    priceRef: 'Référence prix',
  },
  es: {
    subject: 'Tu factura Resumora — {{planName}}',
    title: 'Pago confirmado',
    greeting: 'Hola {{name}},',
    intro: 'Gracias por tu compra. Aquí tienes el resumen de tu factura.',
    orderId: 'ID del pedido',
    plan: 'Plan',
    amount: 'Importe pagado',
    date: 'Fecha de compra',
    button: 'Acceder a tu cuenta',
    footer: 'Resumora · resumora.net · Plan de pago único',
    priceRef: 'Referencia de precio',
  },
};

function normalizeLang(code) {
  const raw = String(code || 'en')
    .toLowerCase()
    .slice(0, 2);
  return raw === 'fr' || raw === 'es' ? raw : 'en';
}

function fill(template, vars) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key] != null ? String(vars[key]) : ''
  );
}

function formatMoney(cents, currency, lang) {
  const amount = (Number(cents) || 0) / 100;
  const cur = String(currency || 'usd').toUpperCase();
  try {
    const locale = lang === 'fr' ? 'fr-CA' : lang === 'es' ? 'es-ES' : 'en-CA';
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur }).format(amount);
  } catch (_) {
    return `${amount.toFixed(2)} ${cur}`;
  }
}

function formatDate(ts, lang) {
  const d = ts ? new Date(typeof ts === 'number' ? ts * 1000 : ts) : new Date();
  const locale = lang === 'fr' ? 'fr-CA' : lang === 'es' ? 'es-ES' : 'en-CA';
  try {
    return d.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch (_) {
    return d.toISOString().slice(0, 10);
  }
}

function planNameFor(planId, lang) {
  const table = PLAN_DISPLAY[lang] || PLAN_DISPLAY.en;
  return table[planId] || planId || 'Resumora';
}

function priceIdPrefix(priceId) {
  const v = String(priceId || '').trim();
  if (!v) return '—';
  // Never log/show full price_ IDs in email body to customers optionally — show truncated for support
  if (v.startsWith('price_') && v.length > 14) return `${v.slice(0, 12)}…`;
  return v;
}

function buildHtml({ lang, name, planName, orderId, amountLabel, dateLabel, loginUrl, priceRef }) {
  const c = COPY[lang] || COPY.en;
  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#0b1529;font-family:Montserrat,Arial,sans-serif;color:#f9f5eb;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1529;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:linear-gradient(160deg,#0a1a3a,#1a2b4a);border:1px solid rgba(212,175,55,.35);border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 28px 8px;text-align:center;">
          <div style="font-family:Georgia,serif;letter-spacing:.12em;color:#d4af37;font-size:18px;font-weight:700;">RESUMORA.NET</div>
          <h1 style="margin:16px 0 8px;font-size:24px;color:#fff;">${c.title}</h1>
        </td></tr>
        <tr><td style="padding:8px 28px 24px;font-size:15px;line-height:1.55;color:#f4e8c1;">
          <p style="margin:0 0 12px;">${fill(c.greeting, { name })}</p>
          <p style="margin:0 0 20px;opacity:.9;">${c.intro}</p>
          <table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08);opacity:.7;">${c.orderId}</td><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08);text-align:right;">${orderId}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08);opacity:.7;">${c.plan}</td><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08);text-align:right;color:#d4af37;font-weight:700;">${planName}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08);opacity:.7;">${c.amount}</td><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08);text-align:right;font-weight:700;">${amountLabel}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08);opacity:.7;">${c.date}</td><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08);text-align:right;">${dateLabel}</td></tr>
            <tr><td style="padding:8px 0;opacity:.7;">${c.priceRef}</td><td style="padding:8px 0;text-align:right;font-family:monospace;font-size:12px;">${priceRef}</td></tr>
          </table>
          <div style="text-align:center;margin:28px 0 8px;">
            <a href="${loginUrl}" style="display:inline-block;padding:14px 28px;border-radius:999px;background:linear-gradient(135deg,#d4af37,#f4e8c1 55%,#b8860b);color:#0a1a3a;font-weight:800;text-decoration:none;">${c.button}</a>
          </div>
          <p style="margin:24px 0 0;font-size:12px;opacity:.55;text-align:center;">${c.footer}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildText({ lang, name, planName, orderId, amountLabel, dateLabel, loginUrl, priceRef }) {
  const c = COPY[lang] || COPY.en;
  return [
    fill(c.greeting, { name }),
    '',
    c.intro,
    '',
    `${c.orderId}: ${orderId}`,
    `${c.plan}: ${planName}`,
    `${c.amount}: ${amountLabel}`,
    `${c.date}: ${dateLabel}`,
    `${c.priceRef}: ${priceRef}`,
    '',
    `${c.button}: ${loginUrl}`,
    '',
    c.footer,
  ].join('\n');
}

async function resolveLocale(db, uid, session) {
  if (uid) {
    try {
      const snap = await db.collection('users').doc(String(uid)).get();
      if (snap.exists) {
        const d = snap.data() || {};
        const fromUser = d.locale || d.preferredLang || d.language || d.uiLang || d.resumora_lang;
        if (fromUser) return normalizeLang(fromUser);
      }
    } catch (err) {
      console.warn('[invoiceEmail] locale lookup failed', err && err.message);
    }
  }
  const metaLang = session && session.metadata && session.metadata.lang;
  return normalizeLang(metaLang || 'en');
}

async function resolvePriceId(stripe, session) {
  const fromMeta =
    (session.metadata && (session.metadata.priceId || session.metadata.stripePriceId)) || '';
  if (fromMeta && String(fromMeta).startsWith('price_')) return String(fromMeta);
  if (!stripe || !session.id) return '';
  try {
    const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
    const price = items && items.data && items.data[0] && items.data[0].price;
    return price && price.id ? String(price.id) : '';
  } catch (err) {
    console.warn('[invoiceEmail] listLineItems failed', err && err.message);
    return '';
  }
}

/**
 * Send invoice email after checkout.session.completed.
 * Safe: never throws to caller.
 */
async function sendInvoiceEmailAfterCheckout(db, stripe, session, uid) {
  try {
    if (!session || !session.id) {
      console.log('[invoiceEmail] skip — missing session');
      return { skipped: true, reason: 'no_session' };
    }

    const paymentStatus = String(session.payment_status || '').toLowerCase();
    if (paymentStatus && paymentStatus !== 'paid' && paymentStatus !== 'no_payment_required') {
      console.log('[invoiceEmail] skip — payment_status=', paymentStatus);
      return { skipped: true, reason: 'not_paid' };
    }

    if (!emailProviderConfigured()) {
      console.log('[invoiceEmail] skip — email provider not configured (set RESEND_API_KEY)');
      return { skipped: true, reason: 'missing_api_key' };
    }

    // Idempotency on webhook retries
    const mailRef = db.collection('invoice_emails').doc(String(session.id));
    const existing = await mailRef.get();
    if (existing.exists && existing.data() && existing.data().status === 'sent') {
      console.log(
        '[invoiceEmail] skip — already sent for session',
        String(session.id).slice(0, 12)
      );
      return { skipped: true, reason: 'already_sent' };
    }

    const email =
      (session.customer_details && session.customer_details.email) || session.customer_email || '';
    if (!email) {
      console.log('[invoiceEmail] skip — no customer email');
      return { skipped: true, reason: 'no_email' };
    }

    const name =
      (session.customer_details && session.customer_details.name) ||
      (session.metadata && session.metadata.fullName) ||
      String(email).split('@')[0] ||
      'there';

    const planId = (session.metadata && session.metadata.planId) || '';
    const lang = await resolveLocale(db, uid, session);
    const planName = planNameFor(planId, lang);
    const amountLabel = formatMoney(session.amount_total, session.currency, lang);
    const dateLabel = formatDate(session.created, lang);
    const priceId = await resolvePriceId(stripe, session);
    const loginUrl = 'https://resumora.net/login';
    const orderId = String(session.id);
    const vars = {
      lang,
      name,
      planName,
      orderId,
      amountLabel,
      dateLabel,
      loginUrl,
      priceRef: priceIdPrefix(priceId),
    };

    const c = COPY[lang] || COPY.en;
    const subject = fill(c.subject, { planName });
    const html = buildHtml(vars);
    const text = buildText(vars);

    const result = await sendTransactionalEmail({
      to: email,
      subject,
      text,
      html,
      tags: [{ name: 'category', value: 'invoice' }],
    });

    if (result.ok) {
      await mailRef.set(
        {
          sessionId: session.id,
          uid: uid || null,
          toDomain: String(email).split('@')[1] || null,
          planId: planId || null,
          lang,
          status: 'sent',
          providerMessageId: result.id || null,
          sentAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      console.log(
        '[invoiceEmail] success',
        JSON.stringify({
          sessionPrefix: String(session.id).slice(0, 12),
          planId: planId || null,
          lang,
          providerId: result.id || null,
        })
      );
      return { ok: true, id: result.id };
    }

    await mailRef.set(
      {
        sessionId: session.id,
        uid: uid || null,
        status: result.skipped ? 'skipped' : 'failed',
        reason: result.reason || result.status || 'send_failed',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    console.error(
      '[invoiceEmail] failed',
      JSON.stringify({
        sessionPrefix: String(session.id).slice(0, 12),
        reason: result.reason || result.status || 'send_failed',
      })
    );
    return result;
  } catch (err) {
    console.error('[invoiceEmail] unexpected error', err && err.message);
    return { ok: false, error: err && err.message ? err.message : 'unknown' };
  }
}

module.exports = {
  sendInvoiceEmailAfterCheckout,
  normalizeLang,
  planNameFor,
};
