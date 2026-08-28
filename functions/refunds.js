/**
 * Multi-trigger refund workflow for resumora.net
 * - System: checkout → pending if service not provided
 * - User: authenticated /api/request-refund
 * - Admin: approve/reject at /admin/refunds
 * - Auto: 10 business days if still pending and service_provided=false
 * Never logs Stripe secret values.
 */
const crypto = require('crypto');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

const COLLECTION = 'refund_requests';
const BUSINESS_DAY_CAP = 10;

/** Static holiday dates (YYYY-MM-DD) — CA/US common closures used in grace calc. */
const HOLIDAYS = new Set([
  '2026-01-01',
  '2026-01-19',
  '2026-02-16',
  '2026-04-03',
  '2026-05-18',
  '2026-05-25',
  '2026-07-01',
  '2026-07-03',
  '2026-09-07',
  '2026-10-12',
  '2026-11-11',
  '2026-11-26',
  '2026-12-25',
  '2026-12-26',
  '2027-01-01',
]);

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function assertAdminPassword(req, expected) {
  const provided =
    req.get('x-admin-password') ||
    req.get('X-Admin-Password') ||
    (req.body && req.body.adminPassword) ||
    '';
  if (!expected || !timingSafeEqualString(provided, expected)) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
}

function ymd(date) {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isNonBusinessDay(date) {
  const day = date.getDay();
  if (day === 0 || day === 6) return true;
  return HOLIDAYS.has(ymd(date));
}

/** Count business days strictly after `from` up to (and including) `to`. */
function businessDaysElapsed(fromDate, toDate) {
  const start = new Date(fromDate);
  const end = new Date(toDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  if (end <= start) return 0;
  let count = 0;
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= end) {
    if (!isNonBusinessDay(cursor)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function toJsDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeLocale(code) {
  const c = String(code || 'en')
    .toLowerCase()
    .slice(0, 2);
  return c === 'fr' || c === 'es' ? c : 'en';
}

async function isServiceProvided(db, uid) {
  if (!uid) return false;
  const snap = await db.collection('users').doc(String(uid)).get();
  if (!snap.exists) return false;
  const data = snap.data() || {};
  if (data.serviceProvided === true || data.serviceActivated === true) return true;
  const status = String(data.serviceStatus || '').toLowerCase();
  return status === 'provided' || status === 'activated' || status === 'delivered';
}

function userHasPaidPlan(userData) {
  if (!userData) return false;
  if (userData.paid === true) return true;
  const planStatus = String(userData.planStatus || '').toLowerCase();
  const sub = String(userData.subscriptionStatus || '').toLowerCase();
  return planStatus === 'active' || sub === 'active' || sub === 'trialing';
}

/** Explicit Account/UI gate: subscriptionActive ≈ subscriptionStatus active|trialing. */
function isSubscriptionActive(userData) {
  if (!userData) return false;
  const sub = String(userData.subscriptionStatus || '').toLowerCase();
  if (sub === 'active' || sub === 'trialing') return true;
  return userHasPaidPlan(userData);
}

/**
 * Resolve Stripe customer id from Firestore profile or email search.
 * Persists stripeCustomerId on users/{uid} when found via email.
 * Never logs sk_/whsec_/pk_/price_ values.
 */
async function resolveStripeCustomerId(db, stripe, { uid, email, userData }) {
  const existing = String((userData && userData.stripeCustomerId) || '').trim();
  if (existing.startsWith('cus_')) {
    console.log(
      JSON.stringify({
        scope: 'refunds.resolve_customer',
        step: 'firestore_hit',
        uid: uid || null,
        email: String(email || (userData && userData.email) || '').toLowerCase() || null,
        customerId: existing,
      })
    );
    return existing;
  }
  if (!stripe) return '';

  const lookupEmail = String(email || (userData && userData.email) || '')
    .trim()
    .toLowerCase();
  console.log(
    JSON.stringify({
      scope: 'refunds.resolve_customer',
      step: 'email_search_start',
      uid: uid || null,
      email: lookupEmail || null,
      hadFirestoreCustomerId: false,
    })
  );
  if (!lookupEmail || !lookupEmail.includes('@')) {
    console.log(
      JSON.stringify({
        scope: 'refunds.resolve_customer',
        step: 'email_missing',
        uid: uid || null,
        customerId: null,
      })
    );
    return '';
  }

  let customer = null;

  // 1) Stripe Search API (more reliable than list for historical customers)
  try {
    const q = `email:"${lookupEmail.replace(/"/g, '')}"`;
    const searched = await stripe.customers.search({ query: q, limit: 10 });
    customer = (searched.data || []).find((c) => !c.deleted) || null;
    console.log(
      JSON.stringify({
        scope: 'refunds.resolve_customer',
        step: 'customers_search',
        email: lookupEmail,
        found: Boolean(customer && customer.id),
        customerId: customer && customer.id ? String(customer.id) : null,
        matchCount: Array.isArray(searched.data) ? searched.data.length : 0,
      })
    );
  } catch (err) {
    console.warn(
      JSON.stringify({
        scope: 'refunds.resolve_customer',
        step: 'customers_search_failed',
        email: lookupEmail,
        error: String(err && err.message ? err.message : err).slice(0, 120),
      })
    );
  }

  // 2) customers.list fallback
  if (!customer) {
    try {
      const found = await stripe.customers.list({ email: lookupEmail, limit: 10 });
      customer = (found.data || []).find((c) => !c.deleted) || null;
      console.log(
        JSON.stringify({
          scope: 'refunds.resolve_customer',
          step: 'customers_list',
          email: lookupEmail,
          found: Boolean(customer && customer.id),
          customerId: customer && customer.id ? String(customer.id) : null,
          matchCount: Array.isArray(found.data) ? found.data.length : 0,
        })
      );
    } catch (err) {
      console.warn(
        JSON.stringify({
          scope: 'refunds.resolve_customer',
          step: 'customers_list_failed',
          email: lookupEmail,
          error: String(err && err.message ? err.message : err).slice(0, 120),
        })
      );
    }
  }

  if (!customer || !customer.id) {
    console.log(
      JSON.stringify({
        scope: 'refunds.resolve_customer',
        step: 'not_found',
        email: lookupEmail,
        customerId: null,
      })
    );
    return '';
  }

  if (uid) {
    try {
      await db.collection('users').doc(String(uid)).set(
        {
          stripeCustomerId: customer.id,
          email: lookupEmail,
          updatedAt: FieldValue.serverTimestamp(),
          source: 'stripe_customer_email_link',
        },
        { merge: true }
      );
    } catch (_) {
      /* non-fatal */
    }
  }

  console.log(
    JSON.stringify({
      scope: 'refunds.resolve_customer',
      step: 'linked',
      uid: uid || null,
      email: lookupEmail,
      customerId: String(customer.id),
    })
  );

  // One-shot no-reply when legacy customer is first linked from Account history.
  if (uid && lookupEmail) {
    try {
      const snap = await db.collection('users').doc(String(uid)).get();
      const data = snap.exists ? snap.data() || {} : {};
      if (!data.customerLinkEmailSent) {
        const notifications = require('./notifications');
        await notifications.sendNotificationEmail({
          to: lookupEmail,
          templateKey: 'account.activated',
          locale: data.locale || 'en',
        });
        await db
          .collection('users')
          .doc(String(uid))
          .set(
            { customerLinkEmailSent: true, updatedAt: FieldValue.serverTimestamp() },
            { merge: true }
          );
      }
    } catch (_) {
      /* non-fatal */
    }
  }

  return String(customer.id);
}

function planNameFromAmountCents(cents) {
  const n = Number(cents) || 0;
  if (n === 2900) return { planId: 'basic', plan: 'Basic' };
  if (n === 4900) return { planId: 'balanced', plan: 'Pro' };
  if (n === 7900) return { planId: 'professional', plan: 'Business' };
  if (n === 11000) return { planId: 'advanced', plan: 'Enterprise' };
  return { planId: null, plan: null };
}

function planNameFromPlanId(planId) {
  const id = String(planId || '').toLowerCase();
  const map = {
    basic: 'Basic',
    balanced: 'Pro',
    pro: 'Pro',
    professional: 'Business',
    business: 'Business',
    advanced: 'Enterprise',
    enterprise: 'Enterprise',
  };
  return map[id] || null;
}

function mapChargeToPaymentItem(ch, pendingRefunds, extras = {}) {
  const pi =
    typeof ch.payment_intent === 'string'
      ? ch.payment_intent
      : ch.payment_intent && ch.payment_intent.id
        ? String(ch.payment_intent.id)
        : null;
  let status = String(ch.status || 'unknown');
  if (ch.refunded || Number(ch.amount_refunded) >= Number(ch.amount)) {
    status = 'refunded';
  } else if (Number(ch.amount_refunded) > 0) {
    status = 'partially_refunded';
  } else if (status === 'succeeded' && pi && pendingRefunds.has(pi)) {
    status = 'pending_approval';
  }

  const amount = Number(ch.amount) || 0;
  const fromMeta =
    extras.planName ||
    planNameFromPlanId(extras.planId) ||
    planNameFromPlanId(ch.metadata && ch.metadata.planId) ||
    null;
  const fromAmount = planNameFromAmountCents(amount);
  const description =
    extras.description || ch.description || (ch.outcome && ch.outcome.seller_message) || '';
  let plan = fromMeta || fromAmount.plan;
  if (!plan && description) {
    const d = String(description).toLowerCase();
    if (d.includes('enterprise')) plan = 'Enterprise';
    else if (d.includes('business')) plan = 'Business';
    else if (d.includes('pro') || d.includes('balanced')) plan = 'Pro';
    else if (d.includes('basic')) plan = 'Basic';
  }

  return {
    id: ch.id,
    amount,
    amount_refunded: Number(ch.amount_refunded) || 0,
    currency: ch.currency || 'usd',
    status,
    created: ch.created ? new Date(Number(ch.created) * 1000).toISOString() : null,
    payment_intent: pi,
    plan: plan || null,
    planId: extras.planId || fromAmount.planId || (ch.metadata && ch.metadata.planId) || null,
    description: description || null,
    refundable:
      status === 'succeeded' &&
      !ch.refunded &&
      Number(ch.amount_refunded || 0) === 0 &&
      !(pi && pendingRefunds.has(pi)),
  };
}

/**
 * Authenticated Account: Stripe charge / payment history.
 * Aggressive fallbacks when stripeCustomerId missing (legacy Payment Link / manual activation).
 */
async function listMyPayments(db, stripe, { uid, email }) {
  if (!uid) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
  if (!stripe) {
    const err = new Error('Payments unavailable');
    err.statusCode = 503;
    throw err;
  }

  const userRef = db.collection('users').doc(String(uid));
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const lookupEmail = String(email || userData.email || '')
    .trim()
    .toLowerCase();

  console.log(
    JSON.stringify({
      scope: 'listMyPayments',
      step: 'start',
      uid,
      email: lookupEmail || null,
      firestoreCustomerId: String(userData.stripeCustomerId || '') || null,
    })
  );

  let customerId = await resolveStripeCustomerId(db, stripe, {
    uid,
    email: lookupEmail,
    userData,
  });

  const pendingRefunds = new Set();
  try {
    const snap = await db.collection(COLLECTION).where('uid', '==', String(uid)).limit(50).get();
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      if (data.status === 'pending_approval') {
        const pi = String(data.payment_intent_id || '');
        if (pi) pendingRefunds.add(pi);
      }
    }
  } catch (_) {
    /* ignore */
  }

  const chargeById = new Map();

  async function ingestCharges(list, source) {
    const rows = Array.isArray(list) ? list : [];
    for (const ch of rows) {
      if (ch && ch.id) chargeById.set(ch.id, ch);
    }
    console.log(
      JSON.stringify({
        scope: 'listMyPayments',
        step: 'charges_batch',
        source,
        email: lookupEmail || null,
        customerId: customerId || null,
        batchCount: rows.length,
        totalUnique: chargeById.size,
      })
    );
  }

  if (customerId) {
    try {
      const charges = await stripe.charges.list({ customer: customerId, limit: 40 });
      await ingestCharges(charges.data || [], 'charges_list_by_customer');
    } catch (err) {
      console.warn(
        JSON.stringify({
          scope: 'listMyPayments',
          step: 'charges_list_by_customer_failed',
          customerId,
          error: String(err && err.message ? err.message : err).slice(0, 120),
        })
      );
    }
  }

  // Email charge search when no customer or empty history (legacy guest checkout)
  if (lookupEmail && chargeById.size === 0) {
    try {
      const q = `email:"${lookupEmail.replace(/"/g, '')}"`;
      const searched = await stripe.charges.search({ query: q, limit: 40 });
      await ingestCharges(searched.data || [], 'charges_search_by_email');
      if (!customerId && searched.data && searched.data[0] && searched.data[0].customer) {
        customerId =
          typeof searched.data[0].customer === 'string'
            ? searched.data[0].customer
            : String(searched.data[0].customer.id || '');
        if (customerId.startsWith('cus_') && uid) {
          await userRef.set(
            {
              stripeCustomerId: customerId,
              email: lookupEmail,
              updatedAt: FieldValue.serverTimestamp(),
              source: 'stripe_charge_email_link',
            },
            { merge: true }
          );
        }
      }
    } catch (err) {
      console.warn(
        JSON.stringify({
          scope: 'listMyPayments',
          step: 'charges_search_by_email_failed',
          email: lookupEmail,
          error: String(err && err.message ? err.message : err).slice(0, 120),
        })
      );
    }
  }

  // PaymentIntents search as last resort
  if (lookupEmail && chargeById.size === 0) {
    try {
      const q = `receipt_email:"${lookupEmail.replace(/"/g, '')}"`;
      const pis = await stripe.paymentIntents.search({ query: q, limit: 20 });
      console.log(
        JSON.stringify({
          scope: 'listMyPayments',
          step: 'payment_intents_search',
          email: lookupEmail,
          matchCount: Array.isArray(pis.data) ? pis.data.length : 0,
        })
      );
      for (const pi of pis.data || []) {
        if (!pi || pi.status !== 'succeeded') continue;
        const syntheticId = `pi_charge_${pi.id}`;
        chargeById.set(syntheticId, {
          id: syntheticId,
          amount: pi.amount_received || pi.amount || 0,
          amount_refunded: pi.amount_refunded || 0,
          currency: pi.currency || 'usd',
          status: 'succeeded',
          refunded: Number(pi.amount_refunded || 0) > 0,
          created: pi.created,
          payment_intent: pi.id,
          metadata: pi.metadata || {},
          description: pi.description || null,
          customer: typeof pi.customer === 'string' ? pi.customer : null,
        });
        if (!customerId && pi.customer) {
          customerId = typeof pi.customer === 'string' ? pi.customer : String(pi.customer.id || '');
        }
      }
      if (customerId && uid) {
        await userRef.set(
          {
            stripeCustomerId: customerId,
            email: lookupEmail,
            updatedAt: FieldValue.serverTimestamp(),
            source: 'stripe_pi_email_link',
          },
          { merge: true }
        );
      }
    } catch (err) {
      console.warn(
        JSON.stringify({
          scope: 'listMyPayments',
          step: 'payment_intents_search_failed',
          email: lookupEmail,
          error: String(err && err.message ? err.message : err).slice(0, 120),
        })
      );
    }
  }

  const piMetaCache = new Map();
  async function extrasForCharge(ch) {
    const piId =
      typeof ch.payment_intent === 'string'
        ? ch.payment_intent
        : ch.payment_intent && ch.payment_intent.id
          ? String(ch.payment_intent.id)
          : ch.payment_intent && String(ch.payment_intent).startsWith('pi_')
            ? String(ch.payment_intent)
            : '';
    const extras = {
      planId: (ch.metadata && ch.metadata.planId) || null,
      planName: null,
      description: ch.description || null,
    };
    if (!piId || !stripe || piMetaCache.size > 15) return extras;
    if (piMetaCache.has(piId)) return { ...extras, ...piMetaCache.get(piId) };
    try {
      const pi = await stripe.paymentIntents.retrieve(piId);
      const meta = {
        planId: (pi.metadata && pi.metadata.planId) || extras.planId,
        planName: planNameFromPlanId(pi.metadata && pi.metadata.planId),
        description: pi.description || extras.description,
      };
      piMetaCache.set(piId, meta);
      return { ...extras, ...meta };
    } catch (_) {
      piMetaCache.set(piId, extras);
      return extras;
    }
  }

  const items = [];
  for (const ch of chargeById.values()) {
    const extras = await extrasForCharge(ch);
    // Synthetic PI rows already carry payment_intent as id string
    if (String(ch.id || '').startsWith('pi_charge_') && ch.payment_intent) {
      extras.planId = extras.planId || (ch.metadata && ch.metadata.planId) || null;
    }
    items.push(mapChargeToPaymentItem(ch, pendingRefunds, extras));
  }
  items.sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));

  console.log(
    JSON.stringify({
      scope: 'listMyPayments',
      step: 'result',
      uid,
      email: lookupEmail || null,
      customerId: customerId || null,
      chargeCount: items.length,
    })
  );

  const firstRefundable = items.find((i) => i.refundable && i.payment_intent);
  if (firstRefundable) {
    try {
      await userRef.set(
        {
          lastPaymentIntentId: firstRefundable.payment_intent,
          lastAmountTotal: firstRefundable.amount,
          lastCurrency: firstRefundable.currency,
          ...(customerId ? { stripeCustomerId: customerId } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (_) {
      /* non-fatal */
    }
  }

  return { items, stripeCustomerId: customerId || null };
}

/**
 * Persist a paid checkout into users/{uid}/payments for Account history.
 */
async function recordUserPayment(
  db,
  { uid, checkoutSessionId, paymentIntentId, amount, currency, planId, stripeCustomerId, email }
) {
  if (!db || !uid) return null;
  const docId = String(checkoutSessionId || paymentIntentId || `pay_${Date.now()}`).slice(0, 180);
  const ref = db.collection('users').doc(String(uid)).collection('payments').doc(docId);
  await ref.set(
    {
      uid: String(uid),
      checkout_session_id: checkoutSessionId || null,
      payment_intent_id: paymentIntentId || null,
      amount: Number(amount) || 0,
      currency: String(currency || 'usd'),
      planId: planId || null,
      status: 'paid',
      stripe_customer_id: stripeCustomerId || null,
      email: email || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      source: 'stripe_webhook',
    },
    { merge: true }
  );
  return docId;
}

async function sendEmail({ to, subject, text, html }) {
  const apiKey = String(process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY || '').trim();
  const from =
    String(process.env.REFUND_EMAIL_FROM || '').trim() ||
    'Resumora Refunds <onboarding@resend.dev>';
  if (!apiKey || !to) {
    console.log(
      JSON.stringify({
        scope: 'refunds.email',
        skipped: true,
        hasKey: Boolean(apiKey),
        hasTo: Boolean(to),
        subject: String(subject || '').slice(0, 80),
      })
    );
    return { skipped: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html: html || undefined,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(
      JSON.stringify({
        scope: 'refunds.email',
        status: res.status,
        body: body.slice(0, 200),
      })
    );
    return { ok: false, status: res.status };
  }
  return { ok: true };
}

async function notifyAdminPending(request) {
  const adminEmail =
    String(process.env.ADMIN_NOTIFY_EMAIL || process.env.SELF_HEAL_ADMIN_EMAIL || '').trim() ||
    'info@resumora.net';
  const type = request.request_type || request.requestType || 'system';
  await sendEmail({
    to: adminEmail,
    subject: `[Resumora] Pending refund (${type}) — ${request.customer_email || 'unknown'}`,
    text: [
      `A new pending refund request was created (type=${type}).`,
      '',
      `Request ID: ${request.id}`,
      `Customer: ${request.customer_email || '—'}`,
      `UID: ${request.uid || '—'}`,
      `Amount (cents): ${request.amount}`,
      `Currency: ${request.currency || 'usd'}`,
      `Payment Intent: ${request.payment_intent_id || '—'}`,
      `Plan: ${request.planId || '—'}`,
      `service_provided: ${request.service_provided === true}`,
      '',
      'Review at: https://resumora.net/admin/refunds',
      `Auto-refund after ${BUSINESS_DAY_CAP} business days if still pending and service not provided.`,
    ].join('\n'),
  });
}

function customerRefundedCopy(locale, dollars, currency) {
  const cur = String(currency || 'usd').toUpperCase();
  if (locale === 'fr') {
    return {
      subject: 'Votre remboursement Resumora a été traité',
      text: [
        'Bonjour,',
        '',
        `Votre remboursement de $${dollars} ${cur} a été approuvé et transmis à Stripe.`,
        'Les fonds apparaissent généralement sur votre moyen de paiement sous quelques jours ouvrables.',
        '',
        '— Resumora',
      ].join('\n'),
    };
  }
  if (locale === 'es') {
    return {
      subject: 'Su reembolso de Resumora ha sido procesado',
      text: [
        'Hola,',
        '',
        `Su reembolso de $${dollars} ${cur} fue aprobado y enviado a Stripe.`,
        'Los fondos suelen aparecer en su método de pago en varios días hábiles.',
        '',
        '— Resumora',
      ].join('\n'),
    };
  }
  return {
    subject: 'Your Resumora refund has been processed',
    text: [
      'Hello,',
      '',
      `Your refund of $${dollars} ${cur} has been approved and submitted to Stripe.`,
      'Funds typically appear on your original payment method within several business days.',
      '',
      '— Resumora',
    ].join('\n'),
  };
}

function customerRejectedCopy(locale, reason) {
  const why = String(reason || '').trim() || 'policy';
  if (locale === 'fr') {
    return {
      subject: 'Votre demande de remboursement Resumora',
      text: [
        'Bonjour,',
        '',
        'Votre demande de remboursement a été refusée.',
        `Motif: ${why}`,
        'Contactez info@resumora.net si vous avez des questions.',
        '',
        '— Resumora',
      ].join('\n'),
    };
  }
  if (locale === 'es') {
    return {
      subject: 'Su solicitud de reembolso de Resumora',
      text: [
        'Hola,',
        '',
        'Su solicitud de reembolso fue rechazada.',
        `Motivo: ${why}`,
        'Escriba a info@resumora.net si tiene preguntas.',
        '',
        '— Resumora',
      ].join('\n'),
    };
  }
  return {
    subject: 'Your Resumora refund request',
    text: [
      'Hello,',
      '',
      'Your refund request was rejected.',
      `Reason: ${why}`,
      'Contact info@resumora.net if you have questions.',
      '',
      '— Resumora',
    ].join('\n'),
  };
}

async function resolveUserLocale(db, uid, fallbackEmail) {
  if (uid) {
    const snap = await db.collection('users').doc(String(uid)).get();
    if (snap.exists) {
      const data = snap.data() || {};
      if (data.locale) return normalizeLocale(data.locale);
    }
  }
  return 'en';
}

async function notifyCustomerRefunded(db, request) {
  const email = String(request.customer_email || '').trim();
  if (!email) return;
  const locale = await resolveUserLocale(db, request.uid);
  try {
    const notifications = require('./notifications');
    await notifications.sendNotificationEmail({
      to: email,
      templateKey: 'refund.processed',
      locale,
    });
  } catch (_) {
    const dollars = ((Number(request.amount) || 0) / 100).toFixed(2);
    const copy = customerRefundedCopy(locale, dollars, request.currency);
    await sendEmail({ to: email, subject: copy.subject, text: copy.text });
  }
}

async function notifyCustomerRejected(db, request, reason) {
  const email = String(request.customer_email || '').trim();
  if (!email) return;
  const locale = await resolveUserLocale(db, request.uid);
  const copy = customerRejectedCopy(locale, reason);
  await sendEmail({ to: email, subject: copy.subject, text: copy.text });
}

/**
 * After checkout.session.completed: if service not provided, create pending refund request.
 */
async function maybeCreatePendingRefundFromCheckout(db, session, uid) {
  const sessionId = String(session.id || '');
  if (!sessionId) return null;

  const provided = await isServiceProvided(db, uid);
  if (provided) {
    console.log(
      JSON.stringify({
        scope: 'refunds.checkout',
        uid: uid || null,
        skipped: 'service_provided',
      })
    );
    return null;
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent && session.payment_intent.id
        ? String(session.payment_intent.id)
        : '';

  if (!paymentIntentId) {
    console.warn(
      JSON.stringify({
        scope: 'refunds.checkout',
        sessionId,
        error: 'missing_payment_intent',
      })
    );
    return null;
  }

  // Persist PI on user for later user-initiated refunds
  if (uid) {
    try {
      await db.collection('users').doc(String(uid)).set(
        {
          lastPaymentIntentId: paymentIntentId,
          lastCheckoutSessionId: sessionId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (_) {
      /* non-fatal */
    }
  }

  const ref = db.collection(COLLECTION).doc(sessionId);
  const existing = await ref.get();
  if (existing.exists) {
    console.log(JSON.stringify({ scope: 'refunds.checkout', id: sessionId, alreadyExists: true }));
    return { id: sessionId, ...(existing.data() || {}), alreadyExists: true };
  }

  const email =
    (session.customer_details && session.customer_details.email) || session.customer_email || '';
  const record = {
    payment_intent_id: paymentIntentId,
    amount: Number(session.amount_total) || 0,
    currency: session.currency || 'usd',
    customer_email: email || null,
    email: email || null,
    status: 'pending_approval',
    checkout_session_id: sessionId,
    uid: uid || null,
    planId: (session.metadata && session.metadata.planId) || null,
    stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
    request_type: 'system',
    request_date: FieldValue.serverTimestamp(),
    service_provided: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    autoRefundAfterBusinessDays: BUSINESS_DAY_CAP,
    notes: 'Created because users.serviceProvided/serviceActivated was not true',
  };

  await ref.set(record);
  console.log(
    JSON.stringify({
      scope: 'refunds.checkout',
      id: sessionId,
      status: 'pending_approval',
      request_type: 'system',
    })
  );

  await notifyAdminPending({ id: sessionId, ...record });
  return { id: sessionId, ...record };
}

async function resolvePaymentIntentForUser(db, stripe, userData, uid, email) {
  const fromUser = String(userData.lastPaymentIntentId || userData.payment_intent_id || '').trim();
  if (fromUser.startsWith('pi_')) return fromUser;

  // Prefer an existing non-refunded request for this uid
  try {
    const snap = await db.collection(COLLECTION).where('uid', '==', String(uid)).limit(20).get();
    const pending = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .filter(
        (r) =>
          r.status === 'pending_approval' && String(r.payment_intent_id || '').startsWith('pi_')
      );
    if (pending.length) return String(pending[0].payment_intent_id);
    const anyPi = snap.docs
      .map((d) => d.data())
      .find((r) => String(r.payment_intent_id || '').startsWith('pi_'));
    if (anyPi) return String(anyPi.payment_intent_id);
  } catch (_) {
    /* continue */
  }

  const customerId = await resolveStripeCustomerId(db, stripe, {
    uid,
    email: email || userData.email,
    userData,
  });
  if (stripe && customerId.startsWith('cus_')) {
    const list = await stripe.paymentIntents.list({
      customer: customerId,
      limit: 10,
    });
    const succeeded = (list.data || []).find(
      (pi) => pi.status === 'succeeded' && !pi.amount_refunded
    );
    if (succeeded) return succeeded.id;
    const first = list.data && list.data[0];
    if (first) return first.id;

    // Charges fallback (Payment Links / older checkouts)
    const charges = await stripe.charges.list({ customer: customerId, limit: 10 });
    const good = (charges.data || []).find(
      (ch) =>
        ch.status === 'succeeded' &&
        !ch.refunded &&
        Number(ch.amount_refunded || 0) === 0 &&
        ch.payment_intent
    );
    if (good) {
      return typeof good.payment_intent === 'string'
        ? good.payment_intent
        : String(good.payment_intent.id || '');
    }
  }
  return '';
}

/**
 * Authenticated user-initiated refund request.
 */
async function createUserRefundRequest(
  db,
  stripe,
  { uid, email, reason, paymentIntentId: preferredPi }
) {
  if (!uid) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  const userRef = db.collection('users').doc(String(uid));
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    const err = new Error('User profile not found');
    err.statusCode = 404;
    throw err;
  }
  const userData = userSnap.data() || {};
  // Require active subscription (subscriptionStatus) before allowing refund request.
  if (!isSubscriptionActive(userData)) {
    const err = new Error('No active paid plan found for this account');
    err.statusCode = 403;
    throw err;
  }

  let paymentIntentId = String(preferredPi || '').trim();
  if (!paymentIntentId.startsWith('pi_')) {
    paymentIntentId = await resolvePaymentIntentForUser(
      db,
      stripe,
      userData,
      uid,
      email || userData.email
    );
  }
  if (!paymentIntentId) {
    const err = new Error('No refundable payment found for this account');
    err.statusCode = 404;
    throw err;
  }

  // Idempotent doc id per user + payment intent
  const docId = `user_${uid}_${paymentIntentId}`;
  const ref = db.collection(COLLECTION).doc(docId);
  const existing = await ref.get();
  if (existing.exists) {
    const data = existing.data() || {};
    if (data.status === 'pending_approval' || data.status === 'refunded') {
      return {
        id: docId,
        ...data,
        alreadyExists: true,
        status: data.status,
      };
    }
  }

  let amount = Number(userData.lastAmountTotal) || 0;
  let currency = userData.lastCurrency || 'usd';
  try {
    if (stripe) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      amount = Number(pi.amount_received || pi.amount) || amount;
      currency = pi.currency || currency;
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        scope: 'refunds.user_request',
        step: 'pi_retrieve',
        error: String(err && err.message ? err.message : err).slice(0, 120),
      })
    );
  }

  const provided = await isServiceProvided(db, uid);
  const customerEmail = String(email || userData.email || '').trim() || null;

  const record = {
    uid: String(uid),
    email: customerEmail,
    customer_email: customerEmail,
    payment_intent_id: paymentIntentId,
    amount,
    currency,
    status: 'pending_approval',
    request_type: 'user',
    request_date: FieldValue.serverTimestamp(),
    service_provided: provided,
    planId: userData.planId || userData.plan || null,
    stripe_customer_id: userData.stripeCustomerId || null,
    reason: String(reason || 'requested_by_customer').slice(0, 500),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    autoRefundAfterBusinessDays: BUSINESS_DAY_CAP,
    notes: 'User-initiated refund request',
  };

  await ref.set(record, { merge: true });
  console.log(
    JSON.stringify({
      scope: 'refunds.user_request',
      id: docId,
      uid,
      status: 'pending_approval',
      service_provided: provided,
    })
  );

  await notifyAdminPending({ id: docId, ...record });
  return { id: docId, ...record, alreadyExists: false };
}

/**
 * Account history: all user payments + refund requests (not pending-only).
 * Merges users/{uid}/payments, refund_requests, and optional Stripe PaymentIntents.
 */
async function listMyRefundRequests(db, uid, stripe = null) {
  const items = [];
  const seenPi = new Set();

  // 1) Refund requests (any status)
  try {
    const snap = await db.collection(COLLECTION).where('uid', '==', String(uid)).limit(50).get();
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const pi = String(data.payment_intent_id || '');
      if (pi) seenPi.add(pi);
      items.push({
        id: doc.id,
        kind: 'refund_request',
        status: data.status || null,
        amount: data.amount || 0,
        currency: data.currency || 'usd',
        request_type: data.request_type || null,
        planId: data.planId || null,
        payment_intent_id: pi || null,
        createdAt: toJsDate(data.createdAt)?.toISOString() || null,
        request_date: toJsDate(data.request_date)?.toISOString() || null,
        service_provided: data.service_provided === true,
      });
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        scope: 'refunds.list_mine',
        step: 'refund_requests',
        error: String(err && err.message ? err.message : err).slice(0, 120),
      })
    );
  }

  // 2) Recorded payments from webhook
  try {
    const paySnap = await db
      .collection('users')
      .doc(String(uid))
      .collection('payments')
      .limit(50)
      .get();
    for (const doc of paySnap.docs) {
      const data = doc.data() || {};
      const pi = String(data.payment_intent_id || '');
      if (pi && seenPi.has(pi)) continue;
      if (pi) seenPi.add(pi);
      items.push({
        id: doc.id,
        kind: 'payment',
        status: data.status || 'paid',
        amount: data.amount || 0,
        currency: data.currency || 'usd',
        request_type: 'payment',
        planId: data.planId || null,
        payment_intent_id: pi || null,
        createdAt: toJsDate(data.createdAt)?.toISOString() || null,
        request_date: toJsDate(data.createdAt)?.toISOString() || null,
        service_provided: false,
      });
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        scope: 'refunds.list_mine',
        step: 'payments',
        error: String(err && err.message ? err.message : err).slice(0, 120),
      })
    );
  }

  // 3) Stripe PaymentIntents for customer (fills gaps when webhook history missing)
  try {
    const userSnap = await db.collection('users').doc(String(uid)).get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const customerId = String(userData.stripeCustomerId || '').trim();
    if (stripe && customerId.startsWith('cus_')) {
      const list = await stripe.paymentIntents.list({ customer: customerId, limit: 20 });
      for (const pi of list.data || []) {
        const id = String(pi.id || '');
        if (!id || seenPi.has(id)) continue;
        seenPi.add(id);
        const refunded = Number(pi.amount_refunded) > 0;
        items.push({
          id: `pi_${id}`,
          kind: 'payment',
          status: refunded
            ? 'refunded'
            : pi.status === 'succeeded'
              ? 'paid'
              : String(pi.status || 'paid'),
          amount: Number(pi.amount_received || pi.amount) || 0,
          currency: pi.currency || 'usd',
          request_type: 'payment',
          planId: userData.planId || userData.plan || null,
          payment_intent_id: id,
          createdAt: pi.created ? new Date(Number(pi.created) * 1000).toISOString() : null,
          request_date: pi.created ? new Date(Number(pi.created) * 1000).toISOString() : null,
          service_provided: false,
        });
      }
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        scope: 'refunds.list_mine',
        step: 'stripe_pis',
        error: String(err && err.message ? err.message : err).slice(0, 120),
      })
    );
  }

  items.sort((a, b) =>
    String(b.createdAt || b.request_date || '').localeCompare(
      String(a.createdAt || a.request_date || '')
    )
  );
  return items;
}

