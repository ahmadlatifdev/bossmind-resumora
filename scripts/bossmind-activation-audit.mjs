#!/usr/bin/env node
/**
 * BossMind activation audit — evidence-based gates only (no simulated “95%” claims).
 * Loads .env.local; checks files, env, Neon tables when URL present; optional localhost probes.
 *
 * Usage:
 *   node scripts/bossmind-activation-audit.mjs
 *   BOSSMIND_AUDIT_ORIGIN=http://127.0.0.1:3001 node scripts/bossmind-activation-audit.mjs
 *   --strict  exit 2 if automationCoveragePercent < BOSSMIND_AUDIT_MIN_COVERAGE (default 95)
 */
import fs from "fs";
import { spawnSync } from "child_process";
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import http from "http";
import https from "https";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const strict =
  process.argv.includes("--strict") || process.env.BOSSMIND_ACTIVATION_STRICT === "1";
const minCoverage = Number(process.env.BOSSMIND_AUDIT_MIN_COVERAGE || 95);

function loadEnv() {
  try {
    require(join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  } catch {
    /* ignore */
  }
}

function exists(rel) {
  return fs.existsSync(join(root, rel));
}

function gitHead() {
  const r = spawnSync("git rev-parse HEAD", { cwd: root, shell: true, encoding: "utf8" });
  return (r.stdout || "").trim() || null;
}

function fetchJson(urlString, timeoutMs = 12000) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch {
      resolve({ ok: false, error: "bad_url" });
      return;
    }
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(
      urlString,
      { method: "GET", timeout: timeoutMs, headers: { accept: "application/json", "user-agent": "BossMind-activation-audit/1.0" } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          body += c;
          if (body.length > 500_000) req.destroy();
        });
        res.on("end", () => {
          try {
            resolve({ ok: res.statusCode === 200, status: res.statusCode, json: JSON.parse(body) });
          } catch {
            resolve({ ok: res.statusCode === 200, status: res.statusCode, raw: body.slice(0, 400) });
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
    req.on("error", (e) => resolve({ ok: false, error: e.message }));
    req.end();
  });
}

function scoreGate(checks) {
  const passed = checks.filter((c) => c.ok).length;
  const total = checks.length;
  return total ? Math.round((passed / total) * 100) : 0;
}

async function main() {
  loadEnv();

  const neonMod = require(join(root, "lib/shared/neon-memory.js"));
  const { auditStripeEnv } = require(join(root, "lib/marketing/stripe-env-audit.js"));

  const stripeAudit = auditStripeEnv();
  const init = await neonMod.initializeSharedMemory();
  const sql = neonMod.getSqlClient();

  let tablesOk = { present: [], missing: [] };
  if (sql) {
    const want = [
      "task_state",
      "event_log",
      "error_memory",
      "missing_updates_log",
      "rollback_snapshots",
      "deployment_history",
      "deployment_repair_log",
    ];
    for (const t of want) {
      const rows = await sql(`SELECT to_regclass($1) AS n`, [`public.${t}`]);
      if (rows?.[0]?.n) tablesOk.present.push(t);
      else tablesOk.missing.push(t);
    }
  }

  const origin = (process.env.BOSSMIND_AUDIT_ORIGIN || "").replace(/\/$/, "");
  let healthProbe = null;
  let stripeProbe = null;
  if (origin) {
    healthProbe = await fetchJson(`${origin}/api/health`);
    stripeProbe = await fetchJson(`${origin}/api/stripe/status`);
  }

  const watchdogSession = join(root, ".bossmind", "watchdog", "session.json");
  let watchdogActive = false;
  try {
    const s = JSON.parse(fs.readFileSync(watchdogSession, "utf8"));
    const hb = s.lastHeartbeat;
    watchdogActive =
      Boolean(s.watchdogPid) &&
      (typeof hb !== "number" || Date.now() - hb < 120000);
  } catch {
    watchdogActive = false;
  }

  const categories = {
    persistentSupervisor: {
      score: scoreGate([
        { ok: exists("scripts/bossmind-supervisor-worker.mjs"), label: "supervisor_worker_script" },
        { ok: Boolean(process.env.NEON_DATABASE_URL), label: "neon_for_queue" },
        { ok: exists("pages/api/orchestration/bossmind-control.js"), label: "control_api" },
        { ok: exists("pages/api/orchestration/sentry-ingest.js"), label: "sentry_ingress" },
      ]),
      partialBecause:
        "24/7 requires a deployed Railway Worker or host process running `npm run bossmind:supervisor`; repo supplies the worker only.",
    },
    runtimeAutoRecovery: {
      score: scoreGate([
        { ok: exists("scripts/bossmind-dev-watchdog.mjs"), label: "watchdog_script" },
        { ok: exists("scripts/bossmind-runtime-recovery.mjs"), label: "recovery_cli" },
        { ok: watchdogActive, label: "watchdog_session_recent" },
        { ok: healthProbe?.ok === true, label: "localhost_health_probe", skip: !origin },
      ].filter((c) => !c.skip)),
      partialBecause:
        "Auto-restart only while `bossmind:watch:dev` runs; not OS-level unless scheduled.",
    },
    sentrySelfHealingChain: {
      score: scoreGate([
        { ok: exists("lib/orchestration/langgraph-repair-flow.js"), label: "repair_flow" },
        { ok: exists("pages/api/orchestration/sentry-ingest.js"), label: "sentry_api" },
        { ok: Boolean(process.env.BOSSMIND_ORCHESTRATION_SECRET), label: "orchestration_secret" },
        {
          ok: Boolean(process.env.NEON_DATABASE_URL),
          label: "neon_persistence",
        },
        {
          ok: Boolean(process.env.DEEPSEEK_API_KEY || process.env.OLLAMA_HOST),
          label: "reasoning_backend",
        },
      ]),
      partialBecause:
        "Cursor/Copilot execution and deployment verification are external; worker runs LangGraph repair + logs only.",
    },
    railwayClosedLoopRepair: {
      score: scoreGate([
        { ok: exists("pages/api/orchestration/railway-incident-webhook.js"), label: "railway_webhook" },
        { ok: exists("lib/orchestration/railway-closed-loop-worker.js"), label: "closed_loop_worker" },
        { ok: exists("lib/orchestration/railway-graphql.js"), label: "railway_graphql" },
        { ok: init.enabled, label: "neon" },
      ]),
      partialBecause:
        "Live repair requires `npm run bossmind:supervisor` (or Railway worker) + `RAILWAY_TOKEN` + optional `BOSSMIND_RAILWAY_AUTO_REDEPLOY`; git push stays off by default.",
    },
    langGraphOrchestration: {
      score: scoreGate([
        { ok: exists("lib/orchestration/langgraph-repair-flow.js"), label: "langgraph_flow_code" },
        { ok: init.enabled, label: "neon_init" },
      ]),
      partialBecause: "No separate long-lived LangGraph runtime process; flows run on-demand via API/worker.",
    },
    deepSeekStrategic: {
      score: scoreGate([
        { ok: Boolean(process.env.DEEPSEEK_API_KEY), label: "deepseek_api_key" },
        { ok: exists("lib/ai/repair-model.js"), label: "repair_model_router" },
      ]),
      partialBecause: "Strategic loops require DEEPSEEK_API_KEY + caller (worker/API); not a standalone daemon.",
    },
    deepSeekOperational: {
      score: scoreGate([
        { ok: exists("scripts/bossmind-self-heal.mjs"), label: "self_heal_script" },
        { ok: exists("scripts/bossmind-validation-pipeline.mjs"), label: "validation_pipeline" },
      ]),
      partialBecause:
        "Operational code execution in-repo is bounded by CI/scripts; IDE applies patches manually.",
    },
    neonSharedMemory: {
      score: scoreGate([
        { ok: init.enabled, label: "neon_url" },
        { ok: tablesOk.missing.length === 0, label: "core_tables" },
      ]),
      partialBecause:
        "Vector retrieval / automatic context injection for all agents is not implemented (no pgvector pipeline in this repo).",
    },
    autonomousAgents: {
      score: scoreGate([
        { ok: exists("scripts/bossmind-supervisor-worker.mjs"), label: "supervisor_worker" },
        { ok: init.enabled, label: "neon_coordination" },
        { ok: exists("pages/api/orchestration/bossmind-control.js"), label: "control_plane_api" },
      ]),
      partialBecause:
        "No standalone Dev/QA/Security OS agents — only coordinator scripts + APIs; full autonomy requires deployed worker + Neon.",
    },
    antiLeakEngine: {
      score: scoreGate([
        { ok: exists("scripts/bossmind-antileak-guard.mjs"), label: "antileak_script" },
        { ok: exists("docs/PROTECTED_COMPONENTS_REGISTRY.md"), label: "protected_registry_doc" },
      ]),
      partialBecause: "Guard runs when invoked (validate pipeline / CI); not a kernel-level UI freezer.",
    },
    snapshotRollback: {
      score: scoreGate([
        { ok: exists("scripts/bossmind-snapshot-save.mjs"), label: "snapshot_save" },
        { ok: exists("scripts/bossmind-restore-rollback.mjs"), label: "rollback_restore" },
        { ok: tablesOk.present.includes("rollback_snapshots"), label: "neon_table", skip: !sql },
      ].filter((c) => !c.skip)),
      partialBecause: "Snapshots before every AI edit require discipline (`bossmind:checkpoint`); not globally enforced.",
    },
    validationTesting: {
      score: scoreGate([
        { ok: exists("scripts/bossmind-ui-probe.mjs"), label: "ui_probe" },
        { ok: exists("scripts/bossmind-monitor-health.mjs"), label: "monitor_health" },
        { ok: exists("scripts/stripe-env-validation.js"), label: "stripe_validate" },
      ]),
      partialBecause:
        "Screenshot pixel-diff and full hydration assertions are not automated here (HTTP probes only).",
    },
    monitoringDashboard: {
      score: scoreGate([
        { ok: exists("scripts/bossmind-watchdog-report.mjs"), label: "watchdog_html" },
        { ok: exists("pages/api/orchestration/bossmind-control.js"), label: "bossmind_control_html" },
        { ok: exists("lib/orchestration/bossmind-runtime-status.js"), label: "runtime_status_module" },
      ]),
      partialBecause: "Unified Grafana-style dashboard not bundled; HTML reports + JSON APIs exist.",
    },
    performanceEngine: {
      score: scoreGate([
        { ok: exists("scripts/bossmind-performance-scan.mjs"), label: "perf_scan" },
      ]),
      partialBecause: "CPU/RAM auto-tuning of host OS is out of scope; scan is static/heuristic.",
    },
    eventDrivenAutomation: {
      score: scoreGate([
        { ok: exists("pages/api/webhooks/stripe.js"), label: "stripe_webhook" },
        {
          ok: process.env.BOSSMIND_SENTRY_ENQUEUE_ONLY === "1",
          label: "sentry_enqueue_only_configured",
        },
        { ok: Boolean(process.env.NEON_DATABASE_URL), label: "event_log_backend" },
      ]),
      partialBecause:
        "Set BOSSMIND_SENTRY_ENQUEUE_ONLY=1 + run supervisor for queued Sentry→repair; other triggers need wiring.",
    },
    productionDeploymentValidation: {
      score: scoreGate([
        {
          ok: Boolean(
            process.env.RAILWAY_ENVIRONMENT ||
              process.env.RAILWAY_ENVIRONMENT_NAME ||
              process.env.BOSSMIND_PUBLIC_ORIGIN
          ),
          label: "deploy_target_env_hint",
        },
        { ok: stripeAudit.financialPipelineReady, label: "stripe_financial_pipeline_ready" },
      ]),
      partialBecause:
        "SSL/DNS/mobile checks need BOSSMIND_PUBLIC_ORIGIN or manual Lighthouse; not run in this script.",
    },
    marketingStacks: {
      score: scoreGate([
        { ok: exists("scripts/bossmind-marketing-activation.mjs"), label: "unified_activation_script" },
        { ok: exists("scripts/marketing/weekly-organic-pipeline.js"), label: "weekly_organic_pipeline" },
        { ok: exists("scripts/marketing/run-google-organic-engine.mjs"), label: "google_organic_engine" },
        { ok: exists("scripts/marketing/run-social-growth-engine.mjs"), label: "social_growth_engine" },
        { ok: init.enabled, label: "neon_coordination_for_dedupe_and_logs" },
      ]),
      partialBecause:
        "Autopublish is opt-in (`BOSSMIND_MARKETING_AUTOPUBLISH=1`); schedule `npm run bossmind:marketing:activate` (cron) or `BOSSMIND_AUTONOMOUS_MARKETING_EVERY_CYCLES` on the autonomous worker. Engagement/Elite pricing are UI-only.",
    },
  };

  const weights = {
    persistentSupervisor: 8,
    runtimeAutoRecovery: 9,
    sentrySelfHealingChain: 10,
    langGraphOrchestration: 6,
    deepSeekStrategic: 6,
    deepSeekOperational: 5,
    neonSharedMemory: 10,
    autonomousAgents: 4,
    antiLeakEngine: 7,
    snapshotRollback: 7,
    validationTesting: 8,
    monitoringDashboard: 6,
    performanceEngine: 4,
    eventDrivenAutomation: 8,
    productionDeploymentValidation: 8,
    marketingStacks: 5,
  };

  let weightedSum = 0;
  let weightTotal = 0;
  for (const [k, w] of Object.entries(weights)) {
    weightedSum += (categories[k].score / 100) * w;
    weightTotal += w;
  }
  const automationCoveragePercent = Math.round((weightedSum / weightTotal) * 1000) / 10;

  const report = {
    ts: new Date().toISOString(),
    gitHead: gitHead(),
    automationCoveragePercent,
    weightsSum: weightTotal,
    stripe: {
      checkoutReady: stripeAudit.checkoutReady,
      financialPipelineReady: stripeAudit.financialPipelineReady,
      webhookSigningReady: stripeAudit.webhookSigningReady,
    },
    neon: {
      enabled: init.enabled,
      reason: init.reason || "",
      tables: tablesOk,
    },
    localhostProbes: origin
      ? {
          origin,
          health: healthProbe,
          stripeStatus: stripeProbe,
        }
      : { skipped: true, hint: "Set BOSSMIND_AUDIT_ORIGIN=http://127.0.0.1:3001 for live probes" },
    watchdog: {
      sessionPath: watchdogSession,
      appearsActive: watchdogActive,
    },
    categories,
    activatedSystems: Object.entries(categories)
      .filter(([, v]) => v.score >= 80)
      .map(([k, v]) => ({ id: k, score: v.score })),
    partialSystems: Object.entries(categories)
      .filter(([, v]) => v.score < 80)
      .map(([k, v]) => ({ id: k, score: v.score, because: v.partialBecause })),
    blockers: [
      !process.env.NEON_DATABASE_URL && "NEON_DATABASE_URL missing — supervisor, webhooks→memory, engagement persistence offline",
      !process.env.BOSSMIND_ORCHESTRATION_SECRET && "BOSSMIND_ORCHESTRATION_SECRET missing — secured orchestration APIs unusable",
      !stripeAudit.checkoutReady && "Stripe checkout not fully configured (keys/price IDs)",
      tablesOk.missing.length > 0 && `Neon tables missing: ${tablesOk.missing.join(", ")}`,
    ].filter(Boolean),
    honestCeilingNote:
      "95%+ autonomous operation with zero human steps is not technically achievable in-repo: Cursor deployment, SSL proof, and vector memory require external configuration and services.",
  };

  console.log(JSON.stringify(report, null, 2));

  if (strict && automationCoveragePercent < minCoverage) {
    console.error(
      `[activation-audit] strict: coverage ${automationCoveragePercent}% < ${minCoverage}%`
    );
    process.exit(2);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
