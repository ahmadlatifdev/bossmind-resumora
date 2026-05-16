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

/** Public channel / series name for metadata, prompts, n8n publish (override with BOSSMIND_AI_VIDEO_CHANNEL_NAME). */
function channelName() {
  const n = (process.env.BOSSMIND_AI_VIDEO_CHANNEL_NAME || "VibeVoyage").trim();
  return n || "VibeVoyage";
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
  let mergedPayload = patch.payload;
  if (patch.payload !== undefined) {
    const cur = await getQueueById(sql, id);
    const base = cur?.payload && typeof cur.payload === "object" ? cur.payload : {};
    mergedPayload = { ...base, ...(patch.payload || {}) };
  }
  const allowed = ["status", "priority", "auto_publish", "target_platforms", "language", "payload", "title"];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const k of allowed) {
    if (patch[k] === undefined) continue;
    if (k === "payload") {
      sets.push(`payload = $${i}::jsonb`);
      vals.push(mergedPayload || {});
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
  const [counts, errors, publishes, usage] = await Promise.all([
    countByStatus(sql),
    recentErrors(sql, 10),
    recentPublishes(sql, 10),
    sql(
      `SELECT provider, SUM(units)::numeric AS units, SUM(cost_usd)::numeric AS cost
       FROM api_usage_logs WHERE project_key = $1 AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY provider ORDER BY cost DESC NULLS LAST`,
      [projectKey()]
    ),
  ]);
  return {
    ok: true,
    projectKey: projectKey(),
    channelName: channelName(),
    queueCounts: counts,
    recentErrors: errors,
    recentPublishes: publishes,
    apiUsage30dByProvider: usage,
  };
}

async function getScriptForQueue(sql, queueId) {
  const pk = projectKey();
  const rows = await sql(
    `SELECT * FROM video_scripts WHERE queue_id = $1 AND project_key = $2`,
    [queueId, pk]
  );
  return rows?.[0] || null;
}

async function getLatestScenarioForQueue(sql, queueId) {
  const pk = projectKey();
  const rows = await sql(
    `SELECT s.* FROM video_scenarios s
     JOIN video_scripts sc ON sc.id = s.script_id
     WHERE sc.queue_id = $1 AND s.project_key = $2
     ORDER BY s.id DESC
     LIMIT 1`,
    [queueId, pk]
  );
  return rows?.[0] || null;
}

async function insertScenario(sql, { scriptId, structured, model_used, status = "draft" }) {
  const pk = projectKey();
  const rows = await sql(
    `INSERT INTO video_scenarios (project_key, script_id, structured, model_used, status)
     VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING *`,
    [pk, scriptId, structured || {}, model_used || null, status]
  );
  return rows?.[0];
}

async function updateScenario(sql, scenarioId, patch) {
  const pk = projectKey();
  const rows = await sql(
    `UPDATE video_scenarios SET
       structured = COALESCE($3::jsonb, structured),
       status = COALESCE($4, status),
       model_used = COALESCE($5, model_used),
       updated_at = NOW()
     WHERE id = $1 AND project_key = $2 RETURNING *`,
    [scenarioId, pk, patch.structured || null, patch.status || null, patch.model_used || null]
  );
  return rows?.[0] || null;
}

async function listScenesForScenario(sql, scenarioId) {
  const pk = projectKey();
  return sql(
    `SELECT * FROM video_scenes WHERE scenario_id = $1 AND project_key = $2 ORDER BY scene_index ASC`,
    [scenarioId, pk]
  );
}

async function insertScene(sql, row) {
  const pk = projectKey();
  const rows = await sql(
    `INSERT INTO video_scenes (project_key, scenario_id, scene_index, prompt, duration_sec, provider, status, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
    [
      pk,
      row.scenario_id,
      row.scene_index,
      row.prompt || "",
      row.duration_sec ?? null,
      row.provider || null,
      row.status || "pending",
      row.meta || {},
    ]
  );
  return rows?.[0];
}

async function updateScene(sql, sceneId, patch) {
  const pk = projectKey();
  const rows = await sql(
    `UPDATE video_scenes SET
       prompt = COALESCE($3, prompt),
       status = COALESCE($4, status),
       error_message = COALESCE($5, error_message),
       retry_count = COALESCE($6, retry_count),
       meta = COALESCE($7::jsonb, meta),
       updated_at = NOW()
     WHERE id = $1 AND project_key = $2 RETURNING *`,
    [
      sceneId,
      pk,
      patch.prompt ?? null,
      patch.status ?? null,
      patch.error_message ?? null,
      patch.retry_count ?? null,
      patch.meta ?? null,
    ]
  );
  return rows?.[0] || null;
}

async function insertAsset(sql, row) {
  const pk = projectKey();
  const rows = await sql(
    `INSERT INTO video_assets (project_key, scene_id, asset_type, storage_uri, mime, byte_size, checksum, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
    [
      pk,
      row.scene_id || null,
      row.asset_type,
      row.storage_uri || null,
      row.mime || null,
      row.byte_size ?? null,
      row.checksum || null,
      row.meta || {},
    ]
  );
  return rows?.[0];
}

async function insertRender(sql, { scenarioId, status = "pending", meta = {} }) {
  const pk = projectKey();
  const rows = await sql(
    `INSERT INTO video_renders (project_key, scenario_id, status, meta)
     VALUES ($1,$2,$3,$4::jsonb) RETURNING *`,
    [pk, scenarioId, status, meta]
  );
  return rows?.[0];
}

async function updateRender(sql, renderId, patch) {
  const pk = projectKey();
  const rows = await sql(
    `UPDATE video_renders SET
       status = COALESCE($3, status),
       progress_pct = COALESCE($4, progress_pct),
       log_tail = COALESCE($5, log_tail),
       output_asset_id = COALESCE($6, output_asset_id),
       started_at = COALESCE($7, started_at),
       finished_at = COALESCE($8, finished_at),
       meta = COALESCE($9::jsonb, meta),
       updated_at = NOW()
     WHERE id = $1 AND project_key = $2 RETURNING *`,
    [
      renderId,
      pk,
      patch.status ?? null,
      patch.progress_pct ?? null,
      patch.log_tail ?? null,
      patch.output_asset_id ?? null,
      patch.started_at ?? null,
      patch.finished_at ?? null,
      patch.meta ?? null,
    ]
  );
  return rows?.[0] || null;
}

async function insertPublishAttempt(sql, { renderId, platform, status = "pending", published_url = null, error = null, payload = {} }) {
  const pk = projectKey();
  const rows = await sql(
    `INSERT INTO video_publish_logs (project_key, render_id, platform, status, published_url, error, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
    [pk, renderId, platform, status, published_url, error, payload]
  );
  return rows?.[0];
}

async function updatePublishLog(sql, publishId, patch) {
  const pk = projectKey();
  const rows = await sql(
    `UPDATE video_publish_logs SET
       status = COALESCE($3, status),
       published_url = COALESCE($4, published_url),
       error = COALESCE($5, error),
       payload = COALESCE($6::jsonb, payload)
     WHERE id = $1 AND project_key = $2 RETURNING *`,
    [publishId, pk, patch.status ?? null, patch.published_url ?? null, patch.error ?? null, patch.payload ?? null]
  );
  return rows?.[0] || null;
}

async function claimNextQueue(sql, fromStatus, toStatus) {
  const pk = projectKey();
  const rows = await sql(
    `WITH cte AS (
       SELECT id FROM video_queue
       WHERE project_key = $1 AND status = $2
       ORDER BY priority DESC, id ASC
       LIMIT 1
     )
     UPDATE video_queue q SET status = $3, updated_at = NOW()
     FROM cte WHERE q.id = cte.id AND q.project_key = $1
     RETURNING q.*`,
    [pk, fromStatus, toStatus]
  );
  return rows?.[0] || null;
}

async function hasSuccessfulPublish(sql, renderId, platform) {
  const pk = projectKey();
  const rows = await sql(
    `SELECT id FROM video_publish_logs
     WHERE project_key = $1 AND render_id = $2 AND platform = $3
       AND published_url IS NOT NULL AND status = 'published' LIMIT 1`,
    [pk, renderId, platform]
  );
  return rows?.length > 0;
}

async function getActiveRenderForScenario(sql, scenarioId) {
  const pk = projectKey();
  const rows = await sql(
    `SELECT * FROM video_renders WHERE scenario_id = $1 AND project_key = $2 ORDER BY id DESC LIMIT 1`,
    [scenarioId, pk]
  );
  return rows?.[0] || null;
}

async function listAssetsForScenario(sql, scenarioId) {
  const pk = projectKey();
  return sql(
    `SELECT a.* FROM video_assets a
     WHERE a.project_key = $1
       AND (
         a.scene_id IN (SELECT id FROM video_scenes WHERE scenario_id = $2 AND project_key = $1)
         OR a.id IN (
           SELECT output_asset_id FROM video_renders
           WHERE scenario_id = $2 AND project_key = $1 AND output_asset_id IS NOT NULL
         )
       )
     ORDER BY a.id ASC`,
    [pk, scenarioId]
  );
}

async function listRendersForScenario(sql, scenarioId) {
  const pk = projectKey();
  return sql(
    `SELECT * FROM video_renders WHERE scenario_id = $1 AND project_key = $2 ORDER BY id ASC`,
    [scenarioId, pk]
  );
}

async function listPublishForRender(sql, renderId) {
  const pk = projectKey();
  return sql(
    `SELECT * FROM video_publish_logs WHERE render_id = $1 AND project_key = $2 ORDER BY id ASC`,
    [renderId, pk]
  );
}

async function getJobDetail(sql, queueId) {
  const pk = projectKey();
  const queue = await getQueueById(sql, queueId);
  if (!queue) return null;
  const script = await getScriptForQueue(sql, queueId);
  let scenarioId = queue.payload?.scenarioId || null;
  let scenario = null;
  if (scenarioId) {
    const rows = await sql(`SELECT * FROM video_scenarios WHERE id = $1 AND project_key = $2`, [scenarioId, pk]);
    scenario = rows?.[0] || null;
  }
  if (!scenario) {
    scenario = await getLatestScenarioForQueue(sql, queueId);
    scenarioId = scenario?.id || null;
  }
  const scenes = scenarioId ? await listScenesForScenario(sql, scenarioId) : [];
  const assets = scenarioId ? await listAssetsForScenario(sql, scenarioId) : [];
  const renders = scenarioId ? await listRendersForScenario(sql, scenarioId) : [];
  const publishes = [];
  for (const ren of renders || []) {
    publishes.push({
      renderId: ren.id,
      items: await listPublishForRender(sql, ren.id),
    });
  }
  return { queue, script, scenario, scenes, assets, renders, publishes };
}

module.exports = {
  projectKey,
  channelName,
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
  getScriptForQueue,
  getLatestScenarioForQueue,
  insertScenario,
  updateScenario,
  listScenesForScenario,
  insertScene,
  updateScene,
  insertAsset,
  insertRender,
  updateRender,
  insertPublishAttempt,
  updatePublishLog,
  claimNextQueue,
  hasSuccessfulPublish,
  getActiveRenderForScenario,
  listAssetsForScenario,
  listRendersForScenario,
  listPublishForRender,
  getJobDetail,
};
