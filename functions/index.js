/**
 * Stripe Checkout session creator for resumora.net
 * Maps planId → Stripe Price ID dynamically (never a single hardcoded product).
 * Does not modify Stripe Prices — creates Checkout Sessions only.
 */
const path = require('path');
const { onRequest } = require('firebase-functions/v2/https');
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const stripeApiKeySecret = defineSecret('STRIPE_API_KEY');
/** Bilibili member cookies — store in Secret Manager; never commit values. */
const biliSessDataSecret = defineSecret('BILIBILI_SESSDATA');
const biliJctSecret = defineSecret('BILIBILI_BILI_JCT');
const biliDedeUserIdSecret = defineSecret('BILIBILI_DEDE_USER_ID');

function loadEnvFiles() {
  try {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
    require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  } catch (_) {
    /* optional */
  }
}

loadEnvFiles();

/**
 * Safe Stripe secret diagnostics — never log full keys.
 * Returns first 10 characters + "..." (e.g. "sk_live_51...").
 */
function stripeKeyPrefix(key) {
  const v = String(key || '').trim();
  if (!v) return '(empty)';
  return `${v.slice(0, 10)}...`;
}

function stripeKeyKind(key) {
  const v = String(key || '').trim();
  if (!v) return 'missing';
  if (v.startsWith('sk_live_')) return 'live_secret';
  if (v.startsWith('sk_test_')) return 'test_secret';
  if (v.startsWith('whsec_')) return 'webhook_signing';
  if (v.startsWith('rk_live_') || v.startsWith('rk_test_')) return 'restricted';
  return 'unexpected_format';
}

function isInvalidApiKeyError(err) {
  if (!err) return false;
  const msg = String(err.message || err.raw?.message || '');
  const type = String(err.type || err.rawType || '');
  const code = String(err.code || err.raw?.code || '');
  return (
    /invalid api key/i.test(msg) ||
    code === 'api_key_invalid' ||
    type === 'StripeAuthenticationError' ||
    /authentication/i.test(type)
  );
}

function logStripeKeyContext(scope, key, extra) {
  const payload = {
    scope,
    keyPrefix: stripeKeyPrefix(key),
    keyKind: stripeKeyKind(key),
    keyLength: String(key || '').trim().length,
    ...(extra || {}),
  };
  console.error('[stripe] key context', JSON.stringify(payload));
}

const PLAN_ENV_KEYS = {
  basic: [
    'STRIPE_PRICE_BASIC',
    'VITE_STRIPE_PRICE_BASIC',
    'NEXT_PUBLIC_STRIPE_PRICE_BASIC',
    'STRIPE_RESUMORA_BASIC_PRICE_ID',
  ],
  balanced: [
    'STRIPE_PRICE_BALANCED',
    'VITE_STRIPE_PRICE_BALANCED',
    'NEXT_PUBLIC_STRIPE_PRICE_PRO',
    'VITE_STRIPE_PRICE_PRO',
    'STRIPE_RESUMORA_BALANCED_PRICE_ID',
  ],
  professional: [
    'STRIPE_PRICE_PROFESSIONAL_TIER',
    'VITE_STRIPE_PRICE_PROFESSIONAL_TIER',
    'VITE_STRIPE_PRICE_ELITE',
    'NEXT_PUBLIC_STRIPE_PRICE_ELITE',
    'STRIPE_RESUMORA_EXECUTIVE_PRICE_ID',
  ],
  advanced: [
    'STRIPE_PRICE_ADVANCED',
    'VITE_STRIPE_PRICE_ADVANCED',
    'NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL_ADVANCED',
    'STRIPE_RESUMORA_ESSENTIAL_ADVANCED_PRICE_ID',
  ],
};

/** Amount-verified Price IDs (must match UI $29 / $49 / $79 / $110). */
const CANONICAL_PRICE_IDS = {
  basic: 'price_1U4D7wGjsXTaeZBgdrQVEE0M',
  balanced: 'price_1TYBCSGjsXTaeZBgt9c9wB02',
  professional: 'price_1TxeAPGjsXTaeZBgsSoy8CBJ',
  advanced: 'price_1TYBCQGjsXTaeZBg2q8BLeGv',
};

const EXPECTED_CENTS = {
  basic: 2900,
  balanced: 4900,
  professional: 7900,
  advanced: 11000,
};

/**
 * Paid amount → Firestore plan fields.
 * `plan` = public name (basic|pro|business|enterprise)
 * `planId` = internal catalog id (basic|balanced|professional|advanced)
 * Never logs Stripe price ids.
 */
const PLAN_BY_AMOUNT_CENTS = Object.freeze({
  2900: { plan: 'basic', planId: 'basic' },
  4900: { plan: 'pro', planId: 'balanced' },
  7900: { plan: 'business', planId: 'professional' },
  11000: { plan: 'enterprise', planId: 'advanced' },
});

const PUBLIC_PLAN_FROM_CANONICAL = Object.freeze({
  basic: 'basic',
  balanced: 'pro',
  professional: 'business',
  advanced: 'enterprise',
});

function firstEnv(keys) {
  for (const key of keys) {
    const v = process.env[key];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

/** Prefer the first env value that is a real Stripe Price ID (skips "$29"-style placeholders). */
function firstPriceEnv(keys) {
  for (const key of keys) {
    const v = String(process.env[key] || '').trim();
    if (/^price_/.test(v)) return v;
  }
  return '';
}

function resolvePriceId(planId, bodyPriceId) {
  const canonical = CANONICAL_PRICE_IDS[planId] || '';
  const mapped = firstPriceEnv(PLAN_ENV_KEYS[planId] || []);
  // 1) Cloud Run / function env Live Price IDs
  if (mapped) return mapped;
  // 2) Client-sent price_… (amount verified later via expectedCents)
  if (bodyPriceId && /^price_/.test(String(bodyPriceId))) return String(bodyPriceId);
  // 3) Hardcoded fallback (often test-mode) — last resort
  if (canonical) return canonical;
  return '';
}

function cors(res, req) {
  const origin = String((req && req.get && req.get('origin')) || '');
  const allowed = new Set([
    'https://resumora.net',
    'https://www.resumora.net',
    'https://client-resumora-live.web.app',
  ]);
  const local = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
  const allow = local ? origin : allowed.has(origin) ? origin : 'https://resumora.net';
  res.set('Access-Control-Allow-Origin', allow);
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password, Authorization');
  res.set('Vary', 'Origin');
}

const heygen = require('./heygen');
const veo = require('./veo');
const videoLocalizer = require('./videoLocalizer');
const bilibiliPublish = require('./bilibiliPublish');
const mediaDistribute = require('./mediaDistribute');
const publishToSocial = require('./publishToSocial');
const videoAgent = require('./videoAgent');
const resumeVerify = require('./resumeVerify');
const refunds = require('./refunds');
const invoiceEmail = require('./invoiceEmail');
const supportAgent = require('./supportAgent');
const selfHeal = require('./selfHeal');
const stripeKyc = require('./stripeKyc');
const notifications = require('./notifications');
const supportPolicy = require('./supportPolicy');
const clientDashboard = require('./clientDashboard');
const { onSchedule } = require('firebase-functions/v2/scheduler');

/** Optional notify/email — set on Cloud Run / functions env (never log values). */
function hydrateResendEnv() {
  /* RESEND_API_KEY + ADMIN_NOTIFY_EMAIL + REFUND_EMAIL_FROM read from process.env */
}

function readAdminRefundPassword() {
  return String(process.env.ADMIN_REFUND_PASSWORD || '').trim();
}

/**
 * Verify Firebase ID token from Authorization: Bearer <token>.
 * @returns {Promise<import('firebase-admin/auth').DecodedIdToken>}
 */
async function requireFirebaseUser(req) {
  const header = String(req.get('authorization') || req.get('Authorization') || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const err = new Error('Missing Authorization Bearer token');
    err.statusCode = 401;
    throw err;
  }
  try {
    return await getAuth().verifyIdToken(match[1].trim());
  } catch (_) {
    const err = new Error('Invalid or expired auth token');
    err.statusCode = 401;
    throw err;
  }
}

/**
 * Authenticated user with active paid plan (Firestore users/{uid}).
 * @returns {Promise<{ uid: string, email?: string, profile: object }>}
 */
async function requirePaidPlanUser(req) {
  const decoded = await requireFirebaseUser(req);
  const snap = await db.collection('users').doc(decoded.uid).get();
  const profile = snap.exists ? snap.data() || {} : {};
  const planStatus = String(profile.planStatus || '').toLowerCase();
  const sub = String(profile.subscriptionStatus || '').toLowerCase();
  const active =
    planStatus === 'active' ||
    sub === 'active' ||
    profile.paid === true ||
    String(profile.serviceStatus || '').toLowerCase() === 'activated';
  if (!active) {
    const err = new Error('Active paid plan required for Studio video generation');
    err.statusCode = 403;
    err.code = 'PLAN_REQUIRED';
    throw err;
  }
  return { uid: decoded.uid, email: decoded.email || profile.email, profile };
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (_) {
      body = {};
    }
  }
  return body || {};
}

function stripeCustomerIdFromObject(obj) {
  if (!obj) return '';
  if (typeof obj.customer === 'string') return obj.customer;
  if (obj.customer && obj.customer.id) return String(obj.customer.id);
  return '';
}

/** Map Stripe Price ID → canonical plan id without logging the price id. */
function planIdFromPriceId(priceId) {
  const id = String(priceId || '').trim();
  if (!id) return '';
  for (const [plan, canonical] of Object.entries(CANONICAL_PRICE_IDS)) {
    if (canonical === id) return plan;
  }
  for (const [plan, keys] of Object.entries(PLAN_ENV_KEYS)) {
    const mapped = firstPriceEnv(keys);
    if (mapped && mapped === id) return plan;
  }
  return '';
}

function planIdFromAmountCents(cents) {
  const hit = PLAN_BY_AMOUNT_CENTS[Number(cents)];
  return hit ? hit.planId : '';
}

function publicPlanFromCanonical(canonical) {
  const id = String(canonical || '')
    .trim()
    .toLowerCase();
  return PUBLIC_PLAN_FROM_CANONICAL[id] || '';
}

function entitlementFromAmountCents(cents) {
  const hit = PLAN_BY_AMOUNT_CENTS[Number(cents)];
  return hit ? { plan: hit.plan, planId: hit.planId } : null;
}

function entitlementFromCanonical(canonical) {
  const planId = normalizePlanId(canonical);
  if (!planId || !(CANONICAL_PRICE_IDS[planId] || PLAN_ENV_KEYS[planId])) return null;
  return {
    planId,
    plan: publicPlanFromCanonical(planId) || planId,
  };
}

/**
 * Resolve Firebase uid from checkout/subscription object.
 * Order: client_reference_id → metadata → stripeCustomerId → Stripe customer metadata → email.
 */
async function resolveFirebaseUidFromStripeObject(stripe, obj) {
  let uid =
    (obj.client_reference_id && String(obj.client_reference_id).trim()) ||
    (obj.metadata && (obj.metadata.firebaseUID || obj.metadata.uid)) ||
    '';
  uid = String(uid || '').trim();

  const customerId = stripeCustomerIdFromObject(obj);
  if (!uid && customerId) {
    try {
      const q = await db
        .collection('users')
        .where('stripeCustomerId', '==', customerId)
        .limit(1)
        .get();
      if (!q.empty) uid = q.docs[0].id;
    } catch (err) {
      console.warn('[stripeWebhook] stripeCustomerId lookup failed', err && err.message);
    }
  }

  if (!uid && customerId && stripe) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer && !customer.deleted) {
        uid = String(
          (customer.metadata && (customer.metadata.firebaseUID || customer.metadata.uid)) || ''
        ).trim();
      }
    } catch (err) {
      console.warn('[stripeWebhook] customer retrieve failed', err && err.message);
    }
  }

  const email =
    (obj.customer_details && obj.customer_details.email) ||
    (obj.customer_email && String(obj.customer_email)) ||
    '';
  if (!uid && email) {
    try {
      const user = await getAuth().getUserByEmail(String(email));
      uid = user.uid;
    } catch (_) {
      /* no auth user for email yet */
    }
  }

  return { uid, email: email ? String(email) : '', customerId };
}

