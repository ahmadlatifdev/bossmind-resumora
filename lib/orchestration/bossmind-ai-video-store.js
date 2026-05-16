/**
 * BossMind AI Video Generator — Neon persistence (project-scoped; separate from Resumora).
 * Railway workers / n8n call APIs; FFmpeg and provider SDKs run off-repo.
 */
const { getSqlClient, initializeSharedMemory } = require("../shared/neon-memory.js");

const DEFAULT_PROJECT_KEY = process.env.BOSSMIND_AI_VIDEO_PROJECT_KEY || "ai-video-generator";

async function ensureDb() {
  const init = await initializeSharedMemory();
  if (!init.enabled) return { ok: false, reason: init.reason };
  const sql = getSqlClient();
  if (!sql) return { ok: false, reason: "no_sql" };
  return { ok: true, sql };
}

function projectKey() {
  return process.env.BOSSMIND_AI_VIDEO_PROJECT_KEY || DEFAULT_PROJECT_KEY;
}

async function listQueue(sql, { limit = 50, status = null } = {}) {
  const pk = projectKey();
  if (status) {
    return sql(
      `SELECT q.*,
        (SELECT COUNT(*)::int FROM video_scripts s WHERE s.queue_id = q.id) AS script_count
       FROM video_queue q
       WHERE q.project_key = $1 AND q.status = $2
       ORDER BY q.priority DESC, q.created_at ASC
       LIMIT $3`,
      [pk, status, Math.min(200, limit)]
    );
  }
  return sql(
    `SELECT q.*,
      (SELECT COUNT(*)::int FROM video_scripts s WHERE s.queue_id = q.id) AS script_count
     FROM video_queue q
     WHERE q.project_key = $1
     ORDER BY q.updated_at DESC
     LIMIT $2`,
    [pk, Math.min(200, limit)]
  );
}

async function getQueueById(sql, id) {
  const pk = projectKey();
  const rows = await sql(`SELECT * FROM video_queue WHERE id = $1 AND project_key = $2`, [id, pk]);
  return rows?.[0] || null;
}

async function insertQueue(sql, row) {
  const pk = projectKey();
  const platforms = Array.isArray(row.target_platforms) ? row.target_platforms : [];
  const rows = await sql(
    `INSERT INTO video_queue (
       project_key, priority, status, source, external_ref, title, auto_publish, target_platforms, language, payload
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
     RETURNING *`,
    [
      pk,
      row.priority ?? 0,
      row.status || "pending",
      row.source || "dashboard",
      row.external_ref || null,
      row.title || null,
      Boolean(row.auto_publish),
      platforms,
      row.language || "en",
      row.payload || {},
    ]
  );
  return rows?.[0];
}

async function updateQueue(sql, id, patch) {
  const pk = projectKey();
  const allowed = ["status", "priority", "auto_publish", "target_platforms", "language", "payload", "title"];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const k of allowed) {
    if (patch[k] === undefined) continue;
    if (k === "payload") {
      sets.push(`payload = $${i}::jsonb`);
      vals.push(patch.payload || {});
    } else if (k === "target_platforms") {
      sets.push(`target_platforms = $${i}`);
      vals.push(Array.isArray(patch.target_platforms) ? patch.target_platforms : []);
    } else {
      sets.push(`${k} = $${i}`);
      vals.push(patch[k]);
    }
    i++;
  }
  if (!sets.length) return getQueueById(sql, id);
  const idPos = i;
  const pkPos = i + 1;
  vals.push(id, pk);
  const q = `UPDATE video_queue SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${idPos} AND project_key = $${pkPos} RETURNING *`;
  const rows = await sql(q, vals);
  return rows?.[0] || null;
}

async function insertScript(sql, { queueId, rawText, meta = {} }) {
  const pk = projectKey();
  const rows = await sql(
    `INSERT INTO video_scripts (project_key, queue_id, raw_text, meta)
     VALUES ($1,$2,$3,$4::jsonb) RETURNING *`,
    [pk, queueId, rawText || "", meta || {}]
  );
  return rows?.[0];
}

async function updateScriptReview(sql, queueId, { reviewed_text, review_status, reviewer_notes }) {
  const pk = projectKey();
  const rows = await sql(
    `UPDATE video_scripts SET
       reviewed_text = COALESCE($3, reviewed_text),
       review_status = COALESCE($4, review_status),
       reviewer_notes = COALESCE($5, reviewer_notes),
       updated_at = NOW()
     WHERE queue_id = $1 AND project_key = $2
     RETURNING *`,
    [queueId, pk, reviewed_text ?? null, review_status ?? null, reviewer_notes ?? null]
  );
  return rows?.[0] || null;
}

async function countByStatus(sql) {
  const pk = projectKey();
  return sql(
    `SELECT status, COUNT(*)::int AS c FROM video_queue WHERE project_key = $1 GROUP BY status`,
    [pk]
  );
}

async function recentErrors(sql, limit = 20) {
  const pk = projectKey();
  return sql(
    `SELECT * FROM video_error_logs WHERE project_key = $1 ORDER BY created_at DESC LIMIT $2`,
    [pk, limit]
  );
}

async function recentPublishes(sql, limit = 15) {
  const pk = projectKey();
  return sql(
    `SELECT p.*, r.status AS render_status
     FROM video_publish_logs p
     JOIN video_renders r ON r.id = p.render_id
     WHERE p.project_key = $1
     ORDER BY p.created_at DESC
     LIMIT $2`,
    [pk, limit]
  );
}

async function logVideoError(sql, { queueId, step, message, fingerprint, payload }) {
  const pk = projectKey();
  await sql(
    `INSERT INTO video_error_logs (project_key, queue_id, step, fingerprint, message, payload)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [pk, queueId || null, step || "unknown", fingerprint || null, message || "", payload || {}]
  );
}

async function logApiUsage(sql, { provider, operation, units, cost_usd, external_id, meta }) {
  const pk = projectKey();
  await sql(
    `INSERT INTO api_usage_logs (project_key, provider, operation, units, cost_usd, external_id, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      pk,
      provider,
      operation || null,
      units ?? null,
      cost_usd ?? null,
      external_id || null,
      meta || {},
    ]
  );
}

async function upsertAutomationMemory(sql, memoryKey, payload) {
  const pk = projectKey();
  await sql(
    `INSERT INTO automation_memory (project_key, memory_key, payload, updated_at)
     VALUES ($1,$2,$3::jsonb, NOW())
     ON CONFLICT (project_key, memory_key) DO UPDATE SET
       payload = EXCLUDED.payload,
       updated_at = NOW()`,
    [pk, memoryKey, payload || {}]
  );
}

async function getDashboardSummary() {
  const r = await ensureDb();
  if (!r.ok) return { ok: false, reason: r.reason };
  const { sql } = r;
  const [counts, errors, publishes] = await Promise.all([
    countByStatus(sql),
    recentErrors(sql, 10),
    recentPublishes(sql, 10),
  ]);
  return {
    ok: true,
    projectKey: projectKey(),
    queueCounts: counts,
    recentErrors: errors,
    recentPublishes: publishes,
  };
}

module.exports = {
  projectKey,
  ensureDb,
  listQueue,
  getQueueById,
  insertQueue,
  updateQueue,
  insertScript,
  updateScriptReview,
  getDashboardSummary,
  logVideoError,
  logApiUsage,
  upsertAutomationMemory,
};
