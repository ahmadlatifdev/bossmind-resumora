const crypto = require("crypto");
const { neon } = require("@neondatabase/serverless");

const REQUIRED_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS task_state (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    task_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    assigned_agent TEXT,
    lock_key TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_key, task_key)
  )`,
  `CREATE TABLE IF NOT EXISTS event_log (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    source TEXT,
    event_key TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS error_memory (
    id BIGSERIAL PRIMARY KEY,
    fingerprint TEXT NOT NULL UNIQUE,
    project_key TEXT NOT NULL,
    error_type TEXT NOT NULL,
    error_message TEXT NOT NULL,
    stack_excerpt TEXT,
    root_cause TEXT,
    fix_pattern TEXT,
    times_seen INTEGER NOT NULL DEFAULT 1,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS missing_updates_log (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    task_key TEXT,
    reason TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS deployment_history (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    commit_hash TEXT,
    environment TEXT NOT NULL DEFAULT 'production',
    status TEXT NOT NULL,
    summary TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS runtime_authority (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    authority_key TEXT NOT NULL,
    commit_hash TEXT,
    baseline_hash TEXT NOT NULL,
    route_path TEXT NOT NULL DEFAULT '/',
    source TEXT NOT NULL DEFAULT 'bossmind-runtime-sync',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_key, authority_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_runtime_authority_project_created ON runtime_authority(project_key, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS rollback_snapshots (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    file_path TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    snapshot_body TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rollback_snapshots_project_created ON rollback_snapshots(project_key, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS screenshot_analysis_log (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    source_folder TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    file_hash TEXT NOT NULL,
    analyzed BOOLEAN NOT NULL DEFAULT FALSE,
    analysis_summary TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_event_log_project_created ON event_log(project_key, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_error_memory_project_last_seen ON error_memory(project_key, last_seen_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_deployment_history_project_created ON deployment_history(project_key, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS engagement_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS engagement_sessions (
    id BIGSERIAL PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES engagement_profiles(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_engagement_sessions_profile ON engagement_sessions(profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_engagement_sessions_exp ON engagement_sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS engagement_visitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS engagement_likes (
    id BIGSERIAL PRIMARY KEY,
    resource_key TEXT NOT NULL,
    profile_id UUID REFERENCES engagement_profiles(id) ON DELETE CASCADE,
    visitor_id UUID REFERENCES engagement_visitors(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT engagement_likes_actor_chk CHECK (
      (profile_id IS NOT NULL AND visitor_id IS NULL)
      OR (profile_id IS NULL AND visitor_id IS NOT NULL)
    )
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_engagement_likes_prof ON engagement_likes (resource_key, profile_id)
    WHERE profile_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_engagement_likes_vis ON engagement_likes (resource_key, visitor_id)
    WHERE visitor_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS engagement_dislikes (
    id BIGSERIAL PRIMARY KEY,
    resource_key TEXT NOT NULL,
    profile_id UUID REFERENCES engagement_profiles(id) ON DELETE CASCADE,
    visitor_id UUID REFERENCES engagement_visitors(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT engagement_dislikes_actor_chk CHECK (
      (profile_id IS NOT NULL AND visitor_id IS NULL)
      OR (profile_id IS NULL AND visitor_id IS NOT NULL)
    )
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_engagement_dislikes_prof ON engagement_dislikes (resource_key, profile_id)
    WHERE profile_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_engagement_dislikes_vis ON engagement_dislikes (resource_key, visitor_id)
    WHERE visitor_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS engagement_saves (
    id BIGSERIAL PRIMARY KEY,
    resource_key TEXT NOT NULL,
    profile_id UUID REFERENCES engagement_profiles(id) ON DELETE CASCADE,
    visitor_id UUID REFERENCES engagement_visitors(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT engagement_saves_actor_chk CHECK (
      (profile_id IS NOT NULL AND visitor_id IS NULL)
      OR (profile_id IS NULL AND visitor_id IS NOT NULL)
    )
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_engagement_saves_prof ON engagement_saves (resource_key, profile_id)
    WHERE profile_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_engagement_saves_vis ON engagement_saves (resource_key, visitor_id)
    WHERE visitor_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS engagement_requests (
    id BIGSERIAL PRIMARY KEY,
    resource_key TEXT NOT NULL,
    profile_id UUID REFERENCES engagement_profiles(id) ON DELETE CASCADE,
    visitor_id UUID REFERENCES engagement_visitors(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT engagement_requests_actor_chk CHECK (
      (profile_id IS NOT NULL AND visitor_id IS NULL)
      OR (profile_id IS NULL AND visitor_id IS NOT NULL)
    )
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_engagement_requests_prof ON engagement_requests (resource_key, profile_id)
    WHERE profile_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_engagement_requests_vis ON engagement_requests (resource_key, visitor_id)
    WHERE visitor_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS engagement_follows (
    id BIGSERIAL PRIMARY KEY,
    profile_id UUID REFERENCES engagement_profiles(id) ON DELETE CASCADE,
    visitor_id UUID REFERENCES engagement_visitors(id) ON DELETE CASCADE,
    target TEXT NOT NULL DEFAULT 'resumora',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT engagement_follows_actor_chk CHECK (
      (profile_id IS NOT NULL AND visitor_id IS NULL)
      OR (profile_id IS NULL AND visitor_id IS NOT NULL)
    )
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_engagement_follows_prof ON engagement_follows (target, profile_id)
    WHERE profile_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_engagement_follows_vis ON engagement_follows (target, visitor_id)
    WHERE visitor_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS engagement_reviews (
    id BIGSERIAL PRIMARY KEY,
    profile_id UUID REFERENCES engagement_profiles(id) ON DELETE SET NULL,
    quote TEXT NOT NULL,
    author_display TEXT NOT NULL,
    role_display TEXT,
    region_code TEXT,
    approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_engagement_reviews_approved ON engagement_reviews(approved, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS engagement_activity (
    id BIGSERIAL PRIMARY KEY,
    profile_id UUID REFERENCES engagement_profiles(id) ON DELETE SET NULL,
    visitor_id UUID REFERENCES engagement_visitors(id) ON DELETE SET NULL,
    resource_key TEXT,
    action TEXT NOT NULL,
    region_hint TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_engagement_activity_created ON engagement_activity(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_engagement_activity_region ON engagement_activity(region_hint, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS marketing_week_log (
    id BIGSERIAL PRIMARY KEY,
    week_id TEXT NOT NULL,
    lang TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_marketing_week_log_week ON marketing_week_log(week_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS analytics_web_events (
    id BIGSERIAL PRIMARY KEY,
    path TEXT NOT NULL,
    referrer TEXT,
    lang TEXT,
    source TEXT,
    campaign TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_analytics_web_events_created ON analytics_web_events(created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS free_test_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    service_key TEXT NOT NULL,
    lang TEXT NOT NULL,
    page_count INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    upload_original_name TEXT,
    upload_stored_name TEXT,
    upload_size_bytes INTEGER,
    request_type TEXT NOT NULL DEFAULT 'free_test_request',
    conversion_status TEXT NOT NULL DEFAULT 'submitted',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_free_test_created ON free_test_requests(created_at DESC)`,
];

function getSqlClient() {
  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }
  return neon(databaseUrl);
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function initializeSharedMemory() {
  const sql = getSqlClient();
  if (!sql) {
    return { enabled: false, reason: "NEON_DATABASE_URL is missing" };
  }

  for (const statement of REQUIRED_TABLES_SQL) {
    await sql(statement);
  }
  return { enabled: true };
}

async function upsertErrorMemory({
  projectKey,
  errorType,
  errorMessage,
  stackExcerpt = "",
  rootCause = "",
  fixPattern = "",
}) {
  const sql = getSqlClient();
  if (!sql) return;

  const fingerprint = digest(`${projectKey}|${errorType}|${errorMessage}`.toLowerCase());
  await sql(
    `INSERT INTO error_memory (
      fingerprint, project_key, error_type, error_message, stack_excerpt, root_cause, fix_pattern
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7
    )
    ON CONFLICT (fingerprint) DO UPDATE SET
      times_seen = error_memory.times_seen + 1,
      stack_excerpt = EXCLUDED.stack_excerpt,
      root_cause = COALESCE(NULLIF(EXCLUDED.root_cause, ''), error_memory.root_cause),
      fix_pattern = COALESCE(NULLIF(EXCLUDED.fix_pattern, ''), error_memory.fix_pattern),
      last_seen_at = NOW(),
      updated_at = NOW()`,
    [fingerprint, projectKey, errorType, errorMessage, stackExcerpt, rootCause, fixPattern]
  );
}

async function saveEvent({
  projectKey,
  eventType,
  severity = "info",
  source = "system",
  eventKey = "",
  payload = {},
}) {
  const sql = getSqlClient();
  if (!sql) return;
  await sql(
    `INSERT INTO event_log (project_key, event_type, severity, source, event_key, payload)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [projectKey, eventType, severity, source, eventKey, payload]
  );
}

async function upsertTaskState({
  projectKey,
  taskKey,
  status,
  assignedAgent = "",
  payload = {},
}) {
  const sql = getSqlClient();
  if (!sql) return;
  await sql(
    `INSERT INTO task_state (project_key, task_key, status, assigned_agent, payload)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (project_key, task_key) DO UPDATE SET
       status = EXCLUDED.status,
       assigned_agent = EXCLUDED.assigned_agent,
       payload = EXCLUDED.payload,
       updated_at = NOW()`,
    [projectKey, taskKey, status, assignedAgent, payload]
  );
}

async function saveDeploymentHistory({
  projectKey,
  commitHash = "",
  status,
  summary = "",
  environment = "production",
  metadata = {},
}) {
  const sql = getSqlClient();
  if (!sql) return;
  await sql(
    `INSERT INTO deployment_history (project_key, commit_hash, environment, status, summary, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [projectKey, commitHash, environment, status, summary, metadata]
  );
}

async function upsertRuntimeAuthority({
  projectKey,
  authorityKey = "luxury_ui_baseline",
  commitHash = "",
  baselineHash,
  routePath = "/",
  source = "bossmind-runtime-sync",
  payload = {},
  active = true,
}) {
  const sql = getSqlClient();
  if (!sql) return;
  await sql(
    `INSERT INTO runtime_authority (
      project_key, authority_key, commit_hash, baseline_hash, route_path, source, payload, active
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8
    )
    ON CONFLICT (project_key, authority_key) DO UPDATE SET
      commit_hash = EXCLUDED.commit_hash,
      baseline_hash = EXCLUDED.baseline_hash,
      route_path = EXCLUDED.route_path,
      source = EXCLUDED.source,
      payload = EXCLUDED.payload,
      active = EXCLUDED.active,
      created_at = NOW()`,
    [projectKey, authorityKey, commitHash, baselineHash, routePath, source, payload, active]
  );
}

async function getRuntimeAuthority({
  projectKey,
  authorityKey = "luxury_ui_baseline",
} = {}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `SELECT id, project_key, authority_key, commit_hash, baseline_hash, route_path, source, payload, active, created_at
     FROM runtime_authority
     WHERE project_key = $1 AND authority_key = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [projectKey, authorityKey]
  );
  return rows?.length ? rows[0] : null;
}

async function saveMissingUpdate({
  projectKey,
  taskKey = "",
  reason,
  payload = {},
}) {
  const sql = getSqlClient();
  if (!sql) return;
  await sql(
    `INSERT INTO missing_updates_log (project_key, task_key, reason, payload)
     VALUES ($1, $2, $3, $4)`,
    [projectKey, taskKey, reason, payload]
  );
}

async function saveRollbackSnapshot({
  projectKey,
  filePath,
  snapshotBody,
  reason = "pre-edit",
}) {
  const sql = getSqlClient();
  if (!sql) return;
  const snapshotHash = digest(`${filePath}|${snapshotBody}`);
  await sql(
    `INSERT INTO rollback_snapshots (project_key, file_path, snapshot_hash, snapshot_body, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [projectKey, filePath, snapshotHash, snapshotBody, reason]
  );
}

async function listRecentEvents({ projectKey, limit = 40 }) {
  const sql = getSqlClient();
  if (!sql) return [];
  const rows = await sql(
    `SELECT id, event_type, severity, source, payload, created_at
     FROM event_log
     WHERE project_key = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [projectKey, limit]
  );
  return rows || [];
}

async function listRecentTaskStates({ projectKey, limit = 40 }) {
  const sql = getSqlClient();
  if (!sql) return [];
  const rows = await sql(
    `SELECT id, task_key, status, assigned_agent, payload, updated_at
     FROM task_state
     WHERE project_key = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [projectKey, limit]
  );
  return rows || [];
}

/**
 * Atomically claims one queued row for supervisor workers (`SKIP LOCKED` for multi-consumer safety).
 */
async function claimNextPendingTask({
  projectKey,
  assignedAgent = "bossmind-supervisor-worker",
} = {}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `WITH c AS (
      SELECT id FROM task_state
      WHERE project_key = $1 AND status IN ('pending', 'queued')
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE task_state AS t SET
      status = 'in_progress',
      assigned_agent = $2,
      updated_at = NOW()
    FROM c WHERE t.id = c.id
    RETURNING t.id, t.task_key, t.status, t.assigned_agent, t.payload, t.created_at`,
    [projectKey, assignedAgent]
  );
  if (!rows?.length) return null;
  const row = rows[0];
  let payload = row.payload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }
  return { ...row, payload: payload || {} };
}

async function listLatestRollbackSnapshots({ projectKey, limit = 40, pathLike = "%" }) {
  const sql = getSqlClient();
  if (!sql) return [];
  const rows = await sql(
    `SELECT id, file_path, snapshot_hash, reason, LENGTH(snapshot_body) AS snapshot_bytes, created_at
     FROM rollback_snapshots
     WHERE project_key = $1 AND file_path LIKE $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [projectKey, pathLike, limit]
  );
  return rows || [];
}

async function getRollbackSnapshotById({ projectKey, snapshotId }) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `SELECT id, file_path, snapshot_body, snapshot_hash, reason, created_at
     FROM rollback_snapshots
     WHERE project_key = $1 AND id = $2`,
    [projectKey, snapshotId]
  );
  return rows?.length ? rows[0] : null;
}

async function listKnownErrors({ projectKey, limit = 50 }) {
  const sql = getSqlClient();
  if (!sql) return [];
  const rows = await sql(
    `SELECT * FROM error_memory
     WHERE project_key = $1
     ORDER BY last_seen_at DESC
     LIMIT $2`,
    [projectKey, limit]
  );
  return rows;
}

module.exports = {
  getSqlClient,
  initializeSharedMemory,
  listKnownErrors,
  getRollbackSnapshotById,
  listLatestRollbackSnapshots,
  listRecentEvents,
  listRecentTaskStates,
  claimNextPendingTask,
  saveDeploymentHistory,
  saveEvent,
  saveMissingUpdate,
  saveRollbackSnapshot,
  upsertRuntimeAuthority,
  getRuntimeAuthority,
  upsertErrorMemory,
  upsertTaskState,
};
