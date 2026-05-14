#!/usr/bin/env node
/**
 * Evidence-based enterprise coverage report — maps layers to in-repo artifacts and env.
 * Does not claim external systems (Railway/Render revision APIs, GSC OAuth) are active.
 *
 *   npm run bossmind:enterprise:coverage
 *   BOSSMIND_COVERAGE_STRICT=1 — exit 1 if Neon missing or critical script missing
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function loadEnv() {
  try {
    require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  } catch {
    /* ignore */
  }
}

function runRiskJson() {
  const r = spawnSync(process.execPath, [path.join(root, "scripts/bossmind-predictive-runtime-risk.mjs")], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 512 * 1024,
  });
  try {
    return { ok: (r.status ?? 1) === 0, code: r.status ?? 1, json: JSON.parse((r.stdout || "").trim() || "{}") };
  } catch {
    return { ok: false, code: r.status ?? 1, json: null, raw: (r.stdout || "").slice(0, 200) };
  }
}

async function neonSnapshot() {
  try {
    const neon = require(path.join(root, "lib/shared/neon-memory.js"));
    const init = await neon.initializeSharedMemory();
    if (!init.enabled) return { enabled: false, reason: init.reason || "disabled" };
    const sql = neon.getSqlClient();
    if (!sql) return { enabled: false, reason: "no_sql" };
    const tables = [
      "task_state",
      "event_log",
      "error_memory",
      "missing_updates_log",
      "rollback_snapshots",
      "deployment_history",
      "deployment_repair_log",
    ];
    const present = [];
    const missing = [];
    for (const t of tables) {
      const rows = await sql(`SELECT to_regclass($1) AS n`, [`public.${t}`]);
      if (rows?.[0]?.n) present.push(t);
      else missing.push(t);
    }
    return { enabled: true, tables: { present, missing } };
  } catch (e) {
    return { enabled: false, reason: e.message || String(e) };
  }
}

const CRITICAL_SCRIPTS = [
  "scripts/bossmind-runtime-sync.mjs",
  "scripts/bossmind-enterprise-envelope.mjs",
  "scripts/bossmind-autonomous-runtime.mjs",
  "scripts/bossmind-supervisor-worker.mjs",
  "scripts/bossmind-deploy-gate.mjs",
  "scripts/bossmind-antileak-guard.mjs",
  "lib/shared/neon-memory.js",
  "lib/marketing/seo-config.js",
  "pages/sitemap.xml.js",
  "pages/robots.txt.js",
  "pages/api/marketing/trust-snapshot.js",
  "lib/orchestration/bossmind-continuous-optimization-snapshot.js",
  "scripts/bossmind-continuous-optimization-cycle.mjs",
];

async function main() {
  loadEnv();
  const strict = process.env.BOSSMIND_COVERAGE_STRICT === "1";
  const artifacts = Object.fromEntries(CRITICAL_SCRIPTS.map((rel) => [rel, exists(rel)]));
  const allArtifacts = Object.values(artifacts).every(Boolean);
  const neon = await neonSnapshot();
  const risk = runRiskJson();
  const hasNeonUrl = Boolean(process.env.NEON_DATABASE_URL);

  const blockers = [];
  if (!allArtifacts) blockers.push("missing_critical_script_or_module");
  if (strict && !hasNeonUrl) blockers.push("NEON_DATABASE_URL_missing");
  if (strict && neon.enabled && neon.tables?.missing?.length) blockers.push(`neon_tables_missing:${neon.tables.missing.join(",")}`);

  const report = {
    ts: new Date().toISOString(),
    repo: "resumora-fresh",
    strict,
    artifacts,
    allCriticalArtifactsPresent: allArtifacts,
    env: {
      NEON_DATABASE_URL: hasNeonUrl,
      BOSSMIND_ORCHESTRATION_SECRET: Boolean(process.env.BOSSMIND_ORCHESTRATION_SECRET),
      NEXT_PUBLIC_SITE_URL: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
      NEXT_PUBLIC_GA_MEASUREMENT_ID: Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID),
      NEXT_PUBLIC_GSC_VERIFICATION: Boolean(process.env.NEXT_PUBLIC_GSC_VERIFICATION),
    },
    neon,
    predictiveRisk: risk.json,
    predictiveRiskExitCode: risk.code,
    documentation: [
      "docs/BOSSMIND_ENTERPRISE_COVERAGE_MATRIX.md",
      "docs/BOSSMIND_ENTERPRISE_ENVELOPE.md",
      "docs/BOSSMIND_GOOGLE_ORGANIC_GROWTH_ARCHITECTURE.md",
    ].map((d) => ({ path: d, exists: exists(d) })),
    recommendedCommands: [
      "npm run bossmind:activation-audit",
      "npm run bossmind:stripe:production-report",
      "npm run bossmind:enterprise:envelope:dry",
      "npm run bossmind:enterprise:envelope",
      "npm run bossmind:autonomous:runtime:once",
    ],
    blockers,
    productionConfirmationNote:
      "Confirmation is evidence-based: run the recommended commands with production env and Railway/Render workers. External parity (deploy SHA vs Git) is not inferred from this report.",
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(blockers.length && strict ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
