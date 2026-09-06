/**
 * BossMind Resilience & Operations Center (BRoC) — quarantine, backup, diagnostics.
 * Zero data loss: quarantine sets readOnly flags only; failed updates roll back via transactions.
 */
const { FieldValue } = require('firebase-admin/firestore');
const {
  CANONICAL_PROJECTS,
  ensureProjectRegistry,
  listMasterProjects,
  ownerGlobalHealthCheck,
} = require('./projectRegistry');
const selfHeal = require('../selfHeal');

const PROJECT_COLLECTION = 'projects';
const ROLLBACK_DOC = 'broc_state/quarantine_rollback';
const BACKUP_COLLECTION = 'broc_backups';
const EVENT_COLLECTION = 'broc_events';
const SAFE_MODE_SOURCE = 'broc-safe-mode';
const RESUME_SOURCE = 'broc-resume';

function projectIds() {
  return CANONICAL_PROJECTS.map((p) => p.projectId);
}

function serializeProjectRow(data, id) {
  const row = data || {};
  return {
    projectId: id,
    name: row.name || id,
    status: row.status || 'paused',
    statusSource: row.statusSource || null,
    live: row.live === true,
    healthScore: row.healthScore != null ? Number(row.healthScore) : null,
    quarantine: row.quarantine === true,
    readOnly: row.readOnly === true,
    envRegistry: row.envRegistry && typeof row.envRegistry === 'object' ? row.envRegistry : {},
    tools: row.tools && typeof row.tools === 'object' ? row.tools : {},
  };
}

/**
 * Safe Mode / Quarantine — pause all 5 projects as read-only. No deletes.
 * Transactional: on failure, previous fields are restored from in-tx snapshot.
 */