async function executeStripeRefund(stripe, request) {
  const paymentIntent = String(request.payment_intent_id || '').trim();
  if (!paymentIntent) {
    throw new Error('Missing payment_intent_id');
  }
  const idempotencyKey = `refund_${String(request.id || paymentIntent)}`;
  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentIntent,
      reason: 'requested_by_customer',
      metadata: {
        refund_request_id: String(request.id || ''),
        source: String(request.refundSource || 'manual_approval'),
      },
    },
    { idempotencyKey }
  );
  return refund;
}

async function approveRefundRequest(db, stripe, requestId, options = {}) {
  const ref = db.collection(COLLECTION).doc(String(requestId));
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error('Refund request not found');
    err.statusCode = 404;
    throw err;
  }
  const data = snap.data() || {};
  if (data.status === 'refunded') {
    return { id: requestId, ...data, alreadyRefunded: true };
  }
  if (data.status === 'rejected') {
    const err = new Error('Request was rejected and cannot be refunded');
    err.statusCode = 409;
    throw err;
  }
  if (data.status !== 'pending_approval') {
    const err = new Error(`Cannot approve status=${data.status}`);
    err.statusCode = 409;
    throw err;
  }

  console.log(
    JSON.stringify({
      scope: 'refunds.approve',
      id: requestId,
      source: options.source || 'manual_approval',
    })
  );

  const refund = await executeStripeRefund(stripe, {
    ...data,
    id: requestId,
    refundSource: options.source || 'manual_approval',
  });

  const patch = {
    status: 'refunded',
    stripe_refund_id: refund.id,
    refundedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    refundSource: options.source || 'manual_approval',
  };
  await ref.set(patch, { merge: true });

  // Downgrade plan on user when refunded
  if (data.uid) {
    try {
      await db.collection('users').doc(String(data.uid)).set(
        {
          planStatus: 'refunded',
          subscriptionStatus: 'refunded',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (_) {
      /* non-fatal */
    }
  }

  const merged = { id: requestId, ...data, ...patch, stripe_refund_id: refund.id };
  await notifyCustomerRefunded(db, merged);
  return merged;
}

async function rejectRefundRequest(db, requestId, reason) {
  const ref = db.collection(COLLECTION).doc(String(requestId));
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error('Refund request not found');
    err.statusCode = 404;
    throw err;
  }
  const data = snap.data() || {};
  if (data.status !== 'pending_approval') {
    const err = new Error(`Cannot reject status=${data.status}`);
    err.statusCode = 409;
    throw err;
  }
  const rejectReason = String(reason || 'manual_reject').slice(0, 500);
  await ref.set(
    {
      status: 'rejected',
      rejectedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      rejectReason,
    },
    { merge: true }
  );
  console.log(JSON.stringify({ scope: 'refunds.reject', id: requestId }));
  await notifyCustomerRejected(db, { id: requestId, ...data }, rejectReason);
  return { id: requestId, status: 'rejected' };
}

async function listRefundRequests(db, statusFilter) {
  let snap;
  if (statusFilter) {
    snap = await db.collection(COLLECTION).where('status', '==', statusFilter).limit(100).get();
  } else {
    snap = await db.collection(COLLECTION).limit(100).get();
  }
  const items = snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      ...data,
      createdAt: toJsDate(data.createdAt)?.toISOString() || null,
      updatedAt: toJsDate(data.updatedAt)?.toISOString() || null,
      refundedAt: toJsDate(data.refundedAt)?.toISOString() || null,
      request_date: toJsDate(data.request_date)?.toISOString() || null,
    };
  });
  items.sort((a, b) =>
    String(b.createdAt || b.request_date || '').localeCompare(
      String(a.createdAt || a.request_date || '')
    )
  );
  return items;
}

