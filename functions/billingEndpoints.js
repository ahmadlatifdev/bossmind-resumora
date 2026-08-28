/**
 * Billing endpoints: refund preview, cancel+refund, service events, refund history.
 */
const path = require('path');
const { onRequest } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');
const { recordServiceEvent, listRefunds, ensurePlansSeeded } = require('./lib/serviceDelivery');
const { buildRefundPreview, cancelSubscriptionWithRefund } = require('./lib/refundEngine');
const { buildRefundPreviewV2 } = require('./lib/refundEngineV2');
const { computeRevenueAnalytics, predictChurnRisk } = require('./lib/analyticsEngine');

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

function cors(res, req) {
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

let stripeClient = null;
function getStripe() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;
  if (!stripeClient) {
    const Stripe = require('stripe');
    stripeClient = new Stripe(secret, { apiVersion: '2024-11-20.acacia' });
  }
  return stripeClient;
}

async function verifyFirebaseUser(req) {
  const header = String(req.get('authorization') || req.get('Authorization') || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    return await getAuth().verifyIdToken(match[1]);
  } catch {
    return null;
  }
}

async function resolveCustomerContext(req, body = {}) {
  const decoded = await verifyFirebaseUser(req);
  const stripe = getStripe();
  let customerId = String(body.customerId || body.customer_id || '').trim();
  let subscriptionId = String(body.subscriptionId || body.subscription_id || '').trim();
  let email = String(body.email || decoded?.email || '').trim();
  let planId = String(body.planId || body.plan_id || 'basic').trim();
  const userId = decoded?.uid || body.userId || null;

  if (stripe && email && !customerId) {
    const found = await stripe.customers.list({ email, limit: 1 });
    if (found.data[0]) customerId = found.data[0].id;
  }

  if (stripe && customerId && !subscriptionId) {
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 10,
    });
    const active =
      subs.data.find((s) => s.status === 'active' || s.status === 'trialing') || subs.data[0];
    if (active) {
      subscriptionId = active.id;
      planId = active.metadata?.planId || planId;
    }
  }

  return { decoded, customerId, subscriptionId, email, planId, userId, stripe };
}

