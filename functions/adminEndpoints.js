/**
 * Admin health + system manual HTTP/scheduled endpoints.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore } = require('firebase-admin/firestore');
const selfHeal = require('./selfHeal');
const systemManual = require('./systemManual');
const { stripeApiSecrets } = require('./lib/stripeSecrets');
const { buildMasterDashboard } = require('./lib/masterDashboard');

const geminiApiKey = defineSecret('GEMINI_API_KEY');
const adminRefundPassword = defineSecret('ADMIN_REFUND_PASSWORD');

const db = getFirestore();

function readAdminPassword() {
  return (
    process.env.ADMIN_REFUND_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    process.env.SELF_HEAL_ADMIN_PASSWORD ||
    ''
  );
}

function adminCors(res, req) {
  const origin = String((req && req.get && req.get('origin')) || '');
  const allowed = new Set([
    'https://resumora.net',
    'https://www.resumora.net',
    'https://client-resumora-live.web.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);
  const allow = allowed.has(origin) ? origin : 'https://resumora.net';
  res.set('Access-Control-Allow-Origin', allow);
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
  res.set('Vary', 'Origin');
}

function parseBody(req) {
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

const adminHttpOpts = {
  region: 'us-central1',
  cors: false,
  timeoutSeconds: 120,
  memory: '512MiB',
  // Do not set invoker: 'public' — org policy blocks Cloud Run setIamPolicy(allUsers).
  // CI applies --no-invoker-iam-check (run.googleapis.com/invoker-iam-disabled: 'true').
  secrets: [geminiApiKey, adminRefundPassword, ...stripeApiSecrets],
};

function registerAdminEndpoints(exportsObj) {
  exportsObj.getSystemHealth = onRequest(adminHttpOpts, async (req, res) => {
    adminCors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      selfHeal.assertAdminPassword(req, readAdminPassword());
      const snapshot = await selfHeal.getHealthSnapshot(db);
      const documentation = await systemManual.getDocumentationStatus(db);
      res.status(200).json({ ...snapshot, documentation });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Health load failed' });
    }
  });

  exportsObj.runSystemHealth = onRequest(adminHttpOpts, async (req, res) => {
    adminCors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      selfHeal.assertAdminPassword(req, readAdminPassword());
      const summary = await selfHeal.runSelfHealCycle(db, null, { trigger: 'manual' });
      res.status(200).json(summary);
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Self-heal cycle failed' });
    }
  });

  exportsObj.decideSystemHeal = onRequest(
    { ...adminHttpOpts, timeoutSeconds: 30, memory: '256MiB' },
    async (req, res) => {
      adminCors(res, req);
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      try {
        selfHeal.assertAdminPassword(req, readAdminPassword());
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

  exportsObj.getMasterDashboard = onRequest(adminHttpOpts, async (req, res) => {
    adminCors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      selfHeal.assertAdminPassword(req, readAdminPassword());
      const snapshot = await selfHeal.getHealthSnapshot(db);
      const dashboard = await buildMasterDashboard(db, snapshot);
      res.status(200).json({ ok: true, dashboard });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Master dashboard failed' });
    }
  });

  exportsObj.updateSystemManual = onRequest(adminHttpOpts, async (req, res) => {
    adminCors(res, req);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      selfHeal.assertAdminPassword(req, readAdminPassword());
      const body = parseBody(req);
      const out = await systemManual.updateSystemManual(db, {
        trigger: body.trigger || 'admin',
        changelogGitSha: body.changelogGitSha || body.gitSha || null,
        changelogSynced: body.changelogSynced === true,
      });
      res.status(200).json(out);
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Manual update failed' });
    }
  });

  exportsObj.systemManualCron = onSchedule(
    {
      schedule: '0 6 * * 1',
      timeZone: 'America/Toronto',
      region: 'us-central1',
      timeoutSeconds: 120,
      memory: '512MiB',
      secrets: [geminiApiKey],
    },
    async () => {
      await systemManual.updateSystemManual(db, { trigger: 'weekly_cron' });
    }
  );
}

module.exports = { registerAdminEndpoints };