/**
 * Auto-approve pending requests after 10 business days when service still not provided.
 */
async function autoRefundStalePending(db, stripe) {
  const snap = await db
    .collection(COLLECTION)
    .where('status', '==', 'pending_approval')
    .limit(200)
    .get();

  const now = new Date();
  const results = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};

    // Live re-check: if service was provided later, skip auto-refund
    let serviceProvided = data.service_provided === true;
    if (data.uid) {
      const live = await isServiceProvided(db, data.uid);
      if (live) {
        await doc.ref.set(
          {
            service_provided: true,
            updatedAt: FieldValue.serverTimestamp(),
            notes: 'Auto-refund skipped — service marked provided',
          },
          { merge: true }
        );
        results.push({ id: doc.id, ok: false, skipped: 'service_provided' });
        continue;
      }
      serviceProvided = false;
    }
    if (serviceProvided) {
      results.push({ id: doc.id, ok: false, skipped: 'service_provided_flag' });
      continue;
    }

    const anchor =
      toJsDate(data.request_date) || toJsDate(data.purchase_date) || toJsDate(data.createdAt);
    if (!anchor) continue;
    const elapsed = businessDaysElapsed(anchor, now);
    if (elapsed < BUSINESS_DAY_CAP) continue;

    try {
      const out = await approveRefundRequest(db, stripe, doc.id, {
        source: 'auto_10_business_days',
      });
      results.push({ id: doc.id, ok: true, refundId: out.stripe_refund_id });
    } catch (err) {
      console.error(
        JSON.stringify({
          scope: 'refunds.auto',
          id: doc.id,
          error: String(err && err.message ? err.message : err).slice(0, 160),
        })
      );
      results.push({ id: doc.id, ok: false, error: err.message });
    }
  }
  return {
    scanned: snap.size,
    refunded: results.filter((r) => r.ok).length,
    results,
  };
}

module.exports = {
  COLLECTION,
  BUSINESS_DAY_CAP,
  assertAdminPassword,
  businessDaysElapsed,
  isServiceProvided,
  userHasPaidPlan,
  isSubscriptionActive,
  recordUserPayment,
  resolveStripeCustomerId,
  listMyPayments,
  maybeCreatePendingRefundFromCheckout,
  createUserRefundRequest,
  listMyRefundRequests,
  approveRefundRequest,
  rejectRefundRequest,
  listRefundRequests,
  autoRefundStalePending,
  Timestamp,
};
