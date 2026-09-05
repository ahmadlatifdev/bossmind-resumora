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
  // Explicit operator status wins — low health must not force PAUSED after Resume.
  if (normalized === 'active') return 'active';
  if (normalized === 'paused') return 'paused';
  if (normalized === 'building') return 'building';
  const n = Number(score);
  if (!Number.isFinite(n)) return 'paused';
  if (n >= 80) return 'active';
  if (n >= 50) return 'building';
  return 'paused';
}

/**
 * Operator pause/resume — does not stop Firebase hosting; updates catalog status only.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} projectId
 * @param {string} status
 */
async function setMasterProjectStatus(db, projectId, status) {
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
  if (!['active', 'paused', 'building'].includes(next)) {
    const err = new Error('status must be active, paused, or building');
    err.statusCode = 400;
    throw err;
  }
  const ref = db.collection(COLLECTION).doc(id);
  await ref.set(
    {
      projectId: id,
      status: next,
      statusSource: 'operator',
      live: next === 'active',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  const snapshot = null;
  const registry = await listMasterProjects(db, snapshot);
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
      live:
        row.live === true ||
        status === 'active' ||
        (canon.projectId === 'resumora' && status !== 'paused'),
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

module.exports = {
  COLLECTION,
  CANONICAL_PROJECTS,
  sanitizeEnvRegistry,
  ensureProjectRegistry,
  listMasterProjects,
  setMasterProjectStatus,
  getProjectContext,
};
