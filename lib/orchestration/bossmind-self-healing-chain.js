/**
 * Self-healing chain status + guarded execution (no unsupervised git push unless explicitly enabled).
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const CHAIN_STATE_DIR = ".bossmind/self-healing-chain";

function stageConfigured(stage) {
  const map = {
    sentry_ingest: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
    deepseek_analysis: Boolean(process.env.DEEPSEEK_API_KEY),
    langgraph_orchestration: true,
    repair_generation: Boolean(process.env.BOSSMIND_ORCHESTRATION_SECRET),
    powershell_execution: process.platform === "win32",
    github_commit_push: Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN),
    railway_render_deploy: Boolean(
      process.env.RAILWAY_TOKEN || process.env.RENDER_API_KEY || process.env.BOSSMIND_ULTRA_REDEPLOY_HOOK_URL
    ),
    live_verification: Boolean(process.env.BOSSMIND_REALITY_LIVE_URL || process.env.NEXT_PUBLIC_SITE_URL),
    screenshot_validation: Boolean(process.env.BOSSMIND_SCREENSHOT_HOOK_URL),
    memory_save: Boolean(process.env.NEON_DATABASE_URL),
    error_memory_learning: Boolean(process.env.NEON_DATABASE_URL),
    snapshot_lock: true,
  };
  return Boolean(map[stage]);
}

function readLastRun(cwd) {
  const p = path.join(cwd, CHAIN_STATE_DIR, "last-run.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

function writeLastRun(cwd, payload) {
  const dir = path.join(cwd, CHAIN_STATE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "last-run.json"), JSON.stringify(payload, null, 2), "utf8");
}

function assessSelfHealingChain({ cwd = process.cwd(), stages = [] } = {}) {
  const stageStatus = stages.map((id) => ({
    id,
    configured: stageConfigured(id),
  }));
  const configuredCount = stageStatus.filter((s) => s.configured).length;
  const lastRun = readLastRun(cwd);
  const checks = [
    { id: "sentry_configured", pass: stageConfigured("sentry_ingest") },
    { id: "neon_memory_save", pass: stageConfigured("memory_save") },
    { id: "live_verification_url", pass: stageConfigured("live_verification") },
    { id: "langgraph_available", pass: stageConfigured("langgraph_orchestration") },
    {
      id: "last_run_completed",
      pass: lastRun?.ok === true && Date.now() - new Date(lastRun.completedAt).getTime() < 7 * 86400000,
    },
    { id: "majority_stages_configured", pass: configuredCount / Math.max(stages.length, 1) >= 0.6 },
  ];
  const earned = checks.filter((c) => c.pass).length;
  const percent = Math.round((earned / checks.length) * 1000) / 10;
  return { percent, checks, stageStatus, configuredCount, lastRun };
}

function runSelfHealingChainStep(cwd, step, extraEnv = {}) {
  const scripts = {
    live_verification: ["scripts/resumora-pricing-ui-verify.mjs", []],
    memory_save: ["scripts/bossmind-runtime-sync.mjs", ["--once"]],
    snapshot_lock: ["scripts/bossmind-ultra-antileak.mjs", ["--snapshot", "--lock"]],
    langgraph_orchestration: ["scripts/bossmind-supervisor-worker.mjs", []],
  };
  const spec = scripts[step];
  if (!spec) return { ok: false, skipped: true, reason: "no_script_mapping" };
  const res = spawnSync(process.execPath, [path.join(cwd, spec[0]), ...spec[1]], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    stdio: "pipe",
  });
  return { ok: (res.status ?? 1) === 0, code: res.status, stdout: (res.stdout || "").slice(0, 2000) };
}

async function executeSelfHealingChain({
  cwd = process.cwd(),
  stages = [],
  allowGitPush = false,
  dryRun = false,
} = {}) {
  const results = [];
  const safeSteps = ["live_verification", "memory_save", "snapshot_lock", "langgraph_orchestration"];
  for (const stage of stages) {
    if (stage === "github_commit_push" && !allowGitPush) {
      results.push({ stage, ok: false, skipped: true, reason: "git_push_requires_BOSSMIND_CHAIN_ALLOW_GIT_PUSH=1" });
      continue;
    }
    if (!safeSteps.includes(stage) && stage !== "github_commit_push") {
      results.push({ stage, ok: stageConfigured(stage), skipped: true, reason: "status_only" });
      continue;
    }
    if (dryRun) {
      results.push({ stage, ok: stageConfigured(stage), dryRun: true });
      continue;
    }
    results.push({ stage, ...runSelfHealingChainStep(cwd, stage) });
  }
  const ok = results.filter((r) => r.ok).length >= Math.ceil(results.length * 0.5);
  const payload = { ok, completedAt: new Date().toISOString(), results };
  writeLastRun(cwd, payload);
  return payload;
}

module.exports = {
  assessSelfHealingChain,
  executeSelfHealingChain,
  stageConfigured,
  readLastRun,
};
