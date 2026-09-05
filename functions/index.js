/**
 * Stripe Checkout session creator for resumora.net
 * Maps planId → Stripe Price ID dynamically (never a single hardcoded product).
 * Does not modify Stripe Prices — creates Checkout Sessions only.
 */
const path = require('path');
const { onRequest } = require('firebase-functions/v2/https');
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();
const geminiApiKey = defineSecret('GEMINI_API_KEY');

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

function firstEnv(keys) {
  for (const key of keys) {
    const v = process.env[key];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

function resolvePriceId(planId, bodyPriceId) {
  const canonical = CANONICAL_PRICE_IDS[planId] || '';
  const mapped = firstEnv(PLAN_ENV_KEYS[planId] || []);
  // Prefer body priceId only when it matches canonical for this plan.
  if (bodyPriceId && canonical && String(bodyPriceId) === canonical) return canonical;
  if (canonical) return canonical;
  if (mapped) return mapped;
  if (bodyPriceId && /^price_/.test(String(bodyPriceId))) return String(bodyPriceId);
  return '';
}

function cors(res, req) {
  const origin = String((req && req.get && req.get('origin')) || '');
  const allowed = new Set([
    'https://resumora.net',
    'https://www.resumora.net',
    'https://client-resumora-live.web.app',
  ]);
  const allow = allowed.has(origin) ? origin : 'https://resumora.net';
  res.set('Access-Control-Allow-Origin', allow);
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Vary', 'Origin');
}

const videoCatalog = require('./videoCatalog');
const bilibiliPublish = require('./bilibiliPublish');
const { stripeApiSecrets, getStripeClient } = require('./lib/stripeSecrets');
const { resolveProjectCheckout, normalizeProject } = require('./lib/projectCheckout');

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

exports.createCheckoutSession = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: stripeApiSecrets,
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

    let body = parseBody(req);
    const projectIdEarly = normalizeProject(body.project || body.projectId || 'resumora');
    const planId = String(body.planId || '').trim();

    if (!planId) {
      res.status(400).json({ error: 'planId is required.' });
      return;
    }

    // Resumora keeps the canonical plan allow-list; ElegancyArt plans are env-mapped.
    if (projectIdEarly === 'resumora') {
      if (!CANONICAL_PRICE_IDS[planId] && !PLAN_ENV_KEYS[planId]) {
        res.status(400).json({
          error: `Invalid planId. Expected one of: ${Object.keys(CANONICAL_PRICE_IDS).join(', ')}`,
        });
        return;
      }
    }

    const resolved = resolveProjectCheckout({
      project: projectIdEarly,
      planId,
      bodyPriceId: body.priceId,
      resolveResumoraPriceId: resolvePriceId,
      defaultSuccessUrl: 'https://resumora.net/pricing?checkout=success',
      defaultCancelUrl: 'https://resumora.net/pricing?checkout=canceled',
      bodySuccessUrl: body.successUrl,
      bodyCancelUrl: body.cancelUrl,
    });

    if (!resolved.configured) {
      res.status(resolved.projectId === 'elegancyart' ? 503 : 400).json({
        error: resolved.error || 'Checkout not configured',
        projectId: resolved.projectId,
      });
      return;
    }

    const { secret, priceId, successUrl, cancelUrl, projectId, source } = resolved;
    const expectedCents =
      projectId === 'resumora' ? Number(body.expectedCents || EXPECTED_CENTS[planId] || 0) : 0;

    try {
      const Stripe = require('stripe');
      const stripe = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });

      // Detect price type to choose mode + enforce amount match
      const price = await stripe.prices.retrieve(priceId);
      if (expectedCents && Number(price.unit_amount) !== expectedCents) {
        res.status(400).json({
          error: `Stripe price amount mismatch for "${planId}": expected ${expectedCents}, got ${price.unit_amount}.`,
          planId,
          projectId,
          expectedCents,
          actualCents: price.unit_amount,
        });
        return;
      }
      const mode = price.type === 'recurring' ? 'subscription' : 'payment';

      const {
        fetchDefaultPaymentMethodConfigurationId,
        buildOptimizedCheckoutParams,
        resolveCurrency,
      } = require('./lib/stripeCheckoutOptimizations');

      let paymentMethodConfigurationId = null;
      try {
        paymentMethodConfigurationId = await fetchDefaultPaymentMethodConfigurationId(stripe);
      } catch (_) {
        /* PMC optional */
      }

      const locale = String(body.locale || req.get('accept-language') || '')
        .split(',')[0]
        .trim();
      const country = String(body.country || '').toUpperCase();
      const currency = resolveCurrency({
        locale,
        country,
        fallback: price.currency || 'usd',
      });

      const sessionParams = buildOptimizedCheckoutParams(
        {
          mode,
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: {
            planId,
            projectId,
            source,
            expected_cents: String(expectedCents || price.unit_amount || ''),
            advisory_only_ui: 'true',
          },
        },
        { paymentMethodConfigurationId, currency }
      );

      const session = await stripe.checkout.sessions.create(sessionParams, {
        idempotencyKey: `checkout_${projectId}_${planId}_${Date.now().toString(36)}`,
      });

      res.status(200).json({
        sessionId: session.id,
        url: session.url,
        planId,
        projectId,
        mode,
        amount: price.unit_amount,
        // Omit priceId from response for ElegancyArt; Resumora clients historically expect it.
        ...(projectId === 'resumora' ? { priceId } : {}),
      });
    } catch (err) {
      res.status(500).json({
        error: err && err.message ? err.message : 'Stripe Checkout session creation failed',
        projectId,
      });
    }
  }
);