/** UI aliases → canonical plan ids (never log Stripe price ids). */
function normalizePlanId(raw) {
  const id = String(raw || '')
    .trim()
    .toLowerCase();
  if (!id) return '';
  const aliases = {
    pro: 'balanced',
    business: 'professional',
    enterprise: 'advanced',
    essential: 'basic',
  };
  const mapped = aliases[id] || id;
  if (CANONICAL_PRICE_IDS[mapped] || PLAN_ENV_KEYS[mapped]) return mapped;
  return mapped;
}

/**
 * Resolve plan entitlement for webhook writes.
 * Priority: amount_total (strict cents map) → line item price → metadata.
 * Metadata alone must NEVER override a known paid amount (fixes $29 → "pro" bug).
 * @returns {Promise<{ plan: string|null, planId: string|null, amount_total: number, source: string }>}
 */
async function resolvePlanEntitlementFromStripeObject(stripe, obj, eventType) {
  let amountTotal = Number(obj.amount_total) || 0;
  let fromPrice = null;

  if (eventType === 'checkout.session.completed' && obj.id && stripe) {
    try {
      const full = await stripe.checkout.sessions.retrieve(obj.id, {
        expand: ['line_items.data.price'],
      });
      amountTotal = Number(full.amount_total || amountTotal) || amountTotal;
      const line = full.line_items && full.line_items.data && full.line_items.data[0];
      const priceObj = line && line.price;
      const priceId = (priceObj && (typeof priceObj === 'string' ? priceObj : priceObj.id)) || '';
      const unit = priceObj && typeof priceObj === 'object' ? Number(priceObj.unit_amount) || 0 : 0;
      if (!amountTotal && unit) amountTotal = unit;
      fromPrice = entitlementFromCanonical(planIdFromPriceId(priceId));
    } catch (err) {
      console.warn('[stripeWebhook] session expand for plan failed', err && err.message);
    }
  }

  const fromAmount = entitlementFromAmountCents(amountTotal);
  if (fromAmount) {
    console.log(
      JSON.stringify({
        scope: 'stripeWebhook',
        step: 'plan_map',
        amount_total: amountTotal,
        plan: fromAmount.plan,
        planId: fromAmount.planId,
        source: 'amount',
      })
    );
    return { ...fromAmount, amount_total: amountTotal, source: 'amount' };
  }

  if (fromPrice) {
    console.log(
      JSON.stringify({
        scope: 'stripeWebhook',
        step: 'plan_map',
        amount_total: amountTotal,
        plan: fromPrice.plan,
        planId: fromPrice.planId,
        source: 'price',
      })
    );
    return { ...fromPrice, amount_total: amountTotal, source: 'price' };
  }

  const fromMeta = entitlementFromCanonical(
    (obj.metadata && (obj.metadata.planId || obj.metadata.plan)) || ''
  );
  if (fromMeta) {
    console.log(
      JSON.stringify({
        scope: 'stripeWebhook',
        step: 'plan_map',
        amount_total: amountTotal,
        plan: fromMeta.plan,
        planId: fromMeta.planId,
        source: 'metadata',
      })
    );
    return { ...fromMeta, amount_total: amountTotal, source: 'metadata' };
  }

  console.log(
    JSON.stringify({
      scope: 'stripeWebhook',
      step: 'plan_map',
      amount_total: amountTotal,
      plan: null,
      planId: null,
      source: 'unresolved',
    })
  );
  return { plan: null, planId: null, amount_total: amountTotal, source: 'unresolved' };
}

/** @deprecated Prefer resolvePlanEntitlementFromStripeObject */
async function resolvePlanIdFromStripeObject(stripe, obj, eventType) {
  const ent = await resolvePlanEntitlementFromStripeObject(stripe, obj, eventType);
  return ent.planId || '';
}

function paymentIntentIdFromObject(obj) {
  if (!obj) return '';
  if (typeof obj.payment_intent === 'string') return obj.payment_intent;
  if (obj.payment_intent && obj.payment_intent.id) return String(obj.payment_intent.id);
  return '';
}

/**
 * Ensure users/{uid} has a Stripe customer id; create or reuse by email.
 * Never logs full secret/price values — only whether a cus_ id was linked.
 * @returns {Promise<string>} stripeCustomerId or ''
 */
