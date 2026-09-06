/**
 * ACK-gated Hermes/Cursor harness tasks (Admin SDK only).
 *
 * Security:
 * - Cloud Functions NEVER execute arbitrary shell/commands or apply codeDiff to disk.
 * - Production deploy requires explicit admin ACK + optional autoDeploy toggle (default OFF).
 * - Safe Mode quarantine blocks all gcloud/shell command ACK/apply (403).
 * - Proposed commands are stored for Cursor/local scripts after ACK only.
 */
const { FieldValue } = require('firebase-admin/firestore');

const COLLECTION = 'harness_tasks';
const SETTINGS_DOC = ['admin_settings', 'harness_automation'];
const QUARANTINE_DOC = 'broc_state/quarantine_rollback';
const HEALTHY_REVISION_DOC = 'broc_state/healthy_revision';
const STATUSES = new Set([
  'pending',
  'acked',
  'in-progress',
  'applied',
  'deployed',
  'failed',
  'rejected',
]);

function sanitizeCommands(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) =>
      String(c || '')
        .trim()
        .slice(0, 500)
    )
    .filter(Boolean)
    .slice(0, 20);
}

function sanitizeDiff(raw) {
  const s = String(raw || '');
  if (!s) return '';
  return s.slice(0, 100000);
}

function looksLikeShellOrGcloud(commands) {
  return sanitizeCommands(commands).some((c) =>
    /gcloud\b|powershell\b|cmd\.exe|\bbash\b|\bsh\s+-c|npm\s+run\s+deploy|firebase\s+deploy|kubectl\b|curl\s+.*\|/i.test(
      c
    )
  );
}

async function isQuarantined(db) {
  const snap = await db.doc(QUARANTINE_DOC).get();
  return Boolean(snap.exists && snap.data() && snap.data().active === true);
}

/**
 * Physical block: while Safe Mode quarantine is on, reject shell/gcloud command paths.
 */
async function assertCommandsAllowed(db, commands, { action = 'harness' } = {}) {
  if (!(await isQuarantined(db))) return;
  const list = sanitizeCommands(commands);
  if (!list.length) return;
  if (looksLikeShellOrGcloud(list) || list.length > 0) {
    const err = new Error(
      `Safe Mode quarantine active — ${action} blocked for shell/gcloud commands (403)`
    );
    err.statusCode = 403;
    throw err;
  }
}

function readProcessRevision() {
  return (
    String(
      process.env.K_REVISION ||
        process.env.CLOUD_RUN_REVISION ||
        process.env.FUNCTION_REVISION ||
        ''
    ).trim() || null
  );
}

function readProcessService() {
  return (
    String(
      process.env.K_SERVICE || process.env.FUNCTION_TARGET || process.env.K_CONFIGURATION || ''
    )
      .trim()
      .slice(0, 120) || 'cloud-run'
  );
}

/**
 * Capture current Cloud Run revision before ACK-gated work (rollback protection).
 */
async function captureHealthyRevision(db, opts = {}) {
  const revisionId = opts.revisionId || readProcessRevision();
  const service = opts.service || readProcessService();
  const payload = {
    revisionId,
    service,
    projectId: String(opts.projectId || 'resumora').slice(0, 64),
    capturedAt: FieldValue.serverTimestamp(),
    source: String(opts.source || 'harness').slice(0, 40),
  };
  await db.doc(HEALTHY_REVISION_DOC).set(payload, { merge: true });
  return {
    revisionId,
    service,
    projectId: payload.projectId,
    capturedAt: new Date().toISOString(),
  };
}

async function readHealthyRevision(db) {
  const snap = await db.doc(HEALTHY_REVISION_DOC).get();
  if (!snap.exists) {
    return {
      revisionId: readProcessRevision(),
      service: readProcessService(),
      capturedAt: null,
    };
  }
  const d = snap.data() || {};
  return {
    revisionId: d.revisionId || readProcessRevision(),
    service: d.service || readProcessService(),
    projectId: d.projectId || 'resumora',
    capturedAt:
      d.capturedAt && d.capturedAt.toDate
        ? d.capturedAt.toDate().toISOString()
        : d.capturedAt || null,
  };
}

async function readAutomationSettings(db) {
  const snap = await db.doc(SETTINGS_DOC.join('/')).get();
  const data = snap.exists ? snap.data() || {} : {};
  return {
    // Permanent default OFF — never treat missing as true.
    autoDeployAfterAck: data.autoDeployAfterAck === true,
    createTasksOnLowHealth: data.createTasksOnLowHealth === true,
    allowSampleTasks: data.allowSampleTasks === true,
    healthThreshold: Number.isFinite(Number(data.healthThreshold))
      ? Number(data.healthThreshold)
      : 80,
  };
}

