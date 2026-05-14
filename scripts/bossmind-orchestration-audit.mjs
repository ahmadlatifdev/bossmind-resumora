#!/usr/bin/env node
import fs from "fs";
import { spawnSync } from "child_process";
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import http from "http";
import https from "https";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const neon = require("../lib/shared/neon-memory");
const { loadRolePolicy } = require("../lib/orchestration/bossmind-role-policy");

const REQUIRED_FILES = [
  "scripts/bossmind-antileak-guard.mjs",
  "scripts/bossmind-snapshot-save.mjs",
  "scripts/bossmind-restore-rollback.mjs",
  "scripts/bossmind-self-heal.mjs",
  "scripts/bossmind-dev-watchdog.mjs",
  "scripts/bossmind-monitor-health.mjs",
  "pages/api/orchestration/bossmind-control.js",
  "pages/api/orchestration/sentry-ingest.js",
  "pages/api/orchestration/railway-incident-webhook.js",
  "lib/orchestration/langgraph-repair-flow.js",
  "lib/orchestration/railway-closed-loop-worker.js",
];

const REQUIRED_TABLES = [
  "task_state",
  "event_log",
  "error_memory",
  "missing_updates_log",
  "rollback_snapshots",
  "deployment_history",
  "deployment_repair_log",
];

function exists(rel) {
  return fs.existsSync(join(root, rel));
}

function envFlags() {
  return {
    BOSSMIND_ORCHESTRATION_SECRET: Boolean(process.env.BOSSMIND_ORCHESTRATION_SECRET),
    DEEPSEEK_API_KEY: Boolean(process.env.DEEPSEEK_API_KEY),
    NEON_DATABASE_URL: Boolean(process.env.NEON_DATABASE_URL),
    STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
  };
}

function gitStatus() {
  const r = spawnSync("git status -sb", { cwd: root, shell: true, encoding: "utf8" });
  return (r.stdout || "").trim();
}

function fetchStatus(urlString, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch {
      resolve({ ok: false, status: 0, reason: "invalid_url" });
      return;
    }
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(
      urlString,
      { method: "GET", timeout: timeoutMs, headers: { "user-agent": "BossMind-audit/1.0" } },
      (res) => {
        res.resume();
        resolve({ ok: (res.statusCode || 0) < 500, status: res.statusCode || 0, reason: "" });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: 0, reason: "timeout" });
    });
    req.on("error", (e) => resolve({ ok: false, status: 0, reason: e.message }));
    req.end();
  });
}

async function checkTables() {
  const sql = neon.getSqlClient();
  if (!sql) {
    return {
      enabled: false,
      missing: [...REQUIRED_TABLES],
      present: [],
      reason: "NEON_DATABASE_URL missing",
    };
  }

  const present = [];
  const missing = [];
  for (const table of REQUIRED_TABLES) {
    const rows = await sql(
      `SELECT to_regclass($1) AS table_name`,
      [`public.${table}`]
    );
    if (rows?.[0]?.table_name) present.push(table);
    else missing.push(table);
  }
  return { enabled: true, present, missing, reason: "" };
}

async function main() {
  const policy = loadRolePolicy();
  const files = REQUIRED_FILES.map((f) => ({ file: f, exists: exists(f) }));
  const env = envFlags();
  const origin = (process.env.BOSSMIND_AUDIT_ORIGIN || "http://127.0.0.1:3001").replace(/\/$/, "");

  const init = await neon.initializeSharedMemory();
  const tableCheck = init.enabled
    ? await checkTables()
    : { enabled: false, present: [], missing: [...REQUIRED_TABLES], reason: init.reason };

  const active = {
    antiLeak: files.some((f) => f.file.endsWith("bossmind-antileak-guard.mjs") && f.exists),
    snapshot: files.some((f) => f.file.endsWith("bossmind-snapshot-save.mjs") && f.exists),
    rollbackRestore: files.some((f) => f.file.endsWith("bossmind-restore-rollback.mjs") && f.exists),
    runtimeWatchdog: files.some((f) => f.file.endsWith("bossmind-dev-watchdog.mjs") && f.exists),
    selfHeal: files.some((f) => f.file.endsWith("bossmind-self-heal.mjs") && f.exists),
    orchestrationApi: files.some((f) => f.file.endsWith("bossmind-control.js") && f.exists),
    sentryIngress: files.some((f) => f.file.endsWith("sentry-ingest.js") && f.exists),
    langGraphFlow: files.some((f) => f.file.endsWith("langgraph-repair-flow.js") && f.exists),
    codexAgentPolicy: exists("config/bossmind-codex-agent-layer.json"),
    codexStatusModule: exists("lib/orchestration/bossmind-codex-status.js"),
    deepseekConfigured: env.DEEPSEEK_API_KEY,
    sharedMemoryConfigured: env.NEON_DATABASE_URL,
  };

  const report = {
    ts: Date.now(),
    gitStatus: gitStatus(),
    policy: {
      loaded: policy.loaded,
      path: policy.path,
      reason: policy.reason,
      roleStructure: policy.policy?.enforcement || null,
    },
    env,
    runtimeEndpoints: {},
    files,
    sharedMemory: tableCheck,
    active,
    risks: [],
  };

  report.runtimeEndpoints.health = await fetchStatus(`${origin}/api/health`);
  report.runtimeEndpoints.stripe = await fetchStatus(`${origin}/api/stripe/status`);
  report.runtimeEndpoints.deepseek = await fetchStatus(`${origin}/api/ai/deepseek-status`);

  if (!policy.loaded) report.risks.push("Role policy missing or invalid.");
  if (!env.BOSSMIND_ORCHESTRATION_SECRET) report.risks.push("BOSSMIND_ORCHESTRATION_SECRET missing.");
  if (!env.NEON_DATABASE_URL) report.risks.push("NEON_DATABASE_URL missing.");
  if (!env.DEEPSEEK_API_KEY) report.risks.push("DEEPSEEK_API_KEY missing (will fallback to local model).");
  if (tableCheck.missing.length) report.risks.push(`Missing tables: ${tableCheck.missing.join(", ")}`);
  if (!report.runtimeEndpoints.health.ok) report.risks.push("Runtime health endpoint unavailable.");

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.risks.length ? 2 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