async function ensureStripeCustomerLinked(stripe, { uid, email, fullName }) {
  if (!stripe || !uid) return '';
  const userRef = db.collection('users').doc(String(uid));
  const userSnap = await userRef.get();
  const existing = userSnap.exists ? userSnap.data() || {} : {};
  let stripeCustomerId = String(existing.stripeCustomerId || '').trim();
  const customerEmail = String(email || existing.email || '')
    .trim()
    .toLowerCase();

  // Validate stored id still exists in Stripe
  if (stripeCustomerId.startsWith('cus_')) {
    try {
      const cust = await stripe.customers.retrieve(stripeCustomerId);
      if (cust && !cust.deleted) {
        return stripeCustomerId;
      }
      stripeCustomerId = '';
    } catch (_) {
      stripeCustomerId = '';
    }
  } else {
    stripeCustomerId = '';
  }

  // Reuse existing Stripe customer by email (manual activation / Payment Link gaps)
  if (!stripeCustomerId && customerEmail.includes('@')) {
    try {
      const found = await stripe.customers.list({ email: customerEmail, limit: 5 });
      const match = (found.data || []).find((c) => !c.deleted);
      if (match && match.id) {
        stripeCustomerId = String(match.id);
      }
    } catch (err) {
      console.warn('[ensureStripeCustomer] email lookup failed', err && err.message);
    }
  }

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: customerEmail.includes('@') ? customerEmail : undefined,
      name: fullName || existing.fullName || undefined,
      metadata: {
        firebaseUID: String(uid),
        uid: String(uid),
        source: 'resumora.net',
      },
    });
    stripeCustomerId = customer.id;
  } else {
    // Keep Firebase UID on the Stripe customer for webhook resolution
    try {
      await stripe.customers.update(stripeCustomerId, {
        metadata: {
          firebaseUID: String(uid),
          uid: String(uid),
          source: 'resumora.net',
        },
        ...(customerEmail.includes('@') ? { email: customerEmail } : {}),
      });
    } catch (_) {
      /* non-fatal */
    }
  }

  await userRef.set(
    {
      uid: String(uid),
      stripeCustomerId,
      email: customerEmail.includes('@') ? customerEmail : existing.email || null,
      planStatus: existing.planStatus || 'pending',
      subscriptionStatus: existing.subscriptionStatus || 'pending',
      updatedAt: FieldValue.serverTimestamp(),
      ...(userSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      source: 'ensure_stripe_customer',
    },
    { merge: true }
  );

  console.log(
    JSON.stringify({
      scope: 'ensureStripeCustomer',
      uid,
      hasCustomer: Boolean(stripeCustomerId),
      createdOrLinked: true,
    })
  );

  return stripeCustomerId;
}

/**
 * Stripe webhook: checkout.session.completed → users/{uid} plan + subscriptionStatus=active
 * Also used by Stripe CLI local forward and Dashboard endpoint.
 */
async function handleStripeWebhook(req, res, stripeSecret, whSecretOverride) {
  const Stripe = require('stripe');
  const stripe = new Stripe(stripeSecret, { apiVersion: '2024-11-20.acacia' });
  const whSecret = whSecretOverride || process.env.STRIPE_WEBHOOK_SECRET || '';
  const sig = req.get('stripe-signature') || req.get('Stripe-Signature') || '';

  let event;
  try {
    const raw =
      typeof req.rawBody !== 'undefined'
        ? req.rawBody
        : Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
    if (whSecret && sig) {
      event = stripe.webhooks.constructEvent(raw, sig, whSecret);
    } else {
      event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }
  } catch (err) {
    if (String(process.env.FUNCTIONS_EMULATOR || '') === 'true') {
      console.warn(
        '[stripeWebhook] signature mismatch in emulator — accepting event for local test:',
        err && err.message
      );
      try {
        event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      } catch (_) {
        res.status(400).send(`Webhook Error: ${err && err.message ? err.message : 'invalid'}`);
        return;
      }
    } else {
      console.error('[stripeWebhook] signature/parse failed', err && err.message);
      res.status(400).send(`Webhook Error: ${err && err.message ? err.message : 'invalid'}`);
      return;
    }
  }

  console.log(`[stripeWebhook] Received event: ${event.type}`);

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.created'
  ) {
    const obj = event.data && event.data.object ? event.data.object : {};

    if (
      event.type === 'checkout.session.completed' &&
      obj.payment_status &&
      obj.payment_status !== 'paid' &&
      obj.payment_status !== 'no_payment_required'
    ) {
      console.log(
        JSON.stringify({
          scope: 'stripeWebhook',
          event: 'checkout_skipped_unpaid',
          payment_status: obj.payment_status,
          sessionPrefix: String(obj.id || '').slice(0, 8),
        })
      );
      res.status(200).json({ received: true, type: event.type, skipped: 'unpaid' });
      return;
    }

    try {
      const { uid, email, customerId } = await resolveFirebaseUidFromStripeObject(stripe, obj);
      const entitlement = await resolvePlanEntitlementFromStripeObject(stripe, obj, event.type);
      const planId = entitlement.planId || null;
      const planPublic = entitlement.plan || null;
      const amountTotal = Number(entitlement.amount_total) || Number(obj.amount_total) || 0;
      const subStatus =
        event.type.startsWith('customer.subscription') && obj.status
          ? String(obj.status)
          : 'active';
      const planStatus =
        subStatus === 'active' || subStatus === 'trialing'
          ? 'active'
          : String(subStatus || 'pending');

      const isEmu = String(process.env.FUNCTIONS_EMULATOR || '') === 'true';
      if (isEmu && !process.env.FIRESTORE_EMULATOR_HOST) {
        console.log(
          JSON.stringify({
            scope: 'stripeWebhook',
            event: 'emulator_dry_run',
            uid: uid || null,
            amount_total: amountTotal,
            plan: planPublic || null,
            planId: planId || null,
            subscriptionStatus: planStatus,
          })
        );
      } else if (uid) {
        let customerIdFinal = customerId;
        // Session may only have customer after completion — re-fetch if missing.
        if (!customerIdFinal && event.type === 'checkout.session.completed' && obj.id) {
          try {
            const full = await stripe.checkout.sessions.retrieve(obj.id);
            customerIdFinal = stripeCustomerIdFromObject(full) || customerIdFinal;
          } catch (_) {
            /* soft */
          }
        }

        const paymentIntentId = paymentIntentIdFromObject(obj);
        const patch = {
          uid,
          subscriptionStatus: planStatus,
          planStatus,
          paid: planStatus === 'active',
          purchaseDate: FieldValue.serverTimestamp(),
          stripeCheckoutSessionId: obj.id || null,
          updatedAt: FieldValue.serverTimestamp(),
          source: 'stripe_webhook',
        };
        // Always overwrite plan fields from amount-first entitlement (no sticky "pro" default).
        if (planPublic || planId) {
          patch.plan = planPublic || publicPlanFromCanonical(planId) || planId;
          patch.planId = planId || normalizePlanId(planPublic) || null;
        }
        // Always persist Stripe customer id when available (fixes manual activations).
        if (customerIdFinal) {
          patch.stripeCustomerId = customerIdFinal;
        }
        if (email) patch.email = email;
        if (paymentIntentId) {
          patch.lastPaymentIntentId = paymentIntentId;
          patch.payment_intent_id = paymentIntentId;
        }
        if (amountTotal > 0) {
          patch.lastAmountTotal = amountTotal;
          patch.lastCurrency = String(obj.currency || 'usd');
        }

        const userRef = db.collection('users').doc(uid);
        const existing = await userRef.get();
        if (!existing.exists) {
          patch.createdAt = FieldValue.serverTimestamp();
        }

        await userRef.set(patch, { merge: true });

        // Payment history + no-reply activation emails
        if (event.type === 'checkout.session.completed') {
          try {
            await refunds.recordUserPayment(db, {
              uid,
              checkoutSessionId: obj.id || null,
              paymentIntentId: paymentIntentId || null,
              amount: amountTotal || 0,
              currency: obj.currency || 'usd',
              planId: planId || null,
              stripeCustomerId: customerIdFinal || null,
              email: email || null,
            });
          } catch (payErr) {
            console.warn('[stripeWebhook] payment history write failed', payErr && payErr.message);
          }
          if (email && planStatus === 'active') {
            const locale = (existing.exists && existing.data() && existing.data().locale) || 'en';
            try {
              await notifications.sendNotificationEmail({
                to: email,
                templateKey: 'payment.succeeded',
                locale,
              });
              await notifications.sendNotificationEmail({
                to: email,
                templateKey: 'account.activated',
                locale,
              });
            } catch (mailErr) {
              console.warn('[stripeWebhook] notification email failed', mailErr && mailErr.message);
            }
          }
        }

        console.log(
          JSON.stringify({
            scope: 'stripeWebhook',
            event: 'user_entitlement_updated',
            uid,
            amount_total: amountTotal,
            plan: planPublic || null,
            planId: planId || null,
            planSource: entitlement.source || null,
            subscriptionStatus: planStatus,
            planStatus,
            created: !existing.exists,
            hasCustomer: Boolean(customerIdFinal),
            hasPaymentIntent: Boolean(paymentIntentId),
          })
        );
      } else {
        const docRef = await db.collection('webhook_events').add({
          type: event.type,
          sessionId: obj.id || null,
          email: email || null,
          planId: planId || null,
          plan: planPublic || null,
          amount_total: amountTotal || null,
          subscriptionStatus: subStatus,
          receivedAt: FieldValue.serverTimestamp(),
          note: 'No firebaseUID / stripeCustomerId / email match; logged for ops',
        });
        console.log(`[stripeWebhook] webhook_events/${docRef.id} logged (no uid)`);
      }

      // Manual Approval Refund: queue pending_approval when service not provided
      if (event.type === 'checkout.session.completed') {
        try {
          await refunds.maybeCreatePendingRefundFromCheckout(db, obj, uid);
        } catch (refundErr) {
          console.error(
            '[stripeWebhook] pending refund create failed',
            refundErr && refundErr.message
          );
        }
        // Invoice email — never fail the webhook if mail fails
        try {
          await invoiceEmail.sendInvoiceEmailAfterCheckout(db, stripe, obj, uid);
        } catch (mailErr) {
          console.error('[stripeWebhook] invoice email failed', mailErr && mailErr.message);
        }
      }
    } catch (err) {
      console.error('[stripeWebhook] Firestore write failed', err && err.message);
      res.status(500).json({ error: 'Failed to update subscriptionStatus' });
      return;
    }
  }

  res.status(200).json({ received: true, type: event.type });
}