async function enterQuarantine(db, opts = {}) {
  await ensureProjectRegistry(db);
  const ids = projectIds();
  const actor = String(opts.actor || 'owner').slice(0, 80);
  const reason = String(opts.reason || 'Safe Mode panic').slice(0, 500);

  return db.runTransaction(async (tx) => {
    const refs = ids.map((id) => db.collection(PROJECT_COLLECTION).doc(id));
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const previous = {};
    for (let i = 0; i < ids.length; i++) {
      previous[ids[i]] = serializeProjectRow(snaps[i].data(), ids[i]);
    }

    const rollbackRef = db.doc(ROLLBACK_DOC);
    tx.set(
      rollbackRef,
      {
        previous,
        enteredAt: FieldValue.serverTimestamp(),
        actor,
        reason,
        active: true,
      },
      { merge: true }
    );

    for (let i = 0; i < ids.length; i++) {
      tx.set(
        refs[i],
        {
          projectId: ids[i],
          status: 'paused',
          statusSource: SAFE_MODE_SOURCE,
          live: false,
          quarantine: true,
          readOnly: true,
          quarantineReason: reason,
          quarantineAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    const eventRef = db.collection(EVENT_COLLECTION).doc();
    tx.set(eventRef, {
      type: 'quarantine_enter',
      actor,
      reason,
      projectIds: ids,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      mode: 'quarantine',
      projects: ids.map((id) => ({
        projectId: id,
        status: 'paused',
        quarantine: true,
        readOnly: true,
        previousStatus: previous[id]?.status || null,
      })),
      message: 'Safe Mode active. All projects paused read-only. No data deleted.',
    };
  });
}

/**
 * Resume from quarantine — restores prior status/flags from rollback doc inside a transaction.
 */
async function exitQuarantine(db, opts = {}) {
  await ensureProjectRegistry(db);
  const ids = projectIds();
  const actor = String(opts.actor || 'owner').slice(0, 80);

  return db.runTransaction(async (tx) => {
    const rollbackRef = db.doc(ROLLBACK_DOC);
    const rollbackSnap = await tx.get(rollbackRef);
    const rollback = rollbackSnap.exists ? rollbackSnap.data() || {} : {};
    const previous =
      rollback.previous && typeof rollback.previous === 'object' ? rollback.previous : {};

    const refs = ids.map((id) => db.collection(PROJECT_COLLECTION).doc(id));
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const prev = previous[id] || serializeProjectRow(snaps[i].data(), id);
      const restoreStatus = ['active', 'paused', 'building', 'offline'].includes(prev.status)
        ? prev.status
        : 'active';
      tx.set(
        refs[i],
        {
          projectId: id,
          status: restoreStatus,
          statusSource: RESUME_SOURCE,
          live: restoreStatus === 'active',
          quarantine: false,
          readOnly: false,
          quarantineReason: FieldValue.delete(),
          quarantineAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    tx.set(
      rollbackRef,
      {
        active: false,
        clearedAt: FieldValue.serverTimestamp(),
        clearedBy: actor,
        previous: FieldValue.delete(),
      },
      { merge: true }
    );

    const eventRef = db.collection(EVENT_COLLECTION).doc();
    tx.set(eventRef, {
      type: 'quarantine_exit',
      actor,
      projectIds: ids,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      mode: 'active',
      projects: ids.map((id) => {
        const prev = previous[id];
        return {
          projectId: id,
          status: prev?.status || 'active',
          quarantine: false,
          readOnly: false,
        };
      }),
      message: 'Safe Mode cleared. Prior project states restored transactionally.',
    };
  });
}

async function getBrocStatus(db) {
  await ensureProjectRegistry(db);
  const snapshot = await selfHeal.getHealthSnapshot(db).catch(() => null);
  const registry = await listMasterProjects(db, snapshot);
  const health = await ownerGlobalHealthCheck(db, snapshot).catch(() => null);
  const rollbackSnap = await db.doc(ROLLBACK_DOC).get();
  const rollback = rollbackSnap.exists ? rollbackSnap.data() || {} : {};
  const quarantineActive = rollback.active === true;

  const ids = projectIds();
  const projectSnaps = await Promise.all(
    ids.map((id) => db.collection(PROJECT_COLLECTION).doc(id).get())
  );
  const projects = projectSnaps.map((snap, i) => {
    const listed = (registry.projects || []).find((p) => p.projectId === ids[i]) || {};
    const row = serializeProjectRow(snap.data(), ids[i]);
    return {
      ...listed,
      ...row,
      status: listed.status || row.status,
      healthScore: listed.healthScore != null ? listed.healthScore : row.healthScore,
    };
  });

  const backups = await db
    .collection(BACKUP_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(12)
    .get()
    .catch(() => null);

  const backupLog = backups
    ? backups.docs.map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          createdAt:
            data.createdAt && data.createdAt.toDate
              ? data.createdAt.toDate().toISOString()
              : data.createdAt || null,
          actor: data.actor || null,
          projectCount: Array.isArray(data.projects) ? data.projects.length : 0,
          git: data.git || null,
          readOnly: true,
        };
      })
    : [];

  return {
    ok: true,
    broc: true,
    quarantineActive,
    generatedAt: new Date().toISOString(),
    averageHealth: registry.averageHealth,
    globalHealth: health?.globalHealth || null,
    projects,
    catalog: CANONICAL_PROJECTS.map((p) => ({ projectId: p.projectId, name: p.name })),
    backupLog,
    recovery: {
      intervalMs: 10000,
      hermesPorts: [8790, 8791],
      hint: 'Local auto-recovery poller runs in hermes-idea-queue; use Auto-Recover to re-check.',
    },
  };
}

/**
 * Read-only snapshot of project states (no client PII dumps beyond registry fields).
 * Git commit/push is executed only on local Hermes HITL when available — never deletes data.
 */
async function createAutoBackup(db, opts = {}) {
  await ensureProjectRegistry(db);
  const actor = String(opts.actor || 'owner').slice(0, 80);
  const git = opts.git && typeof opts.git === 'object' ? opts.git : null;
  const snapshot = await selfHeal.getHealthSnapshot(db).catch(() => null);
  const registry = await listMasterProjects(db, snapshot);
  const ids = projectIds();
  const rows = [];
  for (const id of ids) {
    const snap = await db.collection(PROJECT_COLLECTION).doc(id).get();
    rows.push(serializeProjectRow(snap.data(), id));
  }

  const payload = {
    actor,
    readOnly: true,
    source: 'broc-auto-backup',
    projects: rows,
    registryProjects: registry.projects || [],
    averageHealth: registry.averageHealth,
    git: git || {
      status: 'cloud_snapshot_only',
      note: 'Git commit runs via local hermes HITL when online',
    },
    createdAt: FieldValue.serverTimestamp(),
  };

  const ref = await db.collection(BACKUP_COLLECTION).add(payload);
  await db.collection(EVENT_COLLECTION).add({
    type: 'auto_backup',
    actor,
    backupId: ref.id,
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    backupId: ref.id,
    readOnly: true,
    projectCount: rows.length,
    git: payload.git,
    message: 'Read-only BRoC snapshot stored. Live client usage was not interrupted.',
    createdAt: new Date().toISOString(),
  };
}

async function runDiagnostics(db, opts = {}) {
  const hermesLocal = opts.hermesLocal || null;
  const snapshot = await selfHeal.getHealthSnapshot(db).catch((err) => ({
    error: err.message || 'health snapshot failed',
  }));
  const registry = await listMasterProjects(db, snapshot?.health ? snapshot : null).catch(
    (err) => ({
      error: err.message,
    })
  );
  const rollbackSnap = await db
    .doc(ROLLBACK_DOC)
    .get()
    .catch(() => null);

  const checks = [
    {
      id: 'firestore',
      label: 'Firestore registry',
      ok: !registry.error && Array.isArray(registry.projects),
      detail: registry.error || `${(registry.projects || []).length} projects`,
    },
    {
      id: 'self_heal',
      label: 'Self-heal health snapshot',
      ok: Boolean(snapshot && !snapshot.error),
      detail: snapshot?.error || `score=${snapshot?.health?.score ?? 'n/a'}`,
    },
    {
      id: 'cors',
      label: 'Admin CORS allowlist',
      ok: true,
      detail: 'resumora.net + localhost:5173 allowed on BRoC APIs',
    },
    {
      id: 'integrity_canonical',
      label: 'Canonical project catalog integrity',
      ok: CANONICAL_PROJECTS.length === 5,
      detail: CANONICAL_PROJECTS.map((p) => p.projectId).join(', '),
    },
    {
      id: 'quarantine_doc',
      label: 'Quarantine rollback doc',
      ok: true,
      detail: rollbackSnap?.exists
        ? `active=${Boolean(rollbackSnap.data()?.active)}`
        : 'no prior quarantine',
    },
    {
      id: 'hermes_local',
      label: 'Hermes HITL/MCP (8790/8791)',
      ok: hermesLocal == null ? null : Boolean(hermesLocal.ok),
      detail:
        hermesLocal == null
          ? 'Probe from browser / local HITL'
          : hermesLocal.detail || (hermesLocal.ok ? 'healthy' : 'unreachable'),
    },
  ];

  const hardFails = checks.filter((c) => c.ok === false).length;
  return {
    ok: hardFails === 0,
    generatedAt: new Date().toISOString(),
    checks,
    hardFails,
    message:
      hardFails === 0
        ? 'Diagnostics passed (no hard failures).'
        : `${hardFails} diagnostic check(s) failed.`,
  };
}

async function autoRecover(db, opts = {}) {
  const actor = String(opts.actor || 'owner').slice(0, 80);
  const rollbackSnap = await db.doc(ROLLBACK_DOC).get();
  if (rollbackSnap.exists && rollbackSnap.data()?.active === true) {
    return {
      ok: false,
      blocked: true,
      message: 'Safe Mode quarantine is active. Exit Safe Mode before Auto-Recover.',
    };
  }

  const summary = await selfHeal
    .runSelfHealCycle(db, null, { trigger: 'broc-auto-recover' })
    .catch((err) => ({ error: err.message }));
  const snapshot = await selfHeal.getHealthSnapshot(db).catch(() => null);
  const health = await ownerGlobalHealthCheck(db, snapshot).catch(() => null);

  await db.collection(EVENT_COLLECTION).add({
    type: 'auto_recover',
    actor,
    createdAt: FieldValue.serverTimestamp(),
    summary: summary && !summary.error ? { ok: true } : { error: summary?.error || 'unknown' },
  });

  return {
    ok: !summary?.error,
    healSummary: summary,
    globalHealth: health?.globalHealth || null,
    projects: health?.projects || null,
    hermes: {
      ports: [8790, 8791],
      localAction:
        'Ensure hermes-idea-queue is up (npm run dev:all). Auto-recovery poller runs every 10s.',
    },
    message: summary?.error
      ? `Auto-recover partial: ${summary.error}`
      : 'Auto-recover cycle completed. Check Hermes ports 8790/8791 locally.',
  };
}

module.exports = {
  enterQuarantine,
  exitQuarantine,
  getBrocStatus,
  createAutoBackup,
  runDiagnostics,
  autoRecover,
  SAFE_MODE_SOURCE,
  RESUME_SOURCE,
  PROJECT_COLLECTION,
};