async function setAutomationSettings(db, patch) {
  const next = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (typeof patch.autoDeployAfterAck === 'boolean') {
    next.autoDeployAfterAck = patch.autoDeployAfterAck === true;
  }
  if (typeof patch.createTasksOnLowHealth === 'boolean') {
    next.createTasksOnLowHealth = patch.createTasksOnLowHealth === true;
  }
  if (typeof patch.allowSampleTasks === 'boolean') {
    next.allowSampleTasks = patch.allowSampleTasks === true;
  }
  if (Number.isFinite(Number(patch.healthThreshold))) {
    next.healthThreshold = Number(patch.healthThreshold);
  }
  await db.doc(SETTINGS_DOC.join('/')).set(next, { merge: true });
  return readAutomationSettings(db);
}

/**
 * Create a proposal task. Does not apply anything.
 */
async function createTask(db, input = {}) {
  const description = String(input.description || '')
    .trim()
    .slice(0, 2000);
  if (!description) {
    const err = new Error('description required');
    err.statusCode = 400;
    throw err;
  }
  const commands = sanitizeCommands(input.commands);
  const isSample =
    /Sample:\s*set LOG_LEVEL/i.test(description) || commands.some((c) => /LOG_LEVEL=info/i.test(c));
  const settings = await readAutomationSettings(db);
  if (isSample && settings.allowSampleTasks !== true) {
    const err = new Error('Sample tasks are disabled (allowSampleTasks=false)');
    err.statusCode = 403;
    throw err;
  }
  await assertCommandsAllowed(db, commands, { action: 'create-task' });

  const healthy = await captureHealthyRevision(db, {
    projectId: input.projectId || 'resumora',
    source: 'create-task',
  });

  const ref = db.collection(COLLECTION).doc();
  const row = {
    id: ref.id,
    description,
    status: 'pending',
    codeDiff: sanitizeDiff(input.codeDiff),
    commands,
    projectId: String(input.projectId || 'resumora').slice(0, 64),
    actor: input.actor === 'admin' ? 'admin' : 'hermes',
    risk: String(input.risk || 'medium').slice(0, 32),
    isSample: Boolean(isSample),
    lastKnownHealthyRevision: healthy.revisionId,
    lastKnownHealthyService: healthy.service,
    ackedAt: null,
    ackedBy: null,
    appliedAt: null,
    deployedAt: null,
    deployRunUrl: null,
    autoDeployEligible: false,
    logs: Array.isArray(input.logs) ? input.logs.slice(0, 50) : [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(row);
  return {
    id: ref.id,
    ...row,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function serializeTask(doc) {
  const d = doc.data() || {};
  const out = { id: doc.id, ...d };
  for (const key of Object.keys(out)) {
    if (out[key] && typeof out[key].toDate === 'function') {
      out[key] = out[key].toDate().toISOString();
    }
  }
  return out;
}

async function listTasks(db, { status, limit = 40 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 40, 1), 100);
  let snap;
  try {
    if (status && STATUSES.has(status)) {
      snap = await db
        .collection(COLLECTION)
        .where('status', '==', status)
        .orderBy('createdAt', 'desc')
        .limit(lim)
        .get();
    } else {
      snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(lim).get();
    }
  } catch (_) {
    snap = await db.collection(COLLECTION).limit(lim).get();
  }
  return snap.docs.map(serializeTask);
}

async function getTask(db, taskId) {
  const snap = await db
    .collection(COLLECTION)
    .doc(String(taskId || ''))
    .get();
  if (!snap.exists) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }
  return serializeTask(snap);
}

/**
 * Manual ACK required before Cursor/local apply or deploy trigger metadata.
 * Does NOT run commands on the server. Quarantine blocks command-bearing ACK.
 */
async function ackTask(db, taskId, { ack = true, note = '' } = {}) {
  const ref = db.collection(COLLECTION).doc(String(taskId || ''));
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }
  const data = snap.data() || {};
  if (data.status === 'deployed' || data.status === 'rejected') {
    const err = new Error(`Task already ${data.status}`);
    err.statusCode = 409;
    throw err;
  }
  if (!ack) {
    await ref.set(
      {
        status: 'rejected',
        logs: FieldValue.arrayUnion(
          `rejected:${new Date().toISOString()}:${String(note || '').slice(0, 200)}`
        ),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return getTask(db, taskId);
  }

  const commands = sanitizeCommands(data.commands);
  await assertCommandsAllowed(db, commands, { action: 'ACK' });

  const healthy = await captureHealthyRevision(db, {
    projectId: data.projectId || 'resumora',
    source: 'ack-task',
  });
  const settings = await readAutomationSettings(db);
  const autoDeployEligible = settings.autoDeployAfterAck === true;

  await ref.set(
    {
      status: 'acked',
      ackedAt: FieldValue.serverTimestamp(),
      ackedBy: 'admin',
      autoDeployEligible,
      lastKnownHealthyRevision: healthy.revisionId || data.lastKnownHealthyRevision || null,
      lastKnownHealthyService: healthy.service || data.lastKnownHealthyService || null,
      logs: FieldValue.arrayUnion(
        `acked:${new Date().toISOString()}:${String(note || 'ACK').slice(0, 200)}` +
          (healthy.revisionId ? `:rev=${healthy.revisionId}` : '')
      ),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return getTask(db, taskId);
}

/**
 * Mark applied by Cursor/local agent after ACK. Server does not mutate git.
 */
async function markApplied(db, taskId, { log = '' } = {}) {
  const ref = db.collection(COLLECTION).doc(String(taskId || ''));
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }
  const data = snap.data() || {};
  if (data.status !== 'acked' && data.status !== 'in-progress') {
    const err = new Error('Task must be ACKED before mark-applied');
    err.statusCode = 409;
    throw err;
  }
  await assertCommandsAllowed(db, data.commands, { action: 'mark-applied' });
  await ref.set(
    {
      status: 'applied',
      appliedAt: FieldValue.serverTimestamp(),
      logs: FieldValue.arrayUnion(
        `applied:${new Date().toISOString()}:${String(log || 'cursor').slice(0, 200)}`
      ),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return getTask(db, taskId);
}

async function updateDeployStatus(db, taskId, { success, runUrl = '', conclusion = '' } = {}) {
  const ref = db.collection(COLLECTION).doc(String(taskId || ''));
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }
  if (await isQuarantined(db)) {
    const err = new Error('Safe Mode quarantine active — deploy status updates blocked (403)');
    err.statusCode = 403;
    throw err;
  }
  await ref.set(
    {
      status: success ? 'deployed' : 'failed',
      deployedAt: success ? FieldValue.serverTimestamp() : null,
      deployRunUrl: String(runUrl || '').slice(0, 500) || null,
      logs: FieldValue.arrayUnion(
        `deploy:${success ? 'ok' : 'fail'}:${conclusion || ''}:${new Date().toISOString()}`
      ),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return getTask(db, taskId);
}

/**
 * When health score drops below threshold, open one pending task (deduped per day).
 * Never auto-attaches gcloud/shell commands.
 */
async function maybeCreateHealthTask(db, { score, status, findings, cycleId } = {}) {
  const settings = await readAutomationSettings(db);
  if (!settings.createTasksOnLowHealth) return null;
  const n = Number(score);
  if (!Number.isFinite(n) || n >= settings.healthThreshold) return null;

  const day = new Date().toISOString().slice(0, 10);
  const dedupeId = `health-low-${day}`;
  const existing = await db.collection(COLLECTION).doc(dedupeId).get();
  if (existing.exists) return { id: dedupeId, deduped: true };

  const findingCodes = (findings || [])
    .map((f) => f.code || f.id || '')
    .filter(Boolean)
    .slice(0, 12);
  const description = [
    `Self-heal: Resumora health score ${n} (${status || 'unknown'}) below ${settings.healthThreshold}.`,
    `Cycle: ${cycleId || 'n/a'}`,
    findingCodes.length ? `Findings: ${findingCodes.join(', ')}` : 'No finding codes.',
    'ACK required. Do not auto-deploy. Cursor may propose fixes after ACK.',
  ].join(' ');

  const healthy = await captureHealthyRevision(db, { source: 'health-task' });

  await db
    .collection(COLLECTION)
    .doc(dedupeId)
    .set({
      id: dedupeId,
      description,
      status: 'pending',
      codeDiff: '',
      commands: [],
      projectId: 'resumora',
      actor: 'hermes',
      risk: 'high',
      isSample: false,
      lastKnownHealthyRevision: healthy.revisionId,
      lastKnownHealthyService: healthy.service,
      ackedAt: null,
      ackedBy: null,
      appliedAt: null,
      deployedAt: null,
      deployRunUrl: null,
      autoDeployEligible: false,
      logs: [`created_from_self_heal:${new Date().toISOString()}`],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  return { id: dedupeId, deduped: false };
}

module.exports = {
  COLLECTION,
  createTask,
  listTasks,
  getTask,
  ackTask,
  markApplied,
  updateDeployStatus,
  readAutomationSettings,
  setAutomationSettings,
  maybeCreateHealthTask,
  isQuarantined,
  captureHealthyRevision,
  readHealthyRevision,
  assertCommandsAllowed,
};