/** Dedicated production webhook for Stripe Dashboard (paste this URL in Webhooks). */
exports.stripeWebhook = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 30,
    memory: '256MiB',
    invoker: 'public',
    secrets: [stripeWebhookSecret, stripeApiKeySecret],
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    hydrateResendEnv();
    let stripeSecret = '';
    try {
      stripeSecret =
        stripeApiKeySecret.value() ||
        process.env.STRIPE_SECRET_KEY ||
        process.env.STRIPE_API_KEY ||
        '';
    } catch (secretErr) {
      console.error(
        '[stripeWebhook] failed reading STRIPE_API_KEY secret:',
        secretErr && secretErr.message
      );
      stripeSecret = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || '';
    }
    if (!stripeSecret) {
      logStripeKeyContext('stripeWebhook', stripeSecret, { reason: 'missing_secret' });
      res.status(500).json({ error: 'Stripe API key secret missing' });
      return;
    }
    let whSecret = '';
    try {
      whSecret = stripeWebhookSecret.value() || process.env.STRIPE_WEBHOOK_SECRET || '';
    } catch (_) {
      whSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    }
    try {
      await handleStripeWebhook(req, res, stripeSecret, whSecret);
    } catch (err) {
      if (isInvalidApiKeyError(err)) {
        logStripeKeyContext('stripeWebhook', stripeSecret, {
          reason: 'invalid_api_key',
          stripeType: err.type || null,
          stripeCode: err.code || null,
          message: err.message || null,
        });
        res.status(502).json({
          error: 'Invalid Stripe API key',
          keyPrefix: stripeKeyPrefix(stripeSecret),
          keyKind: stripeKeyKind(stripeSecret),
        });
        return;
      }
      console.error('[stripeWebhook] unhandled error', err && err.message);
      res.status(500).json({ error: err && err.message ? err.message : 'Webhook failed' });
    }
  }
);

exports.createCheckoutSession = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 30,
    memory: '256MiB',
    invoker: 'public',
    // Prefer Secret Manager (STRIPE_API_KEY) with env fallback STRIPE_SECRET_KEY
    secrets: [stripeApiKeySecret, stripeWebhookSecret],
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    let secret = '';
    try {
      secret =
        stripeApiKeySecret.value() ||
        process.env.STRIPE_SECRET_KEY ||
        process.env.STRIPE_API_KEY ||
        '';
    } catch (secretErr) {
      console.error(
        '[createCheckoutSession] failed reading STRIPE_API_KEY secret:',
        secretErr && secretErr.message
      );
      secret = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || '';
    }
    if (!secret) {
      logStripeKeyContext('createCheckoutSession', secret, { reason: 'missing_secret' });
      res
        .status(500)
        .json({ error: 'STRIPE_SECRET_KEY / STRIPE_API_KEY is not configured on the server.' });
      return;
    }

    // Stripe CLI / Dashboard webhook → same URL (bypasses Cloud IAM 403 when local)
    if (req.get('stripe-signature') || req.get('Stripe-Signature')) {
      let whSecret = '';
      try {
        whSecret = stripeWebhookSecret.value() || process.env.STRIPE_WEBHOOK_SECRET || '';
      } catch (_) {
        whSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
      }
      await handleStripeWebhook(req, res, secret, whSecret);
      return;
    }

    let body = parseBody(req);

    const planId = String(body.planId || '').trim();
    if (!CANONICAL_PRICE_IDS[planId] && !PLAN_ENV_KEYS[planId]) {
      res.status(400).json({
        error: `Invalid planId. Expected one of: ${Object.keys(CANONICAL_PRICE_IDS).join(', ')}`,
      });
      return;
    }

    const priceId = resolvePriceId(planId, body.priceId);
    if (!priceId) {
      res.status(400).json({ error: `No Stripe Price ID mapped for plan "${planId}".` });
      return;
    }

    const expectedCents = Number(body.expectedCents || EXPECTED_CENTS[planId] || 0);

    // Firebase-only redirects — never Render / onrender.com
    const CANONICAL_SUCCESS =
      'https://client-resumora-live.web.app/studio?session_id={CHECKOUT_SESSION_ID}';
    const CANONICAL_CANCEL = 'https://resumora.net/pricing';

    function isForbiddenRedirect(url) {
      const u = String(url || '').toLowerCase();
      return !u || u.includes('onrender.com') || u.includes('render.com');
    }

    const successUrl = isForbiddenRedirect(body.successUrl)
      ? CANONICAL_SUCCESS
      : String(body.successUrl);
    const cancelUrl = isForbiddenRedirect(body.cancelUrl)
      ? CANONICAL_CANCEL
      : String(body.cancelUrl);

    try {
      const Stripe = require('stripe');
      const stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });

      // Lifetime / one-time only — enforce amount match + payment mode
      const price = await stripe.prices.retrieve(priceId);
      if (expectedCents && Number(price.unit_amount) !== expectedCents) {
        res.status(400).json({
          error: `Stripe price amount mismatch for "${planId}": expected ${expectedCents}, got ${price.unit_amount}.`,
          planId,
          priceId,
          expectedCents,
          actualCents: price.unit_amount,
        });
        return;
      }
      if (price.type === 'recurring') {
        res.status(400).json({
          error: `Plan "${planId}" must use a one-time (lifetime) Stripe Price, not a recurring subscription price.`,
          planId,
          priceId,
          priceType: price.type,
        });
        return;
      }
      const mode = 'payment';
      const firebaseUID = String(body.firebaseUID || body.uid || '').trim();
      const customerEmail = String(body.customerEmail || body.email || '').trim();

      let stripeCustomerId = '';
      if (firebaseUID) {
        try {
          stripeCustomerId = await ensureStripeCustomerLinked(stripe, {
            uid: firebaseUID,
            email: customerEmail,
          });
        } catch (custErr) {
          console.error(
            '[createCheckoutSession] stripe customer ensure failed',
            custErr && custErr.message
          );
        }
      } else if (customerEmail) {
        // Guest/email-only: prefer existing Stripe customer by email (no Firestore uid yet).
        try {
          const found = await stripe.customers.list({
            email: customerEmail.toLowerCase(),
            limit: 3,
          });
          const match = (found.data || []).find((c) => !c.deleted);
          if (match) stripeCustomerId = match.id;
          else {
            const created = await stripe.customers.create({
              email: customerEmail,
              metadata: { source: 'resumora.net', note: 'checkout_without_uid' },
            });
            stripeCustomerId = created.id;
          }
        } catch (custErr) {
          console.error(
            '[createCheckoutSession] guest customer ensure failed',
            custErr && custErr.message
          );
        }
      }

      if (!stripeCustomerId && !customerEmail) {
        res.status(400).json({
          error: 'Sign in or provide email so checkout can link a Stripe customer.',
        });
        return;
      }

      const session = await stripe.checkout.sessions.create({
        mode,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        ...(firebaseUID ? { client_reference_id: firebaseUID } : {}),
        ...(stripeCustomerId ? { customer: stripeCustomerId } : { customer_email: customerEmail }),
        metadata: {
          planId,
          source: 'resumora.net',
          expected_cents: String(expectedCents || price.unit_amount || ''),
          advisory_only_ui: 'true',
          ...(firebaseUID ? { firebaseUID, uid: firebaseUID } : {}),
        },
        allow_promotion_codes: true,
      });

      console.log(
        '[createCheckoutSession] ok',
        JSON.stringify({
          planId,
          mode,
          sessionPrefix: String(session.id || '').slice(0, 8),
          hasUid: Boolean(firebaseUID),
          hasCustomer: Boolean(stripeCustomerId),
          keyPrefix: stripeKeyPrefix(secret),
          keyKind: stripeKeyKind(secret),
        })
      );

      res.status(200).json({
        sessionId: session.id,
        url: session.url,
        planId,
        priceId,
        mode,
        amount: price.unit_amount,
      });
    } catch (err) {
      if (isInvalidApiKeyError(err)) {
        logStripeKeyContext('createCheckoutSession', secret, {
          reason: 'invalid_api_key',
          planId,
          priceId,
          stripeType: err.type || null,
          stripeCode: err.code || null,
          message: err.message || null,
        });
        res.status(502).json({
          error: 'Invalid Stripe API key',
          keyPrefix: stripeKeyPrefix(secret),
          keyKind: stripeKeyKind(secret),
          hint: 'Confirm Cloud Run / Secret Manager uses the new sk_live_ key (first 10 chars must match).',
        });
        return;
      }
      console.error(
        '[createCheckoutSession] failed',
        JSON.stringify({
          message: err && err.message ? err.message : 'unknown',
          type: err && err.type ? err.type : null,
          code: err && err.code ? err.code : null,
          keyPrefix: stripeKeyPrefix(secret),
          keyKind: stripeKeyKind(secret),
          planId,
          priceId,
        })
      );
      res.status(500).json({
        error: err && err.message ? err.message : 'Stripe Checkout session creation failed',
        keyPrefix: stripeKeyPrefix(secret),
      });
    }
  }
);

