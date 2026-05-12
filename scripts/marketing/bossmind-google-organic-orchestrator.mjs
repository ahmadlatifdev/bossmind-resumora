#!/usr/bin/env node
/**
 * BossMind Google Organic Growth orchestrator — ecosystem coordination + Neon audit trail.
 *
 * Safety (non-negotiable in this repo):
 * - Does NOT auto-write Next.js pages, sitemap routes, or protected UI.
 * - Runs only whitelisted marketing scripts per project root (spawn).
 * - Other brands run only when BOSSMIND_REPO_ROOT_<NAME> points at a checkout with the same scripts.
 *
 * Env:
 *   BOSSMIND_PROJECT_KEY (default resumora)
 *   NEON_DATABASE_URL — event_log + optional task_state sidecars
 *   BOSSMIND_ORGANIC_WEEK — optional ISO week override (passed to child scripts)
 *   BOSSMIND_ORGANIC_SKIP_WEEKLY / SKIP_GOOGLE / SKIP_SOCIAL = 1 to skip phases
 */
import path from "path";
import { spawnSync } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");

const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
const weekArg = process.env.BOSSMIND_ORGANIC_WEEK
  ? [`--week=${process.env.BOSSMIND_ORGANIC_WEEK}`]
  : [];

function loadEnv() {
  try {
    require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  } catch {
    /* ignore */
  }
}

function runAt(cwd, scriptRel, args, extraEnv = {}) {
  const cmd = process.execPath;
  const full = path.join(cwd, scriptRel);
  const res = spawnSync(cmd, [full, ...args], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, ...extraEnv },
    maxBuffer: 24 * 1024 * 1024,
  });
  return {
    ok: (res.status ?? 1) === 0,
    code: res.status ?? 1,
    stderr: (res.stderr || "").slice(-6000),
  };
}

async function logNeon(payload) {
  try {
    const neon = require(path.join(root, "lib/shared/neon-memory.js"));
    const init = await neon.initializeSharedMemory();
    if (!init.enabled) return;
    await neon.saveEvent({
      projectKey,
      eventType: "bossmind.organic_growth.orchestration",
      severity: payload.ok === false ? "warning" : "info",
      source: "bossmind-google-organic-orchestrator",
      eventKey: payload.weekKey || "orchestration",
      payload,
    });
  } catch {
    /* optional */
  }
}

async function main() {
  loadEnv();
  const { loadOrganicGrowthRegistry, listRunnableProjectRoots } = require(path.join(
    root,
    "lib/marketing/bossmind-organic-growth-registry.js"
  ));
  const registry = loadOrganicGrowthRegistry(root);
  const runnable = listRunnableProjectRoots(registry, process.env, root);

  const phases = [];
  const summary = {
    ok: true,
    registryVersion: registry.version,
    projectKey,
    runnableProjectIds: runnable.map((r) => r.id),
    deferredProjectIds: (registry.projects || [])
      .map((p) => p.id)
      .filter((id) => !runnable.some((r) => r.id === id)),
    phases,
    ts: new Date().toISOString(),
  };

  if (!runnable.length) {
    summary.ok = true;
    summary.note =
      "No project roots resolved. Set BOSSMIND_REPO_ROOT_* for satellite brands or run from Resumora repo.";
    await logNeon(summary);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  }

  const neonOn = Boolean(process.env.NEON_DATABASE_URL);
  const persistArgs = neonOn ? ["--persist-neon"] : [];

  for (const target of runnable) {
    const cwd = target.root;
    const p = target.def?.pipelines || {};

    if (p.weeklyOrganic && process.env.BOSSMIND_ORGANIC_SKIP_WEEKLY !== "1") {
      const weeklyArgs = [...weekArg, ...persistArgs];
      if (process.env.BOSSMIND_MARKETING_AI_ENRICH === "1" && process.env.DEEPSEEK_API_KEY) {
        weeklyArgs.push("--enrich-ai");
      }
      const r = runAt(cwd, "scripts/marketing/weekly-organic-pipeline.js", weeklyArgs);
      phases.push({ project: target.id, id: "weekly_organic", ok: r.ok, code: r.code });
      if (!r.ok) summary.ok = false;
    }

    if (p.googleOrganicBundle && process.env.BOSSMIND_ORGANIC_SKIP_GOOGLE !== "1") {
      const r = runAt(cwd, "scripts/marketing/run-google-organic-engine.mjs", [...weekArg, ...persistArgs]);
      phases.push({ project: target.id, id: "google_organic_bundle", ok: r.ok, code: r.code });
      if (!r.ok) summary.ok = false;
    }

    if (p.socialGrowthBundle && process.env.BOSSMIND_ORGANIC_SKIP_SOCIAL !== "1") {
      const socialArgs = [...persistArgs];
      if (process.env.BOSSMIND_MARKETING_AUTOPUBLISH === "1") {
        socialArgs.push("--autopublish");
        if (process.env.BOSSMIND_MARKETING_SOCIAL_DRY_RUN === "1") socialArgs.push("--dry-run");
      }
      const r = runAt(cwd, "scripts/marketing/run-social-growth-engine.mjs", socialArgs);
      phases.push({ project: target.id, id: "social_growth_bundle", ok: r.ok, code: r.code });
      if (!r.ok) summary.ok = false;
    }
  }

  summary.weekKey = process.env.BOSSMIND_ORGANIC_WEEK || summary.ts.slice(0, 10);
  await logNeon(summary);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
