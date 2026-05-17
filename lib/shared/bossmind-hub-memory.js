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
];

const BOSSMIND_HUB_VIEWS_SQL = [
  `CREATE OR REPLACE VIEW bossmind_task_state AS SELECT * FROM task_state`,
  `CREATE OR REPLACE VIEW bossmind_event_log AS SELECT * FROM event_log`,
  `CREATE OR REPLACE VIEW bossmind_error_memory AS SELECT * FROM error_memory`,
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
    "bossmind_task_state",
    "bossmind_event_log",
    "bossmind_error_memory",
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
  startShortcutProcess,
  updateShortcutProcess,
  listRecentShortcutProcesses,
  hubTablePresence,
};
