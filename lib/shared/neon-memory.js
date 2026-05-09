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
  `CREATE TABLE IF NOT EXISTS rollback_snapshots (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    file_path TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    snapshot_body TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
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
  saveDeploymentHistory,
  saveEvent,
  saveMissingUpdate,
  saveRollbackSnapshot,
  upsertErrorMemory,
  upsertTaskState,
};
