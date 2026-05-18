const crypto = require("crypto");
const { neon } = require("@neondatabase/serverless");
const { resolveDatabaseUrl, syncDatabaseEnvAliases } = require("./database-url");
const { withDatabaseRetry } = require("./database-resilience");

syncDatabaseEnvAliases();

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
  `CREATE TABLE IF NOT EXISTS deployment_repair_log (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    task_key TEXT,
    phase TEXT NOT NULL,
    status TEXT NOT NULL,
    error_fingerprint TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_deployment_repair_log_project_created ON deployment_repair_log(project_key, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_deployment_repair_log_fp_created ON deployment_repair_log(error_fingerprint, created_at DESC)`,
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
  `CREATE TABLE IF NOT EXISTS last_confirmed_checkpoint (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    checkpoint_key TEXT NOT NULL,
    commit_hash TEXT,
    baseline_hash TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    source TEXT NOT NULL DEFAULT 'bossmind-autonomous-runtime',
    locked BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_key, checkpoint_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_last_confirmed_checkpoint_project_updated ON last_confirmed_checkpoint(project_key, updated_at DESC)`,
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
  `CREATE TABLE IF NOT EXISTS client_entitlements (
    id BIGSERIAL PRIMARY KEY,
    profile_id UUID REFERENCES engagement_profiles(id) ON DELETE SET NULL,
    customer_email TEXT,
    plan_id TEXT NOT NULL,
    stripe_session_id TEXT,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_client_entitlements_profile_plan
    ON client_entitlements (profile_id, plan_id) WHERE profile_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_client_entitlements_email_plan
    ON client_entitlements (LOWER(customer_email), plan_id) WHERE profile_id IS NULL AND customer_email IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_client_entitlements_email ON client_entitlements(LOWER(customer_email))`,
  `CREATE TABLE IF NOT EXISTS client_prep_progress (
    id BIGSERIAL PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES engagement_profiles(id) ON DELETE CASCADE,
    asset_key TEXT NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (profile_id, asset_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_client_prep_progress_profile ON client_prep_progress(profile_id)`,
  `CREATE TABLE IF NOT EXISTS engagement_password_resets (
    id BIGSERIAL PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES engagement_profiles(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    channel TEXT NOT NULL,
    destination TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    verified_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    delivery_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_engagement_password_resets_profile ON engagement_password_resets(profile_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_engagement_password_resets_expires ON engagement_password_resets(expires_at)`,
  `CREATE TABLE IF NOT EXISTS engagement_password_reset_rate (
    id BIGSERIAL PRIMARY KEY,
    bucket_key TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 1,
    UNIQUE (bucket_key, window_start)
  )`,
];

/** Auth, entitlements, prep progress, password reset, and checkout — isolated from legacy BossMind DDL drift. */
const ENGAGEMENT_SCHEMA_SQL = REQUIRED_TABLES_SQL.slice(
  REQUIRED_TABLES_SQL.findIndex((s) => s.includes("engagement_profiles")),
  REQUIRED_TABLES_SQL.findIndex((s) => s.includes("engagement_password_reset_rate")) + 1
);

