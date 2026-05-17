/**
 * BossMind One Shared Memory — dedicated hub tables (Neon).
 * Legacy orchestration tables (task_state, event_log, error_memory) remain in neon-memory.js;
 * views bridge bossmind_* names for read compatibility.
 */
const { getSqlClient } = require("./neon-memory");

const BOSSMIND_HUB_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS bossmind_memory (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL DEFAULT '_global',
    memory_key TEXT NOT NULL,
    memory_type TEXT NOT NULL DEFAULT 'state',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    source TEXT NOT NULL DEFAULT 'bossmind_orchestrator',
    writer_agent TEXT,
    locked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_key, memory_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bossmind_memory_project_updated ON bossmind_memory(COALESCE(project_key, '_global'), updated_at DESC)`,

  `CREATE TABLE IF NOT EXISTS bossmind_safety_rules (
    id BIGSERIAL PRIMARY KEY,
    rule_id TEXT NOT NULL UNIQUE,
    rule_text TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'block',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS bossmind_marketing_rules (
    id BIGSERIAL PRIMARY KEY,
    rule_id TEXT NOT NULL UNIQUE,
    rule_text TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'require',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS bossmind_project_locks (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    lock_type TEXT NOT NULL,
    lock_key TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    locked_by TEXT NOT NULL DEFAULT 'bossmind_orchestrator',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_key, lock_type, lock_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bossmind_project_locks_active ON bossmind_project_locks(project_key, active)`,

  `CREATE TABLE IF NOT EXISTS bossmind_design_snapshots (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    snapshot_key TEXT NOT NULL,
    baseline_hash TEXT,
    route_path TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    source TEXT NOT NULL DEFAULT 'bossmind_orchestrator',
    locked BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_key, snapshot_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bossmind_design_snapshots_project ON bossmind_design_snapshots(project_key, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS bossmind_deploy_verification (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'production',
    origin TEXT NOT NULL,
    route_path TEXT NOT NULL DEFAULT '/',
    ok BOOLEAN NOT NULL DEFAULT FALSE,
    percent NUMERIC,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    screenshot_path TEXT,
    commit_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bossmind_deploy_verification_project ON bossmind_deploy_verification(project_key, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS bossmind_shortcut_processes (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    process_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    step_index INT NOT NULL DEFAULT 0,
    steps_total INT NOT NULL DEFAULT 0,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bossmind_shortcut_processes_project ON bossmind_shortcut_processes(project_key, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS bossmind_brand_authority (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    authority_key TEXT NOT NULL DEFAULT 'naming',
    official_brand TEXT NOT NULL DEFAULT 'Resumora',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    locked BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_key, authority_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bossmind_brand_authority_project ON bossmind_brand_authority(project_key, updated_at DESC)`,

  `CREATE TABLE IF NOT EXISTS bossmind_visual_validation (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    origin TEXT NOT NULL,
    route_path TEXT NOT NULL DEFAULT '/pricing',
    ok BOOLEAN NOT NULL DEFAULT FALSE,
    drift_detected BOOLEAN NOT NULL DEFAULT FALSE,
    duplicate_sections BOOLEAN NOT NULL DEFAULT FALSE,
    logo_ok BOOLEAN NOT NULL DEFAULT FALSE,
    layout_hash TEXT,
    screenshot_path TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bossmind_visual_validation_project ON bossmind_visual_validation(project_key, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS bossmind_marketing_campaigns (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    campaign_key TEXT NOT NULL,
    campaign_type TEXT NOT NULL DEFAULT 'weekly',
    status TEXT NOT NULL DEFAULT 'planned',
    scheduled_at TIMESTAMPTZ,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_key, campaign_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bossmind_marketing_campaigns_project ON bossmind_marketing_campaigns(project_key, updated_at DESC)`,

  `CREATE TABLE IF NOT EXISTS bossmind_marketing_results (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    campaign_key TEXT NOT NULL,
    result_type TEXT NOT NULL DEFAULT 'cycle',
    ok BOOLEAN NOT NULL DEFAULT FALSE,
    orchestration_percent NUMERIC,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bossmind_marketing_results_project ON bossmind_marketing_results(project_key, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS bossmind_social_posts (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    post_key TEXT NOT NULL,
    platform TEXT NOT NULL,
    week_id TEXT,
    language TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    caption TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    platform_url TEXT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_key, post_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bossmind_social_posts_platform ON bossmind_social_posts(project_key, platform, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS bossmind_publish_verification (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    post_key TEXT NOT NULL,
    platform TEXT NOT NULL,
    ok BOOLEAN NOT NULL DEFAULT FALSE,
    cta_ok BOOLEAN NOT NULL DEFAULT FALSE,
    branding_ok BOOLEAN NOT NULL DEFAULT FALSE,
    screenshot_path TEXT,
    platform_url TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bossmind_publish_verification_project ON bossmind_publish_verification(project_key, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS bossmind_engagement_analytics (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    platform TEXT NOT NULL,
    metric_window TEXT NOT NULL DEFAULT '7d',
    impressions BIGINT DEFAULT 0,
    clicks BIGINT DEFAULT 0,
    shares BIGINT DEFAULT 0,
    saves BIGINT DEFAULT 0,
    comments BIGINT DEFAULT 0,
    engagement_rate NUMERIC,
    ctr NUMERIC,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bossmind_engagement_analytics_project ON bossmind_engagement_analytics(project_key, platform, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS bossmind_marketing_templates (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    template_key TEXT NOT NULL,
    template_type TEXT NOT NULL DEFAULT 'caption',
    version INT NOT NULL DEFAULT 1,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    locked BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_key, template_key)
  )`,

  `CREATE TABLE IF NOT EXISTS bossmind_campaign_performance (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    campaign_key TEXT NOT NULL,
    platform TEXT NOT NULL,
    score NUMERIC NOT NULL DEFAULT 0,
    winner BOOLEAN NOT NULL DEFAULT FALSE,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bossmind_campaign_performance_campaign ON bossmind_campaign_performance(project_key, campaign_key)`,

  `CREATE TABLE IF NOT EXISTS bossmind_marketing_errors (
    id BIGSERIAL PRIMARY KEY,
    project_key TEXT NOT NULL,
    error_type TEXT NOT NULL,
    error_message TEXT NOT NULL,
    platform TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bossmind_marketing_errors_project ON bossmind_marketing_errors(project_key, resolved, created_at DESC)`,
];

const BOSSMIND_HUB_VIEWS_SQL = [
  `CREATE OR REPLACE VIEW bossmind_task_state AS SELECT * FROM task_state`,
  `CREATE OR REPLACE VIEW bossmind_event_log AS SELECT * FROM event_log`,
  `CREATE OR REPLACE VIEW bossmind_error_memory AS SELECT * FROM error_memory`,
  `CREATE OR REPLACE VIEW bossmind_runtime_authority AS SELECT * FROM runtime_authority`,
];

let hubInitPromise = null;

async function initializeBossmindHubMemory() {
  const sql = getSqlClient();
  if (!sql) return { enabled: false, reason: "NEON_DATABASE_URL is missing" };
  for (const statement of BOSSMIND_HUB_TABLES_SQL) {
    await sql(statement);
  }
  for (const statement of BOSSMIND_HUB_VIEWS_SQL) {
    await sql(statement);
  }
  return { enabled: true, tables: BOSSMIND_HUB_TABLES_SQL.length, views: BOSSMIND_HUB_VIEWS_SQL.length };
}

async function ensureBossmindHubMemoryInitialized() {
  if (!getSqlClient()) return { enabled: false, reason: "NEON_DATABASE_URL is missing" };
  if (!hubInitPromise) {
    hubInitPromise = initializeBossmindHubMemory().catch((e) => {
      hubInitPromise = null;
      throw e;
    });
  }
  return hubInitPromise;
}

function normalizeProjectKey(projectKey) {
  return projectKey && String(projectKey).trim() ? String(projectKey).trim() : "_global";
}

async function upsertBossmindMemory({
  projectKey = null,
  memoryKey,
  memoryType = "state",
  payload = {},
  source = "bossmind_orchestrator",
  writerAgent = "orchestrator",
  locked = false,
}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const pk = normalizeProjectKey(projectKey);
  const rows = await sql(
    `INSERT INTO bossmind_memory (project_key, memory_key, memory_type, payload, source, writer_agent, locked, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NOW())
     ON CONFLICT (project_key, memory_key)
     DO UPDATE SET memory_type = EXCLUDED.memory_type, payload = EXCLUDED.payload,
       source = EXCLUDED.source, writer_agent = EXCLUDED.writer_agent,
       locked = EXCLUDED.locked, updated_at = NOW()
     RETURNING id, memory_key, updated_at`,
    [pk, memoryKey, memoryType, payload, source, writerAgent, locked]
  );
  return rows?.[0] || null;
}

async function getBossmindMemory({ projectKey = null, memoryKey }) {
  const sql = getSqlClient();
  if (!sql) return null;
  const pk = normalizeProjectKey(projectKey);
  const rows = await sql(
    `SELECT * FROM bossmind_memory WHERE project_key = $1 AND memory_key = $2 LIMIT 1`,
    [pk, memoryKey]
  );
  return rows?.[0] || null;
}

async function listBossmindMemory({ projectKey = null, limit = 50 } = {}) {
  const sql = getSqlClient();
  if (!sql) return [];
  const pk = normalizeProjectKey(projectKey);
  const rows = await sql(
    `SELECT memory_key, memory_type, payload, source, writer_agent, locked, updated_at
     FROM bossmind_memory
     WHERE project_key = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [pk, limit]
  );
  return rows || [];
}

async function upsertSafetyRule({ ruleId, ruleText, severity = "block", active = true, payload = {} }) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `INSERT INTO bossmind_safety_rules (rule_id, rule_text, severity, active, payload, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
     ON CONFLICT (rule_id) DO UPDATE SET rule_text = EXCLUDED.rule_text, severity = EXCLUDED.severity,
       active = EXCLUDED.active, payload = EXCLUDED.payload, updated_at = NOW()
     RETURNING rule_id`,
    [ruleId, ruleText, severity, active, payload]
  );
  return rows?.[0] || null;
}

async function upsertMarketingRule({ ruleId, ruleText, severity = "require", active = true, payload = {} }) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `INSERT INTO bossmind_marketing_rules (rule_id, rule_text, severity, active, payload, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
     ON CONFLICT (rule_id) DO UPDATE SET rule_text = EXCLUDED.rule_text, severity = EXCLUDED.severity,
       active = EXCLUDED.active, payload = EXCLUDED.payload, updated_at = NOW()
     RETURNING rule_id`,
    [ruleId, ruleText, severity, active, payload]
  );
  return rows?.[0] || null;
}

async function listSafetyRules({ activeOnly = true } = {}) {
  const sql = getSqlClient();
  if (!sql) return [];
  const rows = await sql(
    `SELECT rule_id, rule_text, severity, active, payload, updated_at FROM bossmind_safety_rules
     ${activeOnly ? "WHERE active = TRUE" : ""}
     ORDER BY rule_id`,
    []
  );
  return rows || [];
}

async function listMarketingRules({ activeOnly = true } = {}) {
  const sql = getSqlClient();
  if (!sql) return [];
  const rows = await sql(
    `SELECT rule_id, rule_text, severity, active, payload, updated_at FROM bossmind_marketing_rules
     ${activeOnly ? "WHERE active = TRUE" : ""}
     ORDER BY rule_id`,
    []
  );
  return rows || [];
}

async function upsertProjectLock({
  projectKey,
  lockType,
  lockKey,
  payload = {},
  lockedBy = "bossmind_orchestrator",
  active = true,
}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `INSERT INTO bossmind_project_locks (project_key, lock_type, lock_key, payload, locked_by, active, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW())
     ON CONFLICT (project_key, lock_type, lock_key)
     DO UPDATE SET payload = EXCLUDED.payload, locked_by = EXCLUDED.locked_by,
       active = EXCLUDED.active, updated_at = NOW()
     RETURNING id, lock_key`,
    [projectKey, lockType, lockKey, payload, lockedBy, active]
  );
  return rows?.[0] || null;
}

async function listProjectLocks({ projectKey, activeOnly = true } = {}) {
  const sql = getSqlClient();
  if (!sql) return [];
  const rows = await sql(
    `SELECT lock_type, lock_key, payload, locked_by, active, updated_at
     FROM bossmind_project_locks
     WHERE project_key = $1 ${activeOnly ? "AND active = TRUE" : ""}
     ORDER BY updated_at DESC`,
    [projectKey]
  );
  return rows || [];
}

async function saveDesignSnapshot({
  projectKey,
  snapshotKey,
  baselineHash = null,
  routePath = "/",
  payload = {},
  source = "bossmind_orchestrator",
  locked = true,
}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `INSERT INTO bossmind_design_snapshots (project_key, snapshot_key, baseline_hash, route_path, payload, source, locked)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
     ON CONFLICT (project_key, snapshot_key)
     DO UPDATE SET baseline_hash = EXCLUDED.baseline_hash, route_path = EXCLUDED.route_path,
       payload = EXCLUDED.payload, source = EXCLUDED.source, locked = EXCLUDED.locked
     RETURNING id, snapshot_key, created_at`,
    [projectKey, snapshotKey, baselineHash, routePath, payload, source, locked]
  );
  return rows?.[0] || null;
}

async function getLatestDesignSnapshot({ projectKey, snapshotKey = "locked_production" }) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `SELECT * FROM bossmind_design_snapshots
     WHERE project_key = $1 AND snapshot_key = $2
     ORDER BY created_at DESC LIMIT 1`,
    [projectKey, snapshotKey]
  );
  return rows?.[0] || null;
}

async function saveDeployVerification({
  projectKey,
  environment = "production",
  origin,
  routePath = "/",
  ok = false,
  percent = null,
  payload = {},
  screenshotPath = null,
  commitHash = null,
}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `INSERT INTO bossmind_deploy_verification
     (project_key, environment, origin, route_path, ok, percent, payload, screenshot_path, commit_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
     RETURNING id, created_at`,
    [projectKey, environment, origin, routePath, ok, percent, payload, screenshotPath, commitHash]
  );
  return rows?.[0] || null;
}

async function listDeployVerifications({ projectKey, limit = 20 } = {}) {
  const sql = getSqlClient();
  if (!sql) return [];
  const rows = await sql(
    `SELECT id, origin, route_path, ok, percent, screenshot_path, commit_hash, created_at
     FROM bossmind_deploy_verification
     WHERE project_key = $1
     ORDER BY created_at DESC LIMIT $2`,
    [projectKey, limit]
  );
  return rows || [];
}

async function startShortcutProcess({ projectKey, processId, stepsTotal, payload = {} }) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `INSERT INTO bossmind_shortcut_processes
     (project_key, process_id, status, step_index, steps_total, payload, started_at, updated_at)
     VALUES ($1, $2, 'running', 0, $3, $4::jsonb, NOW(), NOW())
     RETURNING id, process_id, created_at`,
    [projectKey, processId, stepsTotal, payload]
  );
  return rows?.[0] || null;
}

async function updateShortcutProcess({
  id,
  status,
  stepIndex,
  result = {},
  errorMessage = null,
  finished = false,
}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `UPDATE bossmind_shortcut_processes
     SET status = $2, step_index = $3, result = $4::jsonb, error_message = $5,
         finished_at = CASE WHEN $6 THEN NOW() ELSE finished_at END, updated_at = NOW()
     WHERE id = $1
     RETURNING id, process_id, status, step_index`,
    [id, status, stepIndex, result, errorMessage, finished]
  );
  return rows?.[0] || null;
}

async function upsertBrandAuthority({
  projectKey,
  authorityKey = "naming",
  officialBrand = "Resumora",
  payload = {},
  locked = true,
}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `INSERT INTO bossmind_brand_authority
     (project_key, authority_key, official_brand, payload, locked, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
     ON CONFLICT (project_key, authority_key) DO UPDATE SET
       official_brand = EXCLUDED.official_brand,
       payload = EXCLUDED.payload,
       locked = EXCLUDED.locked,
       updated_at = NOW()
     RETURNING id, authority_key, official_brand, locked, updated_at`,
    [normalizeProjectKey(projectKey), authorityKey, officialBrand, payload, locked]
  );
  return rows?.[0] || null;
}

async function getBrandAuthority({ projectKey, authorityKey = "naming" } = {}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `SELECT * FROM bossmind_brand_authority WHERE project_key = $1 AND authority_key = $2 LIMIT 1`,
    [normalizeProjectKey(projectKey), authorityKey]
  );
  return rows?.[0] || null;
}

async function listRecentShortcutProcesses({ projectKey, limit = 15 } = {}) {
  const sql = getSqlClient();
  if (!sql) return [];
  const rows = await sql(
    `SELECT id, process_id, status, step_index, steps_total, error_message, created_at, finished_at
     FROM bossmind_shortcut_processes
     WHERE project_key = $1
     ORDER BY created_at DESC LIMIT $2`,
    [projectKey, limit]
  );
  return rows || [];
}

async function saveVisualValidation({
  projectKey,
  origin,
  routePath = "/pricing",
  ok = false,
  driftDetected = false,
  duplicateSections = false,
  logoOk = false,
  layoutHash = null,
  screenshotPath = null,
  payload = {},
}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `INSERT INTO bossmind_visual_validation
     (project_key, origin, route_path, ok, drift_detected, duplicate_sections, logo_ok, layout_hash, screenshot_path, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     RETURNING id, created_at`,
    [
      projectKey,
      origin,
      routePath,
      ok,
      driftDetected,
      duplicateSections,
      logoOk,
      layoutHash,
      screenshotPath,
      payload,
    ]
  );
  return rows?.[0] || null;
}

async function listVisualValidations({ projectKey, limit = 10 } = {}) {
  const sql = getSqlClient();
  if (!sql) return [];
  const rows = await sql(
    `SELECT id, origin, route_path, ok, drift_detected, duplicate_sections, logo_ok, layout_hash, screenshot_path, created_at
     FROM bossmind_visual_validation
     WHERE project_key = $1
     ORDER BY created_at DESC LIMIT $2`,
    [projectKey, limit]
  );
  return rows || [];
}

async function saveMarketingCampaign({
  projectKey,
  campaignKey,
  campaignType = "weekly",
  status = "planned",
  scheduledAt = null,
  payload = {},
}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `INSERT INTO bossmind_marketing_campaigns (project_key, campaign_key, campaign_type, status, scheduled_at, payload, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
     ON CONFLICT (project_key, campaign_key) DO UPDATE SET
       campaign_type = EXCLUDED.campaign_type, status = EXCLUDED.status,
       scheduled_at = EXCLUDED.scheduled_at, payload = EXCLUDED.payload, updated_at = NOW()
     RETURNING id, campaign_key, status`,
    [projectKey, campaignKey, campaignType, status, scheduledAt, payload]
  );
  return rows?.[0] || null;
}

async function saveMarketingResult({
  projectKey,
  campaignKey,
  resultType = "cycle",
  ok = false,
  orchestrationPercent = null,
  payload = {},
}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `INSERT INTO bossmind_marketing_results (project_key, campaign_key, result_type, ok, orchestration_percent, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
    [projectKey, campaignKey, resultType, ok, orchestrationPercent, payload]
  );
  return rows?.[0] || null;
}

async function saveSocialPost({
  projectKey,
  postKey,
  platform,
  weekId = null,
  language = "en",
  status = "draft",
  caption = null,
  payload = {},
  platformUrl = null,
  publishedAt = null,
}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `INSERT INTO bossmind_social_posts (project_key, post_key, platform, week_id, language, status, caption, payload, platform_url, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
     ON CONFLICT (project_key, post_key) DO UPDATE SET
       status = EXCLUDED.status, caption = EXCLUDED.caption, payload = EXCLUDED.payload,
       platform_url = EXCLUDED.platform_url, published_at = EXCLUDED.published_at
     RETURNING id`,
    [projectKey, postKey, platform, weekId, language, status, caption, payload, platformUrl, publishedAt]
  );
  return rows?.[0] || null;
}

async function savePublishVerification({
  projectKey,
  postKey,
  platform,
  ok = false,
  ctaOk = false,
  brandingOk = false,
  screenshotPath = null,
  platformUrl = null,
  payload = {},
}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `INSERT INTO bossmind_publish_verification (project_key, post_key, platform, ok, cta_ok, branding_ok, screenshot_path, platform_url, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) RETURNING id`,
    [projectKey, postKey, platform, ok, ctaOk, brandingOk, screenshotPath, platformUrl, payload]
  );
  return rows?.[0] || null;
}

async function saveEngagementAnalytics({
  projectKey,
  platform,
  metricWindow = "7d",
  metrics = {},
}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `INSERT INTO bossmind_engagement_analytics
     (project_key, platform, metric_window, impressions, clicks, shares, saves, comments, engagement_rate, ctr, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb) RETURNING id`,
    [
      projectKey,
      platform,
      metricWindow,
      metrics.impressions ?? 0,
      metrics.clicks ?? 0,
      metrics.shares ?? 0,
      metrics.saves ?? 0,
      metrics.comments ?? 0,
      metrics.engagementRate ?? null,
      metrics.ctr ?? null,
      metrics,
    ]
  );
  return rows?.[0] || null;
}

async function saveCampaignPerformance({
  projectKey,
  campaignKey,
  platform,
  score = 0,
  winner = false,
  payload = {},
}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `INSERT INTO bossmind_campaign_performance (project_key, campaign_key, platform, score, winner, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
    [projectKey, campaignKey, platform, score, winner, payload]
  );
  return rows?.[0] || null;
}

async function saveMarketingError({
  projectKey,
  errorType,
  errorMessage,
  platform = null,
  payload = {},
}) {
  const sql = getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `INSERT INTO bossmind_marketing_errors (project_key, error_type, error_message, platform, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
    [projectKey, errorType, errorMessage, platform, payload]
  );
  return rows?.[0] || null;
}

async function listRecentMarketingCampaigns({ projectKey, limit = 12 } = {}) {
  const sql = getSqlClient();
  if (!sql) return [];
  const rows = await sql(
    `SELECT campaign_key, campaign_type, status, scheduled_at, payload, updated_at
     FROM bossmind_marketing_campaigns WHERE project_key = $1 ORDER BY updated_at DESC LIMIT $2`,
    [projectKey, limit]
  );
  return rows || [];
}

async function listRecentSocialPosts({ projectKey, limit = 20 } = {}) {
  const sql = getSqlClient();
  if (!sql) return [];
  const rows = await sql(
    `SELECT post_key, platform, week_id, language, status, platform_url, published_at, created_at
     FROM bossmind_social_posts WHERE project_key = $1 ORDER BY created_at DESC LIMIT $2`,
    [projectKey, limit]
  );
  return rows || [];
}

async function hubTablePresence() {
  const sql = getSqlClient();
  if (!sql) return { enabled: false, tables: {} };
  const names = [
    "bossmind_memory",
    "bossmind_safety_rules",
    "bossmind_marketing_rules",
    "bossmind_project_locks",
    "bossmind_design_snapshots",
    "bossmind_deploy_verification",
    "bossmind_shortcut_processes",
    "bossmind_visual_validation",
    "bossmind_runtime_authority",
    "bossmind_task_state",
    "bossmind_event_log",
    "bossmind_error_memory",
    "bossmind_marketing_campaigns",
    "bossmind_marketing_results",
    "bossmind_social_posts",
    "bossmind_publish_verification",
    "bossmind_engagement_analytics",
    "bossmind_marketing_templates",
    "bossmind_campaign_performance",
    "bossmind_marketing_errors",
    "bossmind_brand_authority",
  ];
  const tables = {};
  for (const name of names) {
    const rows = await sql(`SELECT to_regclass($1) AS reg`, [name]);
    tables[name] = Boolean(rows?.[0]?.reg);
  }
  return { enabled: true, tables };
}

module.exports = {
  BOSSMIND_HUB_TABLES_SQL,
  BOSSMIND_HUB_VIEWS_SQL,
  initializeBossmindHubMemory,
  ensureBossmindHubMemoryInitialized,
  upsertBossmindMemory,
  getBossmindMemory,
  listBossmindMemory,
  upsertSafetyRule,
  upsertMarketingRule,
  listSafetyRules,
  listMarketingRules,
  upsertProjectLock,
  listProjectLocks,
  saveDesignSnapshot,
  getLatestDesignSnapshot,
  saveDeployVerification,
  listDeployVerifications,
  upsertBrandAuthority,
  getBrandAuthority,
  startShortcutProcess,
  updateShortcutProcess,
  listRecentShortcutProcesses,
  saveVisualValidation,
  listVisualValidations,
  saveMarketingCampaign,
  saveMarketingResult,
  saveSocialPost,
  savePublishVerification,
  saveEngagementAnalytics,
  saveCampaignPerformance,
  saveMarketingError,
  listRecentMarketingCampaigns,
  listRecentSocialPosts,
  hubTablePresence,
};
