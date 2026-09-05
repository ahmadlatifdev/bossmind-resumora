/**
 * Admin health + system manual HTTP/scheduled endpoints.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
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
const harnessTasks = require('./lib/harnessTasks');
const { handleGitHubWebhook } = require('./lib/githubWebhook');
const {
  buildFinancialDashboard,
  buildFinanceOverview,
  overviewToCsv,
  writeFinanceSettings,
  getFxRates,
} = require('./lib/financeLedger');
const { runDailyStockAllocation } = require('./lib/financeAllocation');

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
          .slice(0, 8000);
        const codePatch = String(body.codeDiff || body.codePatch || '')
          .trim()
          .slice(0, 40000);
        if (!message && !codePatch) {
          res.status(400).json({ error: 'message required' });
          return;
        }
        const project = getProjectContext(body.projectId || body.project);
        const lang = String(body.lang || 'en');
        const effectiveMessage =
          message || 'Please review the attached code patch for this project.';

        let patchStored = false;
        if (codePatch) {
          await db.collection('hermes_chat_patches').add({
            projectId: project.projectId,
            codeDiff: codePatch,
            message: effectiveMessage.slice(0, 2000),
            source: 'admin_hermes_chat',
            createdAt: FieldValue.serverTimestamp(),
          });
          await db
            .collection('projects')
            .doc(project.projectId)
            .set(
              {
                lastCodePatchAt: FieldValue.serverTimestamp(),
                lastCodePatchPreview: codePatch.slice(0, 500),
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          patchStored = true;
        }

        const route = routeTool({
          message: effectiveMessage,
          projectId: project.projectId,
          taskType: body.taskType,
        });

        if (route === 'skill:project-health') {
          const { runProjectHealth } = require('./lib/skills/project-health');
          const snapshot = await selfHeal.getHealthSnapshot(db).catch(() => null);
          const skillOut = await runProjectHealth({ db, snapshot, lang });
          res.status(200).json({
            ok: true,
            engine: route,
            projectId: project.projectId,
            reply: skillOut.reply,
            patchStored,
          });
          return;
        }

        if (route.startsWith('skill:')) {
          const skillOut = runSkill(route, {
            message: effectiveMessage,
            lang,
            projectId: project.projectId,
          });
          res.status(200).json({
            ok: true,
            engine: route,
            projectId: project.projectId,
            reply: skillOut.reply,
            patchStored,
          });
          return;
        }

        const context = JSON.stringify({
          project,
          note: 'Admin harness command. Non-sensitive envRegistry only.',
          codePatchAttached: Boolean(codePatch),
          codePatchPreview: codePatch ? codePatch.slice(0, 2500) : undefined,
        }).slice(0, 6000);

        const promptWithPatch = codePatch
          ? `${effectiveMessage}\n\n--- Attached code patch (project ${project.projectId}) ---\n${codePatch.slice(0, 12000)}`
          : effectiveMessage;

        if (route === 'gemini') {
          const gem = await callGeminiChat({
            prompt: promptWithPatch,
            lang,
            context,
            timeoutMs: 25000,
          });
          res.status(200).json({
            ok: true,
            engine: 'gemini',
            projectId: project.projectId,
            reply: gem.text,
            patchStored,
          });
          return;
        }

        try {
          const out = await hermes.callHermes({
            prompt: promptWithPatch,
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
            patchStored,
          });
        } catch (err) {
          try {
            const gem = await callGeminiChat({
              prompt: promptWithPatch,
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
              patchStored,
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

  exportsObj.listHarnessTasks = onRequest(adminHttpOpts, async (req, res) => {
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
      const status = String(req.query.status || '').trim();
      const tasks = await harnessTasks.listTasks(db, { status: status || undefined });
      const settings = await harnessTasks.readAutomationSettings(db);
      res.status(200).json({ ok: true, tasks, settings });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'List tasks failed' });
    }
  });

  exportsObj.createHarnessTask = onRequest(adminHttpOpts, async (req, res) => {
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
      const task = await harnessTasks.createTask(db, {
        description: body.description,
        codeDiff: body.codeDiff,
        commands: body.commands,
        projectId: body.projectId || body.project,
        actor: body.actor === 'hermes' ? 'hermes' : 'admin',
        risk: body.risk,
      });
      res.status(200).json({ ok: true, task });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Create task failed' });
    }
  });

  exportsObj.ackHarnessTask = onRequest(adminHttpOpts, async (req, res) => {
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
      const taskId = body.taskId || body.id;
      const task = await harnessTasks.ackTask(db, taskId, {
        ack: body.ack !== false && body.reject !== true,
        note: body.note || body.ACK || 'ACK',
      });
      res.status(200).json({ ok: true, task });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'ACK failed' });
    }
  });

  exportsObj.markHarnessTaskApplied = onRequest(adminHttpOpts, async (req, res) => {
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
      const task = await harnessTasks.markApplied(db, body.taskId || body.id, {
        log: body.log || 'cursor',
      });
      res.status(200).json({
        ok: true,
        task,
        note: 'Server did not run commands. Use local Cursor/scripts after ACK.',
      });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Mark applied failed' });
    }
  });

  exportsObj.setHarnessAutomation = onRequest(adminHttpOpts, async (req, res) => {
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
      const settings = await harnessTasks.setAutomationSettings(db, body);
      res.status(200).json({ ok: true, settings });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Settings update failed' });
    }
  });

  // GitHub webhook — signature required; no admin password.
  exportsObj.githubDeployWebhook = onRequest(
    {
      region: 'us-central1',
      cors: false,
      timeoutSeconds: 60,
      memory: '256MiB',
    },
    async (req, res) => {
      if (req.method === 'GET') {
        res.status(200).json({ ok: true, service: 'githubDeployWebhook' });
        return;
      }
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      try {
        const out = await handleGitHubWebhook(db, req);
        res.status(200).json(out);
      } catch (err) {
        const code = err.statusCode || 500;
        res.status(code).json({ error: err.message || 'Webhook failed' });
      }
    }
  );

  exportsObj.getAdminFinancials = onRequest(adminHttpOpts, async (req, res) => {
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
      const snapshot = await selfHeal.getHealthSnapshot(db).catch(() => null);
      let revenueHint = null;
      try {
        const dash = await getMasterDashboardData(db, snapshot);
        revenueHint = dash?.analytics?.revenueCents30d;
      } catch {
        /* optional */
      }
      const url = String(req.originalUrl || req.url || '');
      let view = String(req.query.view || '').toLowerCase();
      if (!view) {
        if (url.includes('/export')) view = 'export';
        else if (url.includes('/overview') || url.includes('/trends')) view = 'overview';
        else view = 'dashboard';
      }
      const projectId = String(req.query.projectId || req.query.project || 'all').trim();
      const fromMonth = String(req.query.from || req.query.fromMonth || '').trim() || undefined;
      const toMonth = String(req.query.to || req.query.toMonth || '').trim() || undefined;

      if (view === 'export' || view === 'csv') {
        const overview = await buildFinanceOverview(db, {
          revenueCents30d: revenueHint,
          projectId,
          fromMonth,
          toMonth,
        });
        const csv = overviewToCsv(overview);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="bossmind-financials-${overview.filters.toMonth}.csv"`
        );
        res.status(200).send(csv);
        return;
      }

      if (view === 'overview' || view === 'trends' || view === 'full') {
        const overview = await buildFinanceOverview(db, {
          revenueCents30d: revenueHint,
          projectId,
          fromMonth,
          toMonth,
        });
        const fx = await getFxRates();
        res.status(200).json({ ok: true, overview, fx });
        return;
      }

      const financials = await buildFinancialDashboard(db, {
        revenueCents30d: revenueHint,
      });
      res.status(200).json({ ok: true, financials });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Financials load failed' });
    }
  });

  exportsObj.updateAdminFinanceSettings = onRequest(adminHttpOpts, async (req, res) => {
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
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const settings = await writeFinanceSettings(db, body);
      res.status(200).json({ ok: true, settings });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Settings update failed' });
    }
  });

  exportsObj.runFinanceAllocation = onRequest(adminHttpOpts, async (req, res) => {
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
      const out = await runDailyStockAllocation(db);
      res.status(200).json({ ok: true, ...out });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ error: err.message || 'Allocation failed' });
    }
  });

  exportsObj.financeAllocationCron = onSchedule(
    {
      schedule: '15 7 * * *',
      timeZone: 'America/Toronto',
      region: 'us-central1',
      timeoutSeconds: 120,
      memory: '512MiB',
    },
    async () => {
      await runDailyStockAllocation(db);
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