// Keep a tiny health marker for local verification
exports._plansMapped = () => Object.keys(PLAN_ENV_KEYS);

exports.videoCatalog = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 30,
    memory: '256MiB',
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
      const catalog = await videoCatalog.getCatalog();
      res.status(200).json(catalog);
    } catch (err) {
      res.status(500).json({ error: err.message || 'Catalog failed' });
    }
  }
);

exports.videoDownload = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 30,
    memory: '256MiB',
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
      const result = await videoCatalog.recordDownload(parseBody(req));
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
 * GCS finalize → Bilibili publish (bucket: resumora-videos).
 * Only objects under BILIBILI_UPLOAD_PREFIX (default: bilibili-outbox/) are published.
 * Cookies: BILIBILI_SESSDATA, BILIBILI_BILI_JCT, BILIBILI_DEDE_USER_ID (Secret Manager).
 */
exports.publishVideoToBilibili = onObjectFinalized(
  {
    bucket: 'resumora-videos',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (event) => {
    const data = event.data;
    const filePath = String(data.name || '');
    try {
      console.log(
        JSON.stringify({
          scope: 'publishVideoToBilibili',
          step: 'trigger',
          filePath,
          contentType: data.contentType || null,
        })
      );
      const result = await bilibiliPublish.publishGcsObjectToBilibili(db, {
        bucket: data.bucket || 'resumora-videos',
        name: filePath,
        contentType: data.contentType || '',
        generation: String(data.generation || ''),
        size: Number(data.size || 0),
        metadata: data.metadata || {},
      });
      console.log(
        JSON.stringify({
          scope: 'publishVideoToBilibili',
          step: 'done',
          skipped: Boolean(result && result.skipped),
          bvid: result && result.bvid ? result.bvid : null,
        })
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          scope: 'publishVideoToBilibili',
          step: 'error',
          filePath,
          error: String(err && err.message ? err.message : err).slice(0, 200),
        })
      );
      throw err;
    }
  }
);

const { registerAdminEndpoints } = require('./adminEndpoints');
registerAdminEndpoints(exports);

const { registerStripeWebhook } = require('./stripeWebhook');
registerStripeWebhook(exports);

const { registerBillingEndpoints } = require('./billingEndpoints');
registerBillingEndpoints(exports);

const { getAuth } = require('firebase-admin/auth');
const { resolveChatReply } = require('./lib/chatAgent');

function chatCors(res, req) {
  const origin = String((req && req.get && req.get('origin')) || '');
  const allowed = new Set([
    'https://resumora.net',
    'https://www.resumora.net',
    'https://client-resumora-live.web.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://localhost:3005',
  ]);
  const allow = allowed.has(origin) ? origin : 'https://resumora.net';
  res.set('Access-Control-Allow-Origin', allow);
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Vary', 'Origin');
}

function parseChatBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  return body || {};
}

async function verifyChatUser(req) {
  const header = String(req.get('authorization') || req.get('Authorization') || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    return await getAuth().verifyIdToken(match[1]);
  } catch {
    return null;
  }
}

exports.sendChatMessage = onRequest(
  {
    region: 'us-central1',
    cors: false,
    timeoutSeconds: 60,
    memory: '256MiB',
    secrets: [geminiApiKey],
  },
  async (req, res) => {
    chatCors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      const decoded = await verifyChatUser(req);
      if (!decoded) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const body = parseChatBody(req);
      const message = String(body.message || body.text || '')
        .trim()
        .slice(0, 2000);
      if (!message) {
        res.status(400).json({ error: 'message required' });
        return;
      }
      const out = await resolveChatReply({
        message,
        lang: body.lang,
        intentHint: body.intent || body.intentHint,
        db,
      });
      res.status(200).json({ ok: true, ...out });
    } catch (err) {
      res.status(500).json({ error: err && err.message ? err.message : 'Chat failed' });
    }
  }
);