function registerBillingEndpoints(exports) {
  ensurePlansSeeded().catch(() => {});

  exports.getRefundPreview = onRequest(
    { region: 'us-central1', cors: false, timeoutSeconds: 30, memory: '256MiB' },
    async (req, res) => {
      cors(res, req);
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
        const body = req.method === 'GET' ? req.query : parseBody(req);
        const ctx = await resolveCustomerContext(req, body);
        if (!ctx.decoded && process.env.ALLOW_UNAUTH_BILLING !== 'true') {
          return res.status(401).json({ error: 'Authentication required' });
        }
        if (!ctx.subscriptionId && !body.totalPaidCents) {
          return res.status(400).json({ error: 'No active subscription found' });
        }

        let totalPaid = Number(body.totalPaidCents || body.total_paid_cents || 0);
        if ((!totalPaid || totalPaid <= 0) && ctx.stripe && ctx.subscriptionId) {
          const invoices = await ctx.stripe.invoices.list({
            subscription: ctx.subscriptionId,
            status: 'paid',
            limit: 20,
          });
          totalPaid = invoices.data.reduce((s, inv) => s + Number(inv.amount_paid || 0), 0);
        }

        const preview = await buildRefundPreview({
          customerId: ctx.customerId,
          subscriptionId: ctx.subscriptionId,
          planId: ctx.planId,
          totalPaidCents: totalPaid,
        });

        return res.status(200).json({
          ok: true,
          customer_id: ctx.customerId,
          subscription_id: ctx.subscriptionId,
          plan_id: ctx.planId,
          ...preview,
        });
      } catch (err) {
        return res.status(500).json({ error: err.message || 'Refund preview failed' });
      }
    }
  );

  exports.cancelSubscription = onRequest(
    { region: 'us-central1', cors: false, timeoutSeconds: 60, memory: '512MiB' },
    async (req, res) => {
      cors(res, req);
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      try {
        const body = parseBody(req);
        const ctx = await resolveCustomerContext(req, body);
        if (!ctx.decoded && process.env.ALLOW_UNAUTH_BILLING !== 'true') {
          return res.status(401).json({ error: 'Authentication required' });
        }
        if (!ctx.stripe) {
          return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });
        }
        if (!ctx.subscriptionId) {
          return res.status(400).json({ error: 'No active subscription found' });
        }

        const result = await cancelSubscriptionWithRefund(ctx.stripe, {
          customerId: ctx.customerId,
          subscriptionId: ctx.subscriptionId,
          planId: ctx.planId,
          userId: ctx.userId,
          email: ctx.email,
          cancelAtPeriodEnd: Boolean(body.cancelAtPeriodEnd),
          totalPaidCents: body.totalPaidCents,
        });

        return res.status(200).json(result);
      } catch (err) {
        const code = err.code === 'BAD_REQUEST' || err.code === 'NO_CHARGE' ? 400 : 500;
        return res.status(code).json({ error: err.message || 'Cancellation failed' });
      }
    }
  );

  exports.recordServiceEventHttp = onRequest(
    { region: 'us-central1', cors: false, timeoutSeconds: 20, memory: '256MiB' },
    async (req, res) => {
      cors(res, req);
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      try {
        const body = parseBody(req);
        const decoded = await verifyFirebaseUser(req);
        const event = await recordServiceEvent({
          customerId: body.customerId || body.customer_id || decoded?.uid,
          subscriptionId: body.subscriptionId || body.subscription_id || '',
          eventType: body.eventType || body.event_type,
          metadata: body.metadata || {},
          userId: decoded?.uid || body.userId || null,
        });
        return res.status(200).json({ ok: true, event });
      } catch (err) {
        const code = err.code === 'BAD_REQUEST' ? 400 : 500;
        return res.status(code).json({ error: err.message || 'Record failed' });
      }
    }
  );

  exports.listRefundsHttp = onRequest(
    { region: 'us-central1', cors: false, timeoutSeconds: 20, memory: '256MiB' },
    async (req, res) => {
      cors(res, req);
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

      try {
        const decoded = await verifyFirebaseUser(req);
        if (!decoded && process.env.ALLOW_UNAUTH_BILLING !== 'true') {
          return res.status(401).json({ error: 'Authentication required' });
        }
        const customerId = String(req.query.customerId || '').trim();
        const refunds = await listRefunds(customerId, decoded?.uid);
        return res.status(200).json({ ok: true, refunds });
      } catch (err) {
        return res.status(500).json({ error: err.message || 'List failed' });
      }
    }
  );

  exports.getRefundPreviewV2 = onRequest(
    { region: 'us-central1', cors: false, timeoutSeconds: 30, memory: '256MiB' },
    async (req, res) => {
      cors(res, req);
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }
      try {
        const body = req.method === 'GET' ? req.query : parseBody(req);
        const ctx = await resolveCustomerContext(req, body);
        if (!ctx.decoded && process.env.ALLOW_UNAUTH_BILLING !== 'true') {
          return res.status(401).json({ error: 'Authentication required' });
        }
        let totalPaid = Number(body.totalPaidCents || body.total_paid_cents || 2900);
        const preview = await buildRefundPreviewV2({
          customerId: ctx.customerId,
          subscriptionId: ctx.subscriptionId,
          planId: ctx.planId,
          totalPaidCents: totalPaid,
        });
        return res.status(200).json({ ok: true, ...preview });
      } catch (err) {
        return res.status(500).json({ error: err.message || 'Preview v2 failed' });
      }
    }
  );

  exports.getRevenueAnalytics = onRequest(
    { region: 'us-central1', cors: false, timeoutSeconds: 30, memory: '256MiB' },
    async (req, res) => {
      cors(res, req);
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      try {
        const days = Number(req.query.days || 30);
        const rollup = await computeRevenueAnalytics({ days });
        return res.status(200).json({ ok: true, analytics: rollup });
      } catch (err) {
        return res.status(500).json({ error: err.message || 'Analytics failed' });
      }
    }
  );

  exports.getChurnPrediction = onRequest(
    { region: 'us-central1', cors: false, timeoutSeconds: 20, memory: '256MiB' },
    async (req, res) => {
      cors(res, req);
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      try {
        const body = req.query;
        const churn = await predictChurnRisk({
          customerId: String(body.customerId || ''),
          subscriptionId: String(body.subscriptionId || ''),
          planId: String(body.planId || 'basic'),
          serviceStatus: String(body.serviceStatus || 'NONE'),
        });
        return res.status(200).json({ ok: true, churn });
      } catch (err) {
        return res.status(500).json({ error: err.message || 'Churn prediction failed' });
      }
    }
  );
}

module.exports = { registerBillingEndpoints };