// Keep a tiny health marker for local verification
exports._plansMapped = () => Object.keys(PLAN_ENV_KEYS);

exports.heygenVideoCatalog = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 30,
    memory: '256MiB',
    invoker: 'public',
  },
  async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      const catalog = await heygen.getCatalog();
      res.status(200).json(catalog);
    } catch (err) {
      res.status(500).json({ error: err.message || 'Catalog failed' });
    }
  }
);

exports.heygenVideoGenerate = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 120,
    memory: '512MiB',
    invoker: 'public',
  },
  async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      const result = await heygen.generateVideo(parseBody(req));
      res.status(200).json(result);
    } catch (err) {
      const code =
        err.code === 'MISSING_KEY' || err.code === 'CONFIG'
          ? 503
          : err.code === 'BAD_REQUEST'
            ? 400
            : 500;
      res.status(code).json({ error: err.message || 'Generate failed', code: err.code || null });
    }
  }
);

exports.heygenVideoStatus = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 30,
    memory: '256MiB',
    invoker: 'public',
  },
  async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      const videoId = String(req.query.videoId || '').trim();
      const result = await heygen.getVideoStatus(videoId);
      res.status(200).json(result);
    } catch (err) {
      const code = err.code === 'MISSING_KEY' ? 503 : err.code === 'BAD_REQUEST' ? 400 : 500;
      res.status(code).json({ error: err.message || 'Status failed', code: err.code || null });
    }
  }
);

exports.heygenVideoDownload = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 30,
    memory: '256MiB',
    invoker: 'public',
  },
  async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      const result = await heygen.recordDownload(parseBody(req));
      res.status(result.ok ? 200 : 403).json(result);
    } catch (err) {
      const code = err.code === 'BAD_REQUEST' ? 400 : 500;
      res
        .status(code)
        .json({ error: err.message || 'Download track failed', code: err.code || null });
    }
  }
);

/**
 * Google Veo 3 — paid members only.
 * POST /api/video/google-generate
 * Body: { prompt, imageBase64?, mimeType?, wait?, durationSeconds?, aspectRatio?, agent? }
 * When agent=true, uses runVideoGenerationAgent (capped retries + verification).
 */
exports.generateGoogleVideo = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 540,
    memory: '1GiB',
    invoker: 'public',
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      const paid = await requirePaidPlanUser(req);
      const body = parseBody(req);
      const useAgent = body.agent === true || body.workflow === 'agent';
      let result;
      if (useAgent) {
        result = await videoAgent.runVideoGenerationAgent({
          db,
          mode: 'veo',
          videoId: body.videoId || body.video_id || `studio-${paid.uid}`,
          prompt: body.prompt || body.text,
          veoOpts: {
            imageBase64: body.imageBase64 || body.image,
            mimeType: body.mimeType || body.imageMimeType,
            imageGcsUri: body.imageGcsUri,
            durationSeconds: body.durationSeconds,
            aspectRatio: body.aspectRatio,
            resolution: body.resolution,
          },
          maxWaitMs: body.maxWaitMs,
        });
      } else {
        result = await veo.generateAndWait({
          prompt: body.prompt || body.text,
          imageBase64: body.imageBase64 || body.image,
          mimeType: body.mimeType || body.imageMimeType,
          imageGcsUri: body.imageGcsUri,
          durationSeconds: body.durationSeconds,
          aspectRatio: body.aspectRatio,
          resolution: body.resolution,
          wait: body.wait !== false && body.async !== true,
          maxWaitMs: body.maxWaitMs,
        });
      }
      console.log(
        JSON.stringify({
          scope: 'generateGoogleVideo',
          uid: paid.uid,
          status: result.status,
          done: Boolean(result.done),
          hasUrl: Boolean(result.videoUrl),
          agent: Boolean(useAgent),
        })
      );
      res.status(200).json(result);
    } catch (err) {
      const code =
        err.statusCode ||
        (err.code === 'BAD_REQUEST'
          ? 400
          : err.code === 'AUTH' || err.code === 'CONFIG'
            ? 503
            : err.code === 'PLAN_REQUIRED'
              ? 403
              : err.code === 'GENERATION_FAILED'
                ? 503
                : 500);
      console.error(
        JSON.stringify({
          scope: 'generateGoogleVideo',
          error: String(err && err.message ? err.message : err).slice(0, 200),
          code: err.code || null,
        })
      );
      res.status(code).json({
        error: err.message || 'Google Veo generation failed',
        code: err.code || null,
        operationName: err.operationName || null,
        fallback: err.fallback || null,
        attempts: err.attempts || null,
      });
    }
  }
);

/**
 * Poll Veo LRO — paid members only.
 * GET /api/video/google-status?operationName=...
 * POST /api/video/google-status { operationName }
 */
exports.googleVideoStatus = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 60,
    memory: '512MiB',
    invoker: 'public',
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      await requirePaidPlanUser(req);
      const body = req.method === 'POST' ? parseBody(req) : {};
      const operationName = String(body.operationName || req.query.operationName || '').trim();
      const result = await veo.getStatus(operationName);
      res.status(200).json(result);
    } catch (err) {
      const code =
        err.statusCode || (err.code === 'BAD_REQUEST' ? 400 : err.code === 'AUTH' ? 503 : 500);
      res.status(code).json({
        error: err.message || 'Status failed',
        code: err.code || null,
      });
    }
  }
);

/**
 * Resume parse verification layer.
 * POST /api/resume/verify-parse
 * Body: { parsed, fileName?, source? }
 */
exports.verifyResumeParse = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 30,
    memory: '256MiB',
    invoker: 'public',
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      let uid = null;
      try {
        const authHeader = String(req.get('Authorization') || '');
        if (authHeader.toLowerCase().startsWith('bearer ')) {
          const decoded = await getAuth().verifyIdToken(authHeader.slice(7).trim());
          uid = decoded.uid;
        }
      } catch (_) {
        /* optional auth */
      }
      const body = parseBody(req);
      const parsed = body.parsed || body.draft || body;
      const check = resumeVerify.verifyResumeParsing(parsed);
      if (check.ok) {
        res.status(200).json({
          status: 'ok',
          parsed: check.normalized,
          errors: [],
        });
        return;
      }
      console.warn(
        JSON.stringify({
          scope: 'verifyResumeParse',
          errors: check.errors,
          fileName: String(body.fileName || body.originalFile || '').slice(0, 120),
        })
      );
      await resumeVerify.recordFailedParse(db, {
        fileName: body.fileName || body.originalFile || parsed.originalFile,
        errors: check.errors,
        source: body.source || parsed.source || 'api',
        uid,
        rawTextLength: String(parsed.rawText || '').length,
      });
      res.status(422).json({
        ...resumeVerify.CLIENT_ERROR_PAYLOAD,
        errors: check.errors,
      });
    } catch (err) {
      res.status(500).json({
        status: 'error',
        message: err.message || 'Verification failed',
        code: err.code || null,
      });
    }
  }
);

/**
 * Agentic Veo / localize workflow with capped retries (max 3 attempts).
 * POST /api/video/agent-generate
 */
exports.videoGenerationAgent = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 540,
    memory: '1GiB',
    invoker: 'public',
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      const paid = await requirePaidPlanUser(req);
      const body = parseBody(req);
      const result = await videoAgent.runVideoGenerationAgent({
        db,
        mode: body.mode === 'localize' ? 'localize' : 'veo',
        videoId: body.videoId || body.video_id || `studio-${paid.uid}`,
        prompt: body.prompt || body.text,
        targetLanguage: body.targetLanguage || body.target_language,
        sourceUrl: body.sourceUrl || body.source_url,
        veoOpts: {
          imageBase64: body.imageBase64 || body.image,
          mimeType: body.mimeType || body.imageMimeType,
          imageGcsUri: body.imageGcsUri,
          durationSeconds: body.durationSeconds,
          aspectRatio: body.aspectRatio,
          resolution: body.resolution,
        },
        maxWaitMs: body.maxWaitMs,
      });
      res.status(200).json(result);
    } catch (err) {
      const code =
        err.statusCode ||
        (err.code === 'BAD_REQUEST'
          ? 400
          : err.code === 'PLAN_REQUIRED'
            ? 403
            : err.code === 'GENERATION_FAILED'
              ? 503
              : 500);
      res.status(code).json({
        error: err.message || 'Agent workflow failed',
        code: err.code || null,
        fallback: err.fallback || null,
        attempts: err.attempts || null,
      });
    }
  }
);