const BOSSMIND_EXTENDED_SCHEMA_SQL = [
  /* --- BossMind AI Video Generator (separate project_key from Resumora; workers/n8n use same Neon) --- */
  `CREATE TABLE IF NOT EXISTS video_queue (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL DEFAULT 'ai-video-generator',
    priority INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    source TEXT NOT NULL DEFAULT 'dashboard',
    external_ref TEXT,
    title TEXT,
    auto_publish BOOLEAN NOT NULL DEFAULT FALSE,
    target_platforms TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    language TEXT NOT NULL DEFAULT 'en',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_video_queue_project_status ON video_queue(project_key, status, priority DESC, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS video_scripts (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL DEFAULT 'ai-video-generator',
    queue_id BIGINT NOT NULL REFERENCES video_queue(id) ON DELETE CASCADE,
    raw_text TEXT NOT NULL DEFAULT '',
    reviewed_text TEXT,
    review_status TEXT NOT NULL DEFAULT 'pending',
    reviewer_notes TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_video_scripts_queue ON video_scripts(queue_id)`,

  `CREATE TABLE IF NOT EXISTS video_scenarios (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL DEFAULT 'ai-video-generator',
    script_id BIGINT NOT NULL REFERENCES video_scripts(id) ON DELETE CASCADE,
    structured JSONB NOT NULL DEFAULT '{}'::jsonb,
    model_used TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_video_scenarios_script ON video_scenarios(script_id)`,

  `CREATE TABLE IF NOT EXISTS video_scenes (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL DEFAULT 'ai-video-generator',
    scenario_id BIGINT NOT NULL REFERENCES video_scenarios(id) ON DELETE CASCADE,
    scene_index INT NOT NULL,
    prompt TEXT,
    duration_sec NUMERIC,
    provider TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (scenario_id, scene_index)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_video_scenes_scenario ON video_scenes(scenario_id, scene_index)`,

  `CREATE TABLE IF NOT EXISTS video_assets (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL DEFAULT 'ai-video-generator',
    scene_id BIGINT REFERENCES video_scenes(id) ON DELETE SET NULL,
    asset_type TEXT NOT NULL,
    storage_uri TEXT,
    mime TEXT,
    byte_size BIGINT,
    checksum TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_video_assets_scene ON video_assets(scene_id)`,

  `CREATE TABLE IF NOT EXISTS video_renders (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL DEFAULT 'ai-video-generator',
    scenario_id BIGINT NOT NULL REFERENCES video_scenarios(id) ON DELETE CASCADE,
    output_asset_id BIGINT REFERENCES video_assets(id) ON DELETE SET NULL,
    ffmpeg_profile TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    progress_pct INT NOT NULL DEFAULT 0,
    log_tail TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_video_renders_scenario ON video_renders(scenario_id)`,

  `CREATE TABLE IF NOT EXISTS video_publish_logs (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL DEFAULT 'ai-video-generator',
    render_id BIGINT NOT NULL REFERENCES video_renders(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    published_url TEXT,
    error TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_video_publish_render ON video_publish_logs(render_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_video_publish_render_platform_live ON video_publish_logs (render_id, platform) WHERE published_url IS NOT NULL AND status = 'published'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_video_publish_render_platform_uploading ON video_publish_logs (render_id, platform) WHERE status = 'uploading'`,

  `CREATE TABLE IF NOT EXISTS video_error_logs (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL DEFAULT 'ai-video-generator',
    queue_id BIGINT REFERENCES video_queue(id) ON DELETE SET NULL,
    step TEXT NOT NULL,
    fingerprint TEXT,
    message TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_video_error_project_created ON video_error_logs(project_key, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS video_performance (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL DEFAULT 'ai-video-generator',
    publish_log_id BIGINT NOT NULL REFERENCES video_publish_logs(id) ON DELETE CASCADE,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    views BIGINT NOT NULL DEFAULT 0,
    likes BIGINT NOT NULL DEFAULT 0,
    comments BIGINT NOT NULL DEFAULT 0,
    ctr NUMERIC,
    raw JSONB NOT NULL DEFAULT '{}'::jsonb
  )`,
  `CREATE INDEX IF NOT EXISTS idx_video_performance_pub ON video_performance(publish_log_id, captured_at DESC)`,

  `CREATE TABLE IF NOT EXISTS api_usage_logs (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL DEFAULT 'ai-video-generator',
    provider TEXT NOT NULL,
    operation TEXT,
    unit_type TEXT,
    units NUMERIC,
    cost_usd NUMERIC,
    external_id TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_api_usage_project_created ON api_usage_logs(project_key, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS automation_memory (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL DEFAULT 'ai-video-generator',
    memory_key TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_key, memory_key)
  )`,
];

const FULL_SCHEMA_SQL = [...REQUIRED_TABLES_SQL, ...BOSSMIND_EXTENDED_SCHEMA_SQL];

function getSqlClient() {
  const { url } = resolveDatabaseUrl();
  if (!url) {
    return null;
  }
  const client = neon(url);
  /** Supports tagged templates and legacy sql(text, params) used across engagement + BossMind memory. */
  const sql = (text, params, ...rest) => {
    if (text && typeof text === "object" && "raw" in text) {
      return client(text, params, ...rest);
    }
    if (typeof text === "string") {
      if (params === undefined) return client.query(text);
      return client.query(text, params);
    }
    return client(text, params, ...rest);
  };
  sql.query = client.query.bind(client);
  return sql;
}

