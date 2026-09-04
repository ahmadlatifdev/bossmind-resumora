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
const hermes = require('./lib/hermesClient');
const { getMasterDashboardData } = require('./getMasterDashboardData');
const { listMasterProjects, getProjectContext } = require('./lib/projectRegistry');
const { routeTool, runSkill } = require('./lib/toolRouter');
const { callGeminiChat } = require('./lib/geminiChat');
const {
  assertAdminAccess,
  requestAdminPasswordReset,
  confirmAdminPasswordReset,
} = require('./lib/adminGateAuth');

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
      await assertAdminAccess(req, db, readAdminPassword());
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
      await assertAdminAccess(req, db, readAdminPassword());
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
        await assertAdminAccess(req, db, readAdminPassword());
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
      await assertAdminAccess(req, db, readAdminPassword());
      const snapshot = await selfHeal.getHealthSnapshot(db);
      const dashboard = await getMasterDashboardData(db, snapshot);
      res.status(200).json({ ok: true, dashboard });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Master dashboard failed' });
    }
  });

  exportsObj.getMasterProjects = onRequest(adminHttpOpts, async (req, res) => {
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
      await assertAdminAccess(req, db, readAdminPassword());
      const snapshot = await selfHeal.getHealthSnapshot(db);
      const registry = await listMasterProjects(db, snapshot);
      res.status(200).json({ ok: true, ...registry });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Master projects failed' });
    }
  });

  exportsObj.postAdminHermesCommand = onRequest(
    { ...adminHttpOpts, timeoutSeconds: 90 },
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
        await assertAdminAccess(req, db, readAdminPassword());
        const body = parseBody(req);
        const message = String(body.message || body.text || '')
          .trim()
          .slice(0, 4000);
        if (!message) {
          res.status(400).json({ error: 'message required' });
          return;
        }
        const project = getProjectContext(body.projectId || body.project);
        const lang = String(body.lang || 'en');
        const route = routeTool({
          message,
          projectId: project.projectId,
          taskType: body.taskType,
        });

        if (route.startsWith('skill:')) {
          const skillOut = runSkill(route, { message, lang, projectId: project.projectId });
          res.status(200).json({
            ok: true,
            engine: route,
            projectId: project.projectId,
            reply: skillOut.reply,
          });
          return;
        }

        const context = JSON.stringify({
          project,
          note: 'Admin harness command. Non-sensitive envRegistry only.',
        }).slice(0, 3500);

        if (route === 'gemini') {
          const gem = await callGeminiChat({ prompt: message, lang, context, timeoutMs: 25000 });
          res.status(200).json({
            ok: true,
            engine: 'gemini',
            projectId: project.projectId,
            reply: gem.text,
          });
          return;
        }

        try {
          const out = await hermes.callHermes({
            prompt: message,
            context,
            lang,
            projectId: project.projectId,
            timeoutMs: 70000,
            db,
          });
          res.status(200).json({
            ok: true,
            engine: 'hermes',
            projectId: project.projectId,
            reply: out.text,
          });
        } catch (err) {
          try {
            const gem = await callGeminiChat({
              prompt: message,
              lang,
              context,
              timeoutMs: 25000,
            });
            res.status(200).json({
              ok: true,
              engine: 'gemini',
              projectId: project.projectId,
              reply: gem.text,
              fallbackFrom: err.code || 'hermes_error',
            });
          } catch {
            res.status(503).json({
              error: err.message || 'Harness command failed',
              projectId: project.projectId,
            });
          }
        }
      } catch (err) {
        const code = err.statusCode || 500;
        res.status(code).json({ error: err.message || 'Harness command failed' });
      }
    }
  );

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
      await assertAdminAccess(req, db, readAdminPassword());
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

  exportsObj.getHermesStatus = onRequest(adminHttpOpts, async (req, res) => {
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
      await assertAdminAccess(req, db, readAdminPassword());
      const status = await hermes.getHermesAdminStatus(db);
      res.status(200).json({ ok: true, status });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Hermes status failed' });
    }
  });

  exportsObj.setHermesChat = onRequest(adminHttpOpts, async (req, res) => {
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
      await assertAdminAccess(req, db, readAdminPassword());
      const body = parseBody(req);
      const enabled = body.enabled === true || body.enabled === 'true' || body.enabled === 1;
      await hermes.setChatEnabled(db, enabled);
      const status = await hermes.getHermesAdminStatus(db);
      res.status(200).json({ ok: true, status });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Hermes toggle failed' });
    }
  });

  exportsObj.getHermesInsights = onRequest(
    { ...adminHttpOpts, timeoutSeconds: 90 },
    async (req, res) => {
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
        await assertAdminAccess(req, db, readAdminPassword());
        const snapshot = await selfHeal.getHealthSnapshot(db);
        const hermesStatus = await hermes.getHermesAdminStatus(db);
        const prompt =
          'Summarize Resumora/BossMind operational health for the owner. Cover status, notable risks, and 3 next actions. Do not invent revenue. Do not request or repeat secrets.';
        const context = JSON.stringify({
          health: {
            status: snapshot.status || snapshot.globalHealth || null,
            score: snapshot.score || snapshot.healthScore || null,
          },
          hermes: {
            active: hermesStatus.active,
            chatEnabled: hermesStatus.chatEnabled,
            latencyMs: hermesStatus.latencyMs,
            errorRate: hermesStatus.errorRate,
          },
        }).slice(0, 3000);
        const out = await hermes.callHermes({
          prompt,
          context,
          lang: String(req.query.lang || 'en'),
          timeoutMs: 70000,
          db,
        });
        res.status(200).json({ ok: true, summary: out.text, status: hermesStatus });
      } catch (err) {
        const code = err.statusCode || (err.code === 'not_configured' ? 503 : 500);
        res.status(code).json({
          error: err.message || 'Hermes insights failed',
          offline: err.code === 'not_configured' || err.code === 'unreachable',
        });
      }
    }
  );

  // Public (rate-limited) admin password reset — emails OTP to configured admin inbox.
  exportsObj.requestAdminPasswordReset = onRequest(
    { ...adminHttpOpts, timeoutSeconds: 60, memory: '256MiB', secrets: [adminRefundPassword] },
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
        const out = await requestAdminPasswordReset(db, req);
        res.status(200).json(out);
      } catch (err) {
        const code = err.statusCode || 500;
        res.status(code).json({ error: err.message || 'Reset request failed' });
      }
    }
  );

  exportsObj.confirmAdminPasswordReset = onRequest(
    { ...adminHttpOpts, timeoutSeconds: 60, memory: '256MiB', secrets: [adminRefundPassword] },
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
        const out = await confirmAdminPasswordReset(db, parseBody(req));
        res.status(200).json(out);
      } catch (err) {
        const code = err.statusCode || 500;
        res.status(code).json({ error: err.message || 'Reset confirm failed' });
      }
    }
  );

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