/**
 * Start FR/ES dubbing via Cloud Run video-localizer (Whisper + EdgeTTS).
 * POST /api/video/localize  { videoId, targetLanguage, sourceUrl? }
 */
exports.localizeVideo = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 60,
    memory: '256MiB',
    invoker: 'public',
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      await requirePaidPlanUser(req);
      const body = parseBody(req);
      const videoId = String(body.videoId || body.video_id || '').trim();
      const targetLanguage = String(body.targetLanguage || body.target_language || '')
        .trim()
        .toLowerCase()
        .slice(0, 2);
      if (!videoId || !['fr', 'es'].includes(targetLanguage)) {
        res.status(400).json({ error: 'videoId and targetLanguage (fr|es) required' });
        return;
      }
      let sourceUrl = String(body.sourceUrl || body.source_url || '').trim();
      if (!sourceUrl) {
        const snap = await db.collection('videos').doc(videoId).get();
        const data = snap.exists ? snap.data() || {} : {};
        sourceUrl = String(data.url_mp4_en || data.sources?.en || '').trim();
      }
      if (!sourceUrl.startsWith('https://')) {
        res.status(400).json({
          error:
            'sourceUrl required (https) — set url_mp4_en on Firestore videos/{id} or pass sourceUrl',
        });
        return;
      }
      let out;
      if (body.agent === true || body.workflow === 'agent') {
        out = await videoAgent.runVideoGenerationAgent({
          db,
          mode: 'localize',
          videoId,
          targetLanguage,
          sourceUrl,
        });
      } else {
        out = await videoLocalizer.startLocalize({
          videoId,
          targetLanguage,
          sourceUrl,
        });
      }
      await db
        .collection('videos')
        .doc(videoId)
        .set(
          {
            [`localize_status_${targetLanguage}`]: 'processing',
            [`localize_job_${targetLanguage}`]: out.jobId || null,
          },
          { merge: true }
        );
      res.status(202).json(out);
    } catch (err) {
      const code =
        err.statusCode || (err.code === 'CONFIG' ? 503 : err.code === 'PLAN_REQUIRED' ? 403 : 500);
      res.status(code).json({ error: err.message || 'Localize failed', code: err.code || null });
    }
  }
);

/** Poll localize job. GET /api/video/localize-status?jobId= */
exports.localizeVideoStatus = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 30,
    memory: '256MiB',
    invoker: 'public',
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      await requirePaidPlanUser(req);
      const body = req.method === 'POST' ? parseBody(req) : {};
      const jobId = String(body.jobId || req.query.jobId || '').trim();
      if (!jobId) {
        res.status(400).json({ error: 'jobId required' });
        return;
      }
      const out = await videoLocalizer.getJob(jobId);
      res.status(200).json(out);
    } catch (err) {
      const code = err.statusCode || (err.code === 'CONFIG' ? 503 : 500);
      res.status(code).json({ error: err.message || 'Status failed', code: err.code || null });
    }
  }
);

function readStripeSecret() {
  try {
    return (
      stripeApiKeySecret.value() ||
      process.env.STRIPE_SECRET_KEY ||
      process.env.STRIPE_API_KEY ||
      ''
    );
  } catch (_) {
    return process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || '';
  }
}

/**
 * Authenticated client: request a refund (Bearer Firebase ID token).
 * POST /api/request-refund  { reason? }
 */
exports.requestRefund = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 60,
    memory: '256MiB',
    invoker: 'public',
    secrets: [stripeApiKeySecret],
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    hydrateResendEnv();
    try {
      const decoded = await requireFirebaseUser(req);
      const body = parseBody(req);
      const secret = readStripeSecret();
      let stripe = null;
      if (secret) {
        const Stripe = require('stripe');
        stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
      }
      const out = await refunds.createUserRefundRequest(db, stripe, {
        uid: decoded.uid,
        email: decoded.email || body.email || '',
        reason: body.reason || 'requested_by_customer',
        paymentIntentId: body.payment_intent || body.paymentIntentId || '',
      });
      res.status(out.alreadyExists ? 200 : 201).json({
        id: out.id,
        status: out.status,
        alreadyExists: Boolean(out.alreadyExists),
        request_type: out.request_type || 'user',
      });
    } catch (err) {
      const code = err.statusCode || 500;
      console.error(
        JSON.stringify({
          scope: 'requestRefund',
          error: String(err && err.message ? err.message : err).slice(0, 160),
        })
      );
      res.status(code).json({ error: err.message || 'Refund request failed' });
    }
  }
);

/** Authenticated client: list own refund requests + payment history. */
exports.listMyRefunds = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 30,
    memory: '256MiB',
    invoker: 'public',
    secrets: [stripeApiKeySecret],
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      const decoded = await requireFirebaseUser(req);
      let stripe = null;
      const secret = readStripeSecret();
      if (secret) {
        const Stripe = require('stripe');
        stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
      }
      const items = await refunds.listMyRefundRequests(db, decoded.uid, stripe);
      res.status(200).json({ items });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'List failed' });
    }
  }
);

/**
 * Authenticated client: Stripe payment / charge history.
 * GET /api/my-payments
 */
exports.listMyPayments = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 45,
    memory: '256MiB',
    invoker: 'public',
    secrets: [stripeApiKeySecret],
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      const decoded = await requireFirebaseUser(req);
      const secret = readStripeSecret();
      if (!secret) {
        res.status(503).json({ error: 'Payments unavailable' });
        return;
      }
      const Stripe = require('stripe');
      const stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
      const out = await refunds.listMyPayments(db, stripe, {
        uid: decoded.uid,
        email: decoded.email || '',
      });
      res.status(200).json({
        items: out.items || [],
        linkedCustomer: Boolean(out.stripeCustomerId),
      });
    } catch (err) {
      const code = err.statusCode || 500;
      console.error(
        JSON.stringify({
          scope: 'listMyPayments',
          error: String(err && err.message ? err.message : err).slice(0, 160),
        })
      );
      res.status(code).json({ error: err.message || 'List payments failed' });
    }
  }
);

/**
 * Authenticated client dashboard (uid-scoped only).
 * GET /api/client/dashboard
 */
exports.getClientDashboard = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 60,
    memory: '256MiB',
    invoker: 'public',
    secrets: [stripeApiKeySecret],
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      const decoded = await requireFirebaseUser(req);
      let stripe = null;
      const secret = readStripeSecret();
      if (secret) {
        const Stripe = require('stripe');
        stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
      }
      const payload = await clientDashboard.buildClientDashboard(
        db,
        stripe,
        { uid: decoded.uid, email: decoded.email || '' },
        refunds
      );
      res.status(200).json(payload);
    } catch (err) {
      const code = err.statusCode || 500;
      console.error(
        JSON.stringify({
          scope: 'getClientDashboard',
          error: String(err && err.message ? err.message : err).slice(0, 160),
        })
      );
      res.status(code).json({ error: err.message || 'Dashboard failed' });
    }
  }
);

/**
 * Paid-member Client Chat.
 * POST /api/chat/send  { message, locale? }
 * Requires Firebase Bearer + users/{uid}.subscriptionStatus active.
 */
exports.sendChatMessage = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 30,
    memory: '256MiB',
    invoker: 'public',
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      const paid = await requirePaidPlanUser(req);
      const body = parseBody(req);
      const message = String(body.message || body.text || '').trim();
      if (!message) {
        res.status(400).json({ error: 'message required' });
        return;
      }
      if (message.length > 2000) {
        res.status(400).json({ error: 'message too long' });
        return;
      }
      const locale = String(body.locale || 'en')
        .toLowerCase()
        .slice(0, 2);
      const reply = await supportPolicy.generateSupportReply(message, locale);
      const ref = await db.collection('chats').add({
        uid: paid.uid,
        email: paid.email || null,
        message,
        reply,
        locale,
        status: 'answered',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        source: 'client_chat_widget',
        policyDriven: true,
      });
      console.log(
        JSON.stringify({
          scope: 'sendChatMessage',
          id: ref.id,
          uid: paid.uid,
          chars: message.length,
          replyChars: String(reply || '').length,
        })
      );
      res.status(201).json({
        id: ref.id,
        status: 'answered',
        reply,
      });
    } catch (err) {
      const code = err.statusCode || 500;
      if (code === 403) {
        res.status(403).json({
          error: 'Active paid plan required',
          code: 'PLAN_REQUIRED',
        });
        return;
      }
      console.error(
        JSON.stringify({
          scope: 'sendChatMessage',
          error: String(err && err.message ? err.message : err).slice(0, 160),
        })
      );
      res.status(code).json({ error: err.message || 'Chat send failed' });
    }
  }
);

