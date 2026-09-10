/**
 * Shared Memory / system error ledger + editable BossMind Manual (Firestore).
 * Never stores secret values; redacts common key patterns.
 */
'use strict';

const { FieldValue } = require('firebase-admin/firestore');

const ERRORS_COL = process.env.SYSTEM_ERRORS_COLLECTION || 'system_errors';
const SHARED_MEMORY_COL = process.env.SHARED_MEMORY_COLLECTION || 'shared_memory';
const MANUAL_COL = process.env.BOSSMIND_MANUAL_COLLECTION || 'manual';
const MANUAL_DOC = process.env.BOSSMIND_MANUAL_DOC || 'bossmind';

const SENSITIVE_RE =
  /\b(sk_live_[A-Za-z0-9]+|sk_test_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|pk_live_[A-Za-z0-9]+|price_[A-Za-z0-9]+|Bearer\s+[A-Za-z0-9._\-]+|AIza[0-9A-Za-z\-_]{20,})\b/gi;

function redactText(value) {
  return String(value ?? '')
    .replace(SENSITIVE_RE, '[REDACTED]')
    .slice(0, 4000);
}

function serializeTimestamps(data) {
  const out = { ...data };
  for (const key of Object.keys(out)) {
    if (out[key] && typeof out[key].toDate === 'function') {
      out[key] = out[key].toDate().toISOString();
    }
  }
  return out;
}

/**
 * Persist an error event to `system_errors` and mirror a summary under `shared_memory`.
 */
async function logSystemError(db, payload = {}) {
  const message = redactText(payload.message || payload.error || 'Unknown error');
  if (!message.trim()) {
    throw Object.assign(new Error('Missing error message'), { statusCode: 400 });
  }

  const doc = {
    message,
    stack: redactText(payload.stack || '').slice(0, 8000) || null,
    source: redactText(payload.source || 'frontend').slice(0, 120),
    url: redactText(payload.url || payload.href || '').slice(0, 500) || null,
    path: redactText(payload.path || '').slice(0, 300) || null,
    severity: ['debug', 'info', 'warn', 'error', 'critical'].includes(
      String(payload.severity || '').toLowerCase()
    )
      ? String(payload.severity).toLowerCase()
      : 'error',
    context: redactText(
      typeof payload.context === 'string'
        ? payload.context
        : JSON.stringify(payload.context || {}).slice(0, 2000)
    ),
    userAgent: redactText(payload.userAgent || '').slice(0, 400) || null,
    projectId: 'resumora',
    createdAt: FieldValue.serverTimestamp(),
  };

  const ref = await db.collection(ERRORS_COL).add(doc);

  // Mirror latest error pointer into shared_memory for dashboards / bridges.
  await db.collection(SHARED_MEMORY_COL).doc('latest_error').set(
    {
      kind: 'error',
      errorId: ref.id,
      message: doc.message,
      source: doc.source,
      severity: doc.severity,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true, id: ref.id };
}

async function listSystemErrors(db, { limit = 50 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  let snap;
  try {
    snap = await db.collection(ERRORS_COL).orderBy('createdAt', 'desc').limit(lim).get();
  } catch (_) {
    snap = await db.collection(ERRORS_COL).limit(lim).get();
  }
  const errors = snap.docs.map((d) => serializeTimestamps({ id: d.id, ...(d.data() || {}) }));
  return { ok: true, count: errors.length, errors };
}

function defaultManualBody() {
  return [
    '# BossMind Manual',
    '',
    'Editable owner runbook for Resumora Admin.',
    '',
    '## Quick links',
    '- Production: https://resumora.net',
    '- Admin: /admin/master',
    '- System Health: /admin/system-health',
    '',
    '## Notes',
    '- Do not paste secrets, Stripe keys, or database URLs here.',
    '- Changes auto-save to Firestore collection `manual`.',
    '',
  ].join('\n');
}

async function getBossMindManual(db) {
  const ref = db.collection(MANUAL_COL).doc(MANUAL_DOC);
  const snap = await ref.get();
  if (!snap.exists) {
    const seed = {
      title: 'BossMind Manual',
      content: defaultManualBody(),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      version: 1,
    };
    await ref.set(seed, { merge: true });
    const fresh = await ref.get();
    return {
      ok: true,
      manual: serializeTimestamps({ id: fresh.id, ...(fresh.data() || {}) }),
      seeded: true,
    };
  }
  return {
    ok: true,
    manual: serializeTimestamps({ id: snap.id, ...(snap.data() || {}) }),
    seeded: false,
  };
}

async function saveBossMindManual(db, patch = {}) {
  const title = String(patch.title != null ? patch.title : 'BossMind Manual')
    .trim()
    .slice(0, 200);
  const content = String(patch.content != null ? patch.content : '');
  if (content.length > 200000) {
    throw Object.assign(new Error('Manual content too large'), { statusCode: 413 });
  }
  const ref = db.collection(MANUAL_COL).doc(MANUAL_DOC);
  await ref.set(
    {
      title: title || 'BossMind Manual',
      content,
      updatedAt: FieldValue.serverTimestamp(),
      version: FieldValue.increment(1),
    },
    { merge: true }
  );
  const fresh = await ref.get();
  return {
    ok: true,
    manual: serializeTimestamps({ id: fresh.id, ...(fresh.data() || {}) }),
  };
}

module.exports = {
  ERRORS_COL,
  SHARED_MEMORY_COL,
  MANUAL_COL,
  MANUAL_DOC,
  logSystemError,
  listSystemErrors,
  getBossMindManual,
  saveBossMindManual,
  redactText,
};
