/**
 * BossMind project registry (Firestore `projects`).
 * Admin SDK only — never expose secrets in envRegistry.
 */
const { FieldValue } = require('firebase-admin/firestore');

const COLLECTION = 'projects';

/** Canonical BossMind project catalog (seeded if missing). */
const CANONICAL_PROJECTS = Object.freeze([
  {
    projectId: 'resumora',
    name: 'Resumora',
    status: 'active',
    envRegistry: {
      PUBLIC_URL: 'https://resumora.net',
      API_URL: 'https://resumora.net/api',
      HOSTING_SITE: 'client-resumora-live',
    },
    tools: { hermes: true, gemini: true, veo: false },
  },
  {
    projectId: 'elegancyart',
    name: 'ElegancyArt',
    status: 'paused',
    envRegistry: {
      PUBLIC_URL: '',
      API_URL: '',
    },
    tools: { hermes: false, gemini: true, veo: false },
  },
  {
    projectId: 'ai-video',
    name: 'AI Video Generator',
    status: 'building',
    envRegistry: {
      PUBLIC_URL: '',
      API_URL: '',
    },
    tools: { hermes: false, gemini: true, veo: true },
  },
  {
    projectId: 'tiktok-ai',
    name: 'TikTok AI',
    status: 'paused',
    envRegistry: {
      PUBLIC_URL: '',
      API_URL: '',
    },
    tools: { hermes: false, gemini: true, veo: true },
  },
  {
    projectId: 'global-stock',
    name: 'Global Stock',
    status: 'paused',
    envRegistry: {
      PUBLIC_URL: '',
      API_URL: '',
    },
    tools: { hermes: false, gemini: true, veo: false },
  },
]);

function sanitizeEnvRegistry(raw) {
  const out = {};
  const src = raw && typeof raw === 'object' ? raw : {};
  for (const [k, v] of Object.entries(src)) {
    const key = String(k || '').trim();
    if (!key) continue;
    const upper = key.toUpperCase();
    if (
      upper.includes('SECRET') ||
      upper.includes('PASSWORD') ||
      upper.includes('TOKEN') ||
      upper.includes('PRIVATE') ||
      upper.startsWith('SK_') ||
      upper.includes('WEBHOOK') ||
      upper.includes('API_KEY')
    ) {
      continue;
    }
    out[key] = String(v == null ? '' : v).slice(0, 500);
  }
  return out;
}