/**
 * Cancel plan / request refund for one-time purchases (lifetime plans).
 * POST /api/cancel-subscription  { cancelReason?, payment_intent? }
 * Queues refund_requests + marks plan cancel_pending. Stripe refunds.create runs on admin approve.
 */
exports.cancelSubscription = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 60,
    memory: '256MiB',
    invoker: 'public',
    secrets: [stripeApiKeySecret],
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    hydrateResendEnv();
    try {
      const decoded = await requireFirebaseUser(req);
      const body = parseBody(req);
      const cancelReason = String(body.cancelReason || body.reason || '')
        .trim()
        .slice(0, 500);
      if (!cancelReason) {
        res.status(400).json({ error: 'cancelReason required' });
        return;
      }

      const secret = readStripeSecret();
      let stripe = null;
      if (secret) {
        const Stripe = require('stripe');
        stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
      }

      const userRef = db.collection('users').doc(decoded.uid);
      const userSnap = await userRef.get();
      const userData = userSnap.exists ? userSnap.data() || {} : {};
      if (!refunds.isSubscriptionActive(userData)) {
        res.status(403).json({ error: 'No active plan to cancel' });
        return;
      }

      // One-time plans: create refund request (admin approves → Stripe refunds.create).
      // If a rare Stripe Subscription id exists, cancel_at_period_end.
      let subscriptionCancel = null;
      const subId = String(userData.stripeSubscriptionId || '').trim();
      if (stripe && subId.startsWith('sub_')) {
        try {
          subscriptionCancel = await stripe.subscriptions.update(subId, {
            cancel_at_period_end: true,
            cancellation_details: { comment: cancelReason.slice(0, 250) },
          });
        } catch (subErr) {
          console.warn('[cancelSubscription] subscription update failed', subErr && subErr.message);
        }
      }

      const out = await refunds.createUserRefundRequest(db, stripe, {
        uid: decoded.uid,
        email: decoded.email || userData.email || '',
        reason: cancelReason,
        paymentIntentId: body.payment_intent || body.paymentIntentId || '',
      });

      await userRef.set(
        {
          planStatus: 'cancel_pending',
          cancelReason,
          cancelRequestedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          source: 'cancel_subscription',
        },
        { merge: true }
      );

      try {
        await notifications.sendNotificationEmail({
          to: decoded.email || userData.email,
          templateKey: 'plan.cancelled',
          locale: userData.locale || 'en',
          extraText: `Reason: ${cancelReason}`,
        });
      } catch (_) {
        /* non-fatal */
      }

      res.status(out.alreadyExists ? 200 : 201).json({
        id: out.id,
        status: out.status,
        alreadyExists: Boolean(out.alreadyExists),
        planStatus: 'cancel_pending',
        subscriptionCancelAtPeriodEnd: Boolean(
          subscriptionCancel && subscriptionCancel.cancel_at_period_end
        ),
      });
    } catch (err) {
      const code = err.statusCode || 500;
      console.error(
        JSON.stringify({
          scope: 'cancelSubscription',
          error: String(err && err.message ? err.message : err).slice(0, 160),
        })
      );
      res.status(code).json({ error: err.message || 'Cancel failed' });
    }
  }
);

/** Admin: list refund_requests (password via X-Admin-Password). */
exports.listRefundRequests = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 30,
    memory: '256MiB',
    invoker: 'public',
    secrets: [stripeApiKeySecret],
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      refunds.assertAdminPassword(req, readAdminRefundPassword());
      const status = String(req.query.status || 'pending_approval').trim();
      const items = await refunds.listRefundRequests(db, status === 'all' ? null : status);
      res.status(200).json({ items });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'List failed' });
    }
  }
);

/** Admin: approve or reject a pending refund. */
exports.decideRefundRequest = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 60,
    memory: '256MiB',
    invoker: 'public',
    secrets: [stripeApiKeySecret],
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      hydrateResendEnv();
      refunds.assertAdminPassword(req, readAdminRefundPassword());
      const body = parseBody(req);
      const requestId = String(body.requestId || body.id || '').trim();
      const decision = String(body.decision || '').toLowerCase();
      if (!requestId || !['approve', 'reject'].includes(decision)) {
        res.status(400).json({ error: 'requestId and decision (approve|reject) required' });
        return;
      }
      if (decision === 'reject') {
        const out = await refunds.rejectRefundRequest(db, requestId, body.reason || '');
        res.status(200).json(out);
        return;
      }
      const secret = readStripeSecret();
      if (!secret) {
        res.status(500).json({ error: 'Stripe API key secret missing' });
        return;
      }
      const Stripe = require('stripe');
      const stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
      const out = await refunds.approveRefundRequest(db, stripe, requestId, {
        source: 'manual_approval',
      });
      res.status(200).json({
        id: out.id,
        status: out.status,
        stripe_refund_id: out.stripe_refund_id || null,
        alreadyRefunded: Boolean(out.alreadyRefunded),
      });
    } catch (err) {
      if (isInvalidApiKeyError(err)) {
        logStripeKeyContext('decideRefundRequest', readStripeSecret(), {
          reason: 'invalid_api_key',
        });
        res.status(502).json({ error: 'Invalid Stripe API key' });
        return;
      }
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Decide failed' });
    }
  }
);

/**
 * Daily: auto-refund pending_approval older than 10 business days.
 * Cloud Scheduler: every day 09:00 America/Toronto
 */
exports.autoApproveStaleRefunds = onSchedule(
  {
    schedule: 'every day 09:00',
    timeZone: 'America/Toronto',
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '256MiB',
    secrets: [stripeApiKeySecret],
  },
  async () => {
    hydrateResendEnv();
    const secret = readStripeSecret();
    if (!secret) {
      console.error('[autoApproveStaleRefunds] Stripe API key missing');
      return;
    }
    const Stripe = require('stripe');
    const stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
    const summary = await refunds.autoRefundStalePending(db, stripe);
    console.log('[autoApproveStaleRefunds]', JSON.stringify(summary));
  }
);

/**
 * Resend inbound webhook for info@resumora.net
 * POST /api/support-webhook  (also /support-webhook via Hosting rewrite)
 */
exports.supportWebhook = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 60,
    memory: '512MiB',
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    hydrateResendEnv();
    if (!supportAgent.verifyResendWebhookSecret(req)) {
      res.status(401).json({ error: 'Unauthorized webhook' });
      return;
    }
    try {
      const body = parseBody(req);
      // Resend may wrap events as { type, data }
      const result = await supportAgent.handleInboundSupportEmail(db, body);
      res.status(result.statusCode || 200).json(result);
    } catch (err) {
      console.error('[supportWebhook] failed', err && err.message);
      // Acknowledge to avoid endless Resend retries on unexpected errors after ticket work
      res.status(200).json({
        ok: false,
        error: err && err.message ? err.message : 'support_webhook_failed',
      });
    }
  }
);

/** Admin: list support tickets (X-Admin-Password). */
exports.listSupportTickets = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 30,
    memory: '256MiB',
    invoker: 'public',
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      refunds.assertAdminPassword(req, readAdminRefundPassword());
      const status = String(req.query.status || 'draft_pending_approval').trim();
      const items = await supportAgent.listSupportTickets(db, status === 'all' ? null : status);
      res.status(200).json({ items });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'List failed' });
    }
  }
);

/**
 * Admin: approve / edit / reject AI draft, then send threaded reply via Resend.
 * Body: { ticketId, decision: approve|edit|reject, editedBody? }
 */
exports.decideSupportTicket = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 60,
    memory: '256MiB',
    invoker: 'public',
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    hydrateResendEnv();
    try {
      refunds.assertAdminPassword(req, readAdminRefundPassword());
      const body = parseBody(req);
      const ticketId = String(body.ticketId || body.id || '').trim();
      const decision = String(body.decision || '').toLowerCase();
      if (!ticketId) {
        res.status(400).json({ error: 'ticketId required' });
        return;
      }
      const out = await supportAgent.decideSupportTicket(
        db,
        ticketId,
        decision,
        body.editedBody || body.body || ''
      );
      res.status(200).json(out);
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Decide failed' });
    }
  }
);

/**
 * MAPE-K self-heal cycle — Cloud Scheduler every 5 minutes.
 * Safe remediations auto-apply; critical actions open HITL approvals.
 */
exports.selfHealMonitor = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'America/Toronto',
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '512MiB',
    secrets: [stripeApiKeySecret],
  },
  async () => {
    hydrateResendEnv();
    const secret = readStripeSecret();
    let stripe = null;
    if (secret) {
      const Stripe = require('stripe');
      stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
    } else {
      selfHeal.structuredLog('error', 'scheduler', { error: 'stripe_key_missing' });
    }
    const summary = await selfHeal.runSelfHealCycle(db, stripe, { trigger: 'scheduler' });
    selfHeal.structuredLog('info', 'scheduler.done', {
      cycleId: summary.cycleId,
      score: summary.score,
      status: summary.status,
      alertSent: Boolean(summary.alert && summary.alert.sent),
    });
  }
);

