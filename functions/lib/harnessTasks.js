/**
 * ACK-gated Hermes/Cursor harness tasks (Admin SDK only).
 *
 * Security:
 * - Cloud Functions NEVER execute arbitrary shell/commands or apply codeDiff to disk.
 * - Production deploy requires explicit admin ACK + optional autoDeploy toggle.
 * - Proposed commands are stored for Cursor/local scripts after ACK only.
 */
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

const COLLECTION = 'harness_tasks';
const SETTINGS_DOC = ['admin_settings', 'harness_automation'];
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

async function readAutomationSettings(db) {
  const snap = await db.doc(SETTINGS_DOC.join('/')).get();
  const data = snap.exists ? snap.data() || {} : {};
  return {
    autoDeployAfterAck: data.autoDeployAfterAck === true,
    createTasksOnLowHealth: data.createTasksOnLowHealth !== false,
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
    next.autoDeployAfterAck = patch.autoDeployAfterAck;
  }
  if (typeof patch.createTasksOnLowHealth === 'boolean') {
    next.createTasksOnLowHealth = patch.createTasksOnLowHealth;
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
  const ref = db.collection(COLLECTION).doc();
  const row = {
    id: ref.id,
    description,
    status: 'pending',
    codeDiff: sanitizeDiff(input.codeDiff),
    commands: sanitizeCommands(input.commands),
    projectId: String(input.projectId || 'resumora').slice(0, 64),
    actor: input.actor === 'admin' ? 'admin' : 'hermes',
    risk: String(input.risk || 'medium').slice(0, 32),
    ackedAt: null,
    ackedBy: null,
    appliedAt: null,
    deployedAt: null,
    deployRunUrl: null,
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
 * Does NOT run commands on the server.
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
  const settings = await readAutomationSettings(db);
  await ref.set(
    {
      status: 'acked',
      ackedAt: FieldValue.serverTimestamp(),
      ackedBy: 'admin',
      autoDeployEligible: settings.autoDeployAfterAck === true,
      logs: FieldValue.arrayUnion(
        `acked:${new Date().toISOString()}:${String(note || 'ACK').slice(0, 200)}`
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
      ackedAt: null,
      ackedBy: null,
      appliedAt: null,
      deployedAt: null,
      deployRunUrl: null,
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
};