async function ensureProjectRegistry(db) {
  const batch = db.batch();
  let writes = 0;
  for (const p of CANONICAL_PROJECTS) {
    const ref = db.collection(COLLECTION).doc(p.projectId);
    const snap = await ref.get();
    if (snap.exists) continue;
    batch.set(ref, {
      projectId: p.projectId,
      name: p.name,
      status: p.status,
      lastDeployTime: null,
      envRegistry: sanitizeEnvRegistry(p.envRegistry),
      healthScore: p.projectId === 'resumora' ? null : 0,
      tools: p.tools || {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    writes += 1;
  }
  if (writes) await batch.commit();
  return writes;
}

function healthFromSnapshot(projectId, snapshot) {
  if (projectId !== 'resumora') return null;
  const score = Number(snapshot?.health?.score);
  return Number.isFinite(score) ? score : null;
}

function statusFromHealth(storedStatus, score) {
  const normalized = storedStatus === 'running' ? 'active' : storedStatus;
  // Explicit operator / auto-recovery status wins — never force PAUSED from low health.
  if (normalized === 'active') return 'active';
  if (normalized === 'offline') return 'offline';
  if (normalized === 'paused') return 'paused';
  if (normalized === 'building') return 'building';
  const n = Number(score);
  // No explicit status: degrade gracefully without locking PAUSED.
  if (!Number.isFinite(n)) return 'active';
  if (n >= 50) return 'active';
  return 'building';
}

/**
 * Operator / auto-recovery pause/resume/offline — does not stop Firebase hosting.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} projectId
 * @param {string} status
 * @param {{ source?: string }} [opts]
 */
async function setMasterProjectStatus(db, projectId, status, opts = {}) {
  await ensureProjectRegistry(db);
  const id = String(projectId || '')
    .toLowerCase()
    .trim();
  if (!CANONICAL_PROJECTS.some((p) => p.projectId === id)) {
    const err = new Error('Unknown project');
    err.statusCode = 404;
    throw err;
  }
  let next = String(status || '')
    .toLowerCase()
    .trim();
  if (next === 'running') next = 'active';
  if (!['active', 'paused', 'building', 'offline'].includes(next)) {
    const err = new Error('status must be active, paused, building, or offline');
    err.statusCode = 400;
    throw err;
  }
  const source = String(opts.source || 'operator')
    .trim()
    .slice(0, 40);
  const ref = db.collection(COLLECTION).doc(id);
  await ref.set(
    {
      projectId: id,
      status: next,
      statusSource: source || 'operator',
      live: next === 'active',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  const registry = await listMasterProjects(db, null);
  const project = registry.projects.find((p) => p.projectId === id);
  return { ok: true, project, status: next };
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} [snapshot] selfHeal health snapshot
 */
async function listMasterProjects(db, snapshot) {
  await ensureProjectRegistry(db);
  const snap = await db.collection(COLLECTION).get();
  const byId = new Map();
  for (const doc of snap.docs) {
    byId.set(doc.id, { id: doc.id, ...(doc.data() || {}) });
  }

  const projects = CANONICAL_PROJECTS.map((canon) => {
    const row = byId.get(canon.projectId) || {};
    const liveScore = healthFromSnapshot(canon.projectId, snapshot);
    const healthScore =
      liveScore != null ? liveScore : row.healthScore != null ? Number(row.healthScore) : null;
    const status = statusFromHealth(row.status || canon.status, healthScore);
    const lastDeploy =
      row.lastDeployTime && row.lastDeployTime.toDate
        ? row.lastDeployTime.toDate().toISOString()
        : row.lastDeployTime || null;
    return {
      projectId: canon.projectId,
      name: row.name || canon.name,
      status,
      lastDeployTime: lastDeploy,
      envRegistry: sanitizeEnvRegistry(row.envRegistry || canon.envRegistry),
      healthScore: Number.isFinite(Number(healthScore)) ? Number(healthScore) : null,
      tools: { ...(canon.tools || {}), ...(row.tools || {}) },
      live: status === 'active',
    };
  });

  const scored = projects.filter((p) => p.healthScore != null);
  const averageHealth = scored.length
    ? Math.round((scored.reduce((sum, p) => sum + Number(p.healthScore), 0) / scored.length) * 10) /
      10
    : null;

  return {
    generatedAt: new Date().toISOString(),
    averageHealth,
    projects,
  };
}

function getProjectContext(projectId) {
  const id = String(projectId || 'resumora')
    .toLowerCase()
    .trim();
  const canon = CANONICAL_PROJECTS.find((p) => p.projectId === id) || CANONICAL_PROJECTS[0];
  return {
    projectId: canon.projectId,
    name: canon.name,
    tools: canon.tools,
    envRegistry: sanitizeEnvRegistry(canon.envRegistry),
  };
}

const ALLOWED_OWNER_STATUS = new Set(['active', 'paused', 'building', 'offline']);

/**
 * Owner force-set status — ignores catalog-only / pause UI locks; writes explicit status.
 */
async function setOwnerProjectStatus(db, projectId, status, opts = {}) {
  return setMasterProjectStatus(db, projectId, status, {
    source: String(opts.source || 'owner').slice(0, 40),
  });
}

/**
 * Owner batch status for all canonical (or provided) projects.
 */
async function setOwnerProjectsStatusBatch(db, status, projectIds, opts = {}) {
  const ids =
    Array.isArray(projectIds) && projectIds.length
      ? projectIds.map((id) => String(id).toLowerCase().trim()).filter(Boolean)
      : CANONICAL_PROJECTS.map((p) => p.projectId);
  const results = [];
  for (const id of ids) {
    const out = await setOwnerProjectStatus(db, id, status, opts);
    results.push(out.project || { projectId: id, status: out.status });
  }
  return { ok: true, projects: results, status };
}

/**
 * Owner upsert (create/update) project configuration. Non-canonical IDs allowed.
 */
async function upsertOwnerProject(db, input = {}) {
  await ensureProjectRegistry(db);
  const id = String(input.projectId || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 64);
  if (!id) {
    const err = new Error('projectId required');
    err.statusCode = 400;
    throw err;
  }
  const canon = CANONICAL_PROJECTS.find((p) => p.projectId === id);
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  const existing = snap.exists ? snap.data() || {} : {};

  let nextStatus =
    input.status != null
      ? String(input.status).toLowerCase().trim()
      : existing.status || (canon && canon.status) || 'paused';
  if (nextStatus === 'running') nextStatus = 'active';
  if (!ALLOWED_OWNER_STATUS.has(nextStatus)) {
    const err = new Error('status must be active, paused, building, or offline');
    err.statusCode = 400;
    throw err;
  }

  const name = String(
    input.name != null ? input.name : existing.name || (canon && canon.name) || id
  )
    .trim()
    .slice(0, 120);
  const envRegistry = sanitizeEnvRegistry(
    input.envRegistry != null
      ? input.envRegistry
      : existing.envRegistry || (canon && canon.envRegistry) || {}
  );
  const tools =
    input.tools && typeof input.tools === 'object'
      ? Object.fromEntries(
          Object.entries(input.tools).map(([k, v]) => [String(k).slice(0, 40), Boolean(v)])
        )
      : existing.tools || (canon && canon.tools) || {};

  const payload = {
    projectId: id,
    name,
    status: nextStatus,
    statusSource: 'owner',
    live: nextStatus === 'active',
    envRegistry,
    tools,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (input.healthScore != null && Number.isFinite(Number(input.healthScore))) {
    payload.healthScore = Math.max(0, Math.min(100, Number(input.healthScore)));
  }
  if (!snap.exists) {
    payload.createdAt = FieldValue.serverTimestamp();
    payload.lastDeployTime = null;
  }

  await ref.set(payload, { merge: true });
  const after = await ref.get();
  const row = after.data() || {};
  return {
    ok: true,
    created: !snap.exists,
    project: {
      projectId: id,
      name: row.name || name,
      status: row.status || nextStatus,
      lastDeployTime: row.lastDeployTime || null,
      envRegistry: sanitizeEnvRegistry(row.envRegistry || envRegistry),
      healthScore: row.healthScore != null ? Number(row.healthScore) : null,
      tools: row.tools || tools,
      live: (row.status || nextStatus) === 'active',
    },
  };
}

/**
 * Owner delete — removes Firestore config. Canonical projects re-seed on next ensure.
 */
async function deleteOwnerProject(db, projectId) {
  const id = String(projectId || '')
    .toLowerCase()
    .trim();
  if (!id) {
    const err = new Error('projectId required');
    err.statusCode = 400;
    throw err;
  }
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error('Project not found');
    err.statusCode = 404;
    throw err;
  }
  await ref.delete();
  return {
    ok: true,
    deleted: id,
    canonical: CANONICAL_PROJECTS.some((p) => p.projectId === id),
  };
}

/**
 * Owner global health check — refresh self-heal snapshot + return all projects (raw statuses).
 */
async function ownerGlobalHealthCheck(db, snapshot) {
  const registry = await listMasterProjects(db, snapshot);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    globalHealth: {
      score: snapshot?.health?.score ?? registry.averageHealth,
      status: snapshot?.health?.status || null,
      updatedAt: snapshot?.updatedAt || null,
    },
    averageHealth: registry.averageHealth,
    projects: registry.projects,
    logs: (snapshot?.recentEvents || snapshot?.events || []).slice(0, 40),
  };
}

module.exports = {
  COLLECTION,
  CANONICAL_PROJECTS,
  sanitizeEnvRegistry,
  ensureProjectRegistry,
  listMasterProjects,
  setMasterProjectStatus,
  setOwnerProjectStatus,
  setOwnerProjectsStatusBatch,
  upsertOwnerProject,
  deleteOwnerProject,
  ownerGlobalHealthCheck,
  getProjectContext,
};