/**
 * Daily Stripe KYC / payouts_enabled check.
 * Alerts admin when payouts paused or identity requirements pending.
 */
exports.stripeKycMonitor = onSchedule(
  {
    schedule: 'every day 08:00',
    timeZone: 'America/Toronto',
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '256MiB',
    secrets: [stripeApiKeySecret],
  },
  async () => {
    hydrateResendEnv();
    const secret = readStripeSecret();
    if (!secret) {
      console.error(JSON.stringify({ scope: 'stripeKycMonitor', error: 'stripe_key_missing' }));
      return;
    }
    const Stripe = require('stripe');
    const stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
    const result = await stripeKyc.checkStripeAccountHealth(db, stripe);
    console.log(
      JSON.stringify({
        scope: 'stripeKycMonitor',
        ok: result.ok,
        needsAttention: Boolean(result.status && result.status.needsAttention),
        alerted: Boolean(result.alerted),
      })
    );
  }
);

/** Admin: system health snapshot (X-Admin-Password). */
exports.getSystemHealth = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 30,
    memory: '256MiB',
    invoker: 'public',
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      refunds.assertAdminPassword(req, readAdminRefundPassword());
      const snapshot = await selfHeal.getHealthSnapshot(db);
      res.status(200).json(snapshot);
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Health load failed' });
    }
  }
);

/** Admin: run MAPE-K cycle now (X-Admin-Password). */
exports.runSystemHealth = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 120,
    memory: '512MiB',
    invoker: 'public',
    secrets: [stripeApiKeySecret],
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    hydrateResendEnv();
    try {
      refunds.assertAdminPassword(req, readAdminRefundPassword());
      const secret = readStripeSecret();
      let stripe = null;
      if (secret) {
        const Stripe = require('stripe');
        stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
      }
      const summary = await selfHeal.runSelfHealCycle(db, stripe, { trigger: 'manual' });
      res.status(200).json(summary);
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Self-heal cycle failed' });
    }
  }
);

/**
 * Admin: approve/reject critical remediation proposals.
 * Body: { approvalId, decision: approve|reject, note? }
 */
exports.decideSystemHeal = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 30,
    memory: '256MiB',
    invoker: 'public',
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    hydrateResendEnv();
    try {
      refunds.assertAdminPassword(req, readAdminRefundPassword());
      const body = parseBody(req);
      const approvalId = String(body.approvalId || body.id || '').trim();
      const decision = String(body.decision || '').toLowerCase();
      if (!approvalId || !['approve', 'reject'].includes(decision)) {
        res.status(400).json({ error: 'approvalId and decision (approve|reject) required' });
        return;
      }
      const out = await selfHeal.decideApproval(db, {
        approvalId,
        decision,
        note: body.note || '',
      });
      res.status(200).json(out);
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Decide failed' });
    }
  }
);

/** Lightweight client error ingest (no secrets). */
exports.reportClientError = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 15,
    memory: '256MiB',
    invoker: 'public',
  },
  async (req, res) => {
    cors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      const body = parseBody(req);
      const message = String(body.message || body.error || '').slice(0, 400);
      const pathName = String(body.path || body.url || '').slice(0, 200);
      const level = String(body.level || 'error').slice(0, 20);
      if (!message) {
        res.status(400).json({ error: 'message required' });
        return;
      }
      selfHeal.structuredLog(level === 'warn' ? 'warn' : 'error', 'client', {
        message,
        path: pathName,
        ua: String(req.get('user-agent') || '').slice(0, 120),
      });
      await db.collection('system_client_errors').add({
        message,
        path: pathName,
        level,
        createdAt: FieldValue.serverTimestamp(),
      });
      res.status(204).send('');
    } catch (err) {
      res.status(500).json({ error: 'report_failed' });
    }
  }
);

/**
 * GCS finalize → Bilibili publish (bucket: resumora-videos).
 * Only objects under BILIBILI_UPLOAD_PREFIX (default: bilibili-outbox/) are published.
 * Cookies: BILIBILI_SESSDATA, BILIBILI_BILI_JCT, BILIBILI_DEDE_USER_ID (Secret Manager).
 */
exports.publishVideoToBilibili = onObjectFinalized(
  {
    bucket: 'resumora-videos',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '2GiB',
    cpu: 1,
    secrets: [biliSessDataSecret, biliJctSecret, biliDedeUserIdSecret],
  },
  async (event) => {
    const data = event.data || {};
    const filePath = String(data.name || '');
    const contentType = String(data.contentType || '');
    console.log(
      JSON.stringify({
        scope: 'publishVideoToBilibili',
        step: 'trigger',
        filePath,
        contentType: contentType || null,
        size: data.size || null,
        bucket: data.bucket || 'resumora-videos',
      })
    );
    try {
      // defineSecret values are available as process.env.<SECRET_NAME>
      const result = await bilibiliPublish.publishGcsObjectToBilibili(db, {
        bucket: data.bucket || 'resumora-videos',
        name: filePath,
        contentType,
        generation: data.generation,
        size: data.size,
        metadata: (data.metadata && data.metadata) || {},
      });
      console.log(
        JSON.stringify({
          scope: 'publishVideoToBilibili',
          step: 'done',
          skipped: Boolean(result && result.skipped),
          reason: (result && result.reason) || null,
          bvid: (result && result.bvid) || null,
        })
      );
      return result;
    } catch (err) {
      console.error(
        JSON.stringify({
          scope: 'publishVideoToBilibili',
          step: 'error',
          filePath,
          error: String(err && err.message ? err.message : err).slice(0, 240),
        })
      );
      throw err;
    }
  }
);

/**
 * Unified multi-platform distribute (GCS finalize on resumora-videos).
 * Prefix: distribute-outbox/ (MEDIA_DISTRIBUTE_PREFIX).
 * Bilibili publishes when cookies are configured; other networks queue jobs until API secrets exist.
 */
exports.distributeMasterVideo = onObjectFinalized(
  {
    bucket: 'resumora-videos',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '2GiB',
    cpu: 1,
    secrets: [biliSessDataSecret, biliJctSecret, biliDedeUserIdSecret],
  },
  async (event) => {
    const data = event.data || {};
    const filePath = String(data.name || '');
    console.log(
      JSON.stringify({
        scope: 'distributeMasterVideo',
        step: 'trigger',
        filePath,
        contentType: data.contentType || null,
      })
    );
    try {
      const result = await mediaDistribute.distributeGcsObject(db, {
        bucket: data.bucket || 'resumora-videos',
        name: filePath,
        contentType: data.contentType,
        generation: data.generation,
        size: data.size,
        metadata: data.metadata || {},
      });
      console.log(
        JSON.stringify({
          scope: 'distributeMasterVideo',
          step: 'done',
          skipped: Boolean(result && result.skipped),
          videoId: (result && result.videoId) || null,
          results: (result && result.results && result.results.length) || 0,
        })
      );
      return result;
    } catch (err) {
      console.error(
        JSON.stringify({
          scope: 'distributeMasterVideo',
          step: 'error',
          filePath,
          error: String(err && err.message ? err.message : err).slice(0, 240),
        })
      );
      throw err;
    }
  }
);

/**
 * Firestore publishing_queue/{jobId} → multi-platform publish.
 * Create docs with status: "pending" to start. Secrets via Secret Manager.
 */
exports.publishToSocial = onDocumentCreated(
  {
    document: 'publishing_queue/{jobId}',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '2GiB',
    secrets: [biliSessDataSecret, biliJctSecret, biliDedeUserIdSecret],
  },
  async (event) => {
    const jobId = event.params.jobId;
    const snap = event.data;
    if (!snap) {
      console.log(JSON.stringify({ scope: 'publishToSocial', step: 'no_snapshot', jobId }));
      return null;
    }
    const job = snap.data() || {};
    console.log(
      JSON.stringify({
        scope: 'publishToSocial',
        step: 'trigger',
        jobId,
        videoId: job.videoId || null,
        status: job.status || null,
      })
    );
    try {
      const result = await publishToSocial.processPublishingJob(db, jobId, job);
      console.log(
        JSON.stringify({
          scope: 'publishToSocial',
          step: 'done',
          jobId,
          status: (result && result.status) || null,
          skipped: Boolean(result && result.skipped),
        })
      );
      return result;
    } catch (err) {
      console.error(
        JSON.stringify({
          scope: 'publishToSocial',
          step: 'error',
          jobId,
          error: String(err && err.message ? err.message : err).slice(0, 240),
        })
      );
      try {
        await db
          .collection('publishing_queue')
          .doc(jobId)
          .set(
            {
              status: 'failed',
              error: String(err && err.message ? err.message : err).slice(0, 300),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
      } catch (_) {
        /* ignore */
      }
      throw err;
    }
  }
);