function getDatabaseConfigStatus() {
  const resolved = resolveDatabaseUrl();
  return {
    configured: Boolean(resolved.url),
    source: resolved.source,
    checkedKeys: [
      "NEON_DATABASE_URL",
      "DATABASE_URL",
      "POSTGRES_URL",
      "POSTGRES_PRISMA_URL",
      "SUPABASE_DATABASE_URL",
    ],
  };
}

async function probeDatabaseConnection() {
  const status = getDatabaseConfigStatus();
  if (!status.configured) {
    return { ok: false, ...status, reason: "no_database_url" };
  }
  try {
    return await withDatabaseRetry(async () => {
      const init = await ensureEngagementSchema();
      if (!init.enabled) {
        return { ok: false, ...status, reason: init.reason || "schema_init_failed" };
      }
      const sql = getSqlClient();
      if (!sql) {
        return { ok: false, ...status, reason: "sql_client_unavailable" };
      }
      const rows = await sql.query("SELECT 1 AS ok");
      return { ok: Boolean(rows?.[0]?.ok === 1), ...status, reason: null };
    });
  } catch (e) {
    return { ok: false, ...status, reason: e.message || "connection_failed" };
  }
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function runSchemaStatements(sql, statements, { continueOnError = false } = {}) {
  const warnings = [];
  for (const statement of statements) {
    try {
      await sql(statement);
    } catch (e) {
      if (!continueOnError) throw e;
      warnings.push({ excerpt: statement.slice(0, 72), message: e.message || String(e) });
    }
  }
  return warnings;
}

let engagementSchemaInitPromise = null;
const ENGAGEMENT_SCHEMA_VERSION = 2;
let engagementSchemaVersionApplied = 0;
async function ensureEngagementSchema() {
  const sql = getSqlClient();
  if (!sql) {
    return { enabled: false, reason: "database_url_missing" };
  }
  if (!engagementSchemaInitPromise || engagementSchemaVersionApplied < ENGAGEMENT_SCHEMA_VERSION) {
    engagementSchemaInitPromise = runSchemaStatements(sql, ENGAGEMENT_SCHEMA_SQL)
      .then(() => {
        engagementSchemaVersionApplied = ENGAGEMENT_SCHEMA_VERSION;
        return { enabled: true };
      })
      .catch((e) => {
        engagementSchemaInitPromise = null;
        return { enabled: false, reason: e.message || "engagement_schema_failed" };
      });
  }
  return engagementSchemaInitPromise;
}

async function initializeSharedMemory() {
  const sql = getSqlClient();
  if (!sql) {
    return { enabled: false, reason: "database_url_missing" };
  }

  const warnings = await runSchemaStatements(sql, FULL_SCHEMA_SQL, { continueOnError: true });
  let hub = { enabled: false };
  try {
    const { initializeBossmindHubMemory } = require("./bossmind-hub-memory");
    hub = await initializeBossmindHubMemory();
  } catch (e) {
    hub = { enabled: false, reason: e.message };
  }
  return { enabled: true, hub, warnings };
}

/** Single-flight schema ensure for API routes (serverless / dev without server.js bootstrap). */
let sharedMemoryInitPromise = null;
async function ensureSharedMemoryInitialized() {
  if (!getSqlClient()) {
    return { enabled: false, reason: "database_url_missing" };
  }
  if (!sharedMemoryInitPromise) {
    sharedMemoryInitPromise = initializeSharedMemory().catch((e) => {
      sharedMemoryInitPromise = null;
      throw e;
    });
  }
  return sharedMemoryInitPromise;
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

async function upsertLastConfirmedCheckpoint({
  projectKey,
  checkpointKey = "global_continuity",
  commitHash = "",
  baselineHash = "",
  payload = {},
  source = "bossmind-autonomous-runtime",
  locked = true,
}) {
  const sql = getSqlClient();
  if (!sql) return;
  await sql(
    `INSERT INTO last_confirmed_checkpoint (
      project_key, checkpoint_key, commit_hash, baseline_hash, payload, source, locked
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7
    )
    ON CONFLICT (project_key, checkpoint_key) DO UPDATE SET
      commit_hash = EXCLUDED.commit_hash,
      baseline_hash = EXCLUDED.baseline_hash,
      payload = EXCLUDED.payload,
      source = EXCLUDED.source,
      locked = EXCLUDED.locked,
      updated_at = NOW()`,
    [projectKey, checkpointKey, commitHash, baselineHash, payload, source, locked]
  );
}

async function getLastConfirmedCheckpoint({
  projectKey,
  checkpointKey = "global_continuity",
} = {}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `SELECT id, project_key, checkpoint_key, commit_hash, baseline_hash, payload, source, locked, created_at, updated_at
     FROM last_confirmed_checkpoint
     WHERE project_key = $1 AND checkpoint_key = $2
     ORDER BY updated_at DESC
     LIMIT 1`,
    [projectKey, checkpointKey]
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

async function saveDeploymentRepairLog({
  projectKey,
  taskKey = "",
  phase,
  status,
  errorFingerprint = "",
  payload = {},
}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `INSERT INTO deployment_repair_log (project_key, task_key, phase, status, error_fingerprint, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, created_at`,
    [projectKey, taskKey || null, phase, status, errorFingerprint || null, payload]
  );
  return rows?.[0] || null;
}

async function listRecentDeploymentRepairLogs({ projectKey, limit = 30 }) {
  const sql = getSqlClient();
  if (!sql) return [];
  const rows = await sql(
    `SELECT id, task_key, phase, status, error_fingerprint, payload, created_at
     FROM deployment_repair_log
     WHERE project_key = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [projectKey, limit]
  );
  return rows || [];
}

async function countDeploymentRepairLogsSince({ projectKey, errorFingerprint, hours = 24 }) {
  const sql = getSqlClient();
  if (!sql || !errorFingerprint) return 0;
  const rows = await sql(
    `SELECT COUNT(*)::int AS c FROM deployment_repair_log
     WHERE project_key = $1 AND error_fingerprint = $2
       AND created_at > NOW() - ($3 * INTERVAL '1 hour')`,
    [projectKey, errorFingerprint, hours]
  );
  return rows?.[0]?.c ?? 0;
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

/**
 * Atomically claim a one-time auto-reply slot per inbound Message-Id (loop / duplicate prevention for n8n).
 * First caller gets { claimed: true }; replays get { claimed: false, duplicate: true }.
 */
async function tryClaimSupportMailSend({
  projectKey,
  messageId,
  threadId = "",
  meta = {},
} = {}) {
  const sql = getSqlClient();
  if (!sql) return { ok: false, reason: "no_sql", claimed: false, duplicate: false };
  const mid = String(messageId || "").trim();
  if (mid.length < 8) return { ok: false, reason: "message_id_too_short", claimed: false, duplicate: false };
  const digestKey = digest(`${projectKey}|support_outbound|${mid}`);
  const taskKey = `support_mail:outbound:${digestKey}`;
  const payload = {
    messageIdLen: mid.length,
    threadId: String(threadId || "").trim().slice(0, 500),
    ...meta,
  };
  const rows = await sql(
    `INSERT INTO task_state (project_key, task_key, status, assigned_agent, payload)
     VALUES ($1, $2, 'claimed', $3, $4::jsonb)
     ON CONFLICT (project_key, task_key) DO NOTHING
     RETURNING id`,
    [projectKey, taskKey, "support-mail-dedupe-api", payload]
  );
  const claimed = Array.isArray(rows) && rows.length > 0;
  return { ok: true, claimed, duplicate: !claimed, taskKey };
}

module.exports = {
  getSqlClient,
  getDatabaseConfigStatus,
  probeDatabaseConnection,
  ensureEngagementSchema,
  initializeSharedMemory,
  ensureSharedMemoryInitialized,
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
  upsertLastConfirmedCheckpoint,
  getLastConfirmedCheckpoint,
  upsertErrorMemory,
  upsertTaskState,
  saveDeploymentRepairLog,
  listRecentDeploymentRepairLogs,
  countDeploymentRepairLogsSince,
  tryClaimSupportMailSend,
};
