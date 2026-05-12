#!/usr/bin/env node
/**
 * BossMind unified marketing activation — wires approved in-repo pipelines + Neon coordination.
 *
 * Runs (in order):
 * 1) Weekly organic bundle (+ optional DeepSeek enrich)
 * 2) Google organic / SEO workflow bundle
 * 3) Social growth bundle (Neon persist; autopublish only when explicitly enabled)
 *
 * Anti-loop: one successful completion per ISO week per project (task_state), overridable with --force.
 * Stale recovery: in_progress older than 45m is treated as abandoned.
 *
 * Env:
 *   BOSSMIND_PROJECT_KEY (default resumora)
 *   NEON_DATABASE_URL — dedupe + event_log + pipeline persistence
 *   BOSSMIND_MARKETING_AI_ENRICH=1 — weekly --enrich-ai when DEEPSEEK_API_KEY set
 *   BOSSMIND_MARKETING_AUTOPUBLISH=1 — pass --autopublish to social engine (still respects its week dedupe)
 *   BOSSMIND_MARKETING_SOCIAL_DRY_RUN=1 — force social --dry-run even if autopublish on
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
const lockDir = path.join(root, ".bossmind", "marketing-activation");
const lockPath = path.join(lockDir, "lock.json");
const localWeekMarker = (wid) => path.join(lockDir, `completed-${wid}.json`);
const STALE_LOCK_MS = 30 * 60 * 1000;
const STALE_TASK_MS = 45 * 60 * 1000;

function loadEnv() {
  try {
    require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  } catch {
    /* ignore */
  }
}

function parseArgs() {
  const argv = process.argv.slice(2);
  return {
    force: argv.includes("--force"),
    fromAutonomous: argv.includes("--from-autonomous"),
    dryRunSocial: argv.includes("--dry-run-social") || process.env.BOSSMIND_MARKETING_SOCIAL_DRY_RUN === "1",
  };
}

function readJsonSafe(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function acquireLock() {
  fs.mkdirSync(lockDir, { recursive: true });
  const now = Date.now();
  const existing = readJsonSafe(lockPath);
  if (existing?.pid && existing?.startedAt) {
    const age = now - Number(existing.startedAt);
    if (age < STALE_LOCK_MS) {
      return { ok: false, reason: "lock_held", existing };
    }
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
  }
  const payload = { pid: process.pid, startedAt: now, host: process.env.COMPUTERNAME || process.env.HOSTNAME || "" };
  fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2), "utf8");
  return { ok: true };
}

function releaseLock() {
  try {
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
  } catch {
    /* ignore */
  }
}

function runNodeScript(scriptRel, args = [], extraEnv = {}) {
  const cmd = process.execPath;
  const res = spawnSync(cmd, [path.join(root, scriptRel), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, ...extraEnv },
    maxBuffer: 24 * 1024 * 1024,
  });
  const stdout = res.stdout || "";
  const stderr = res.stderr || "";
  return {
    ok: (res.status ?? 1) === 0,
    code: res.status ?? 1,
    stdout: stdout.slice(-120_000),
    stderr: stderr.slice(-40_000),
  };
}

async function getTaskRow(neon, taskKey) {
  const sql = neon.getSqlClient();
  if (!sql) return null;
  const rows = await sql(
    `SELECT status, payload, updated_at FROM task_state WHERE project_key = $1 AND task_key = $2 LIMIT 1`,
    [projectKey, taskKey]
  );
  return rows?.length ? rows[0] : null;
}

function taskStale(updatedAt) {
  if (!updatedAt) return true;
  const t = new Date(updatedAt).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > STALE_TASK_MS;
}

async function main() {
  loadEnv();
  const opts = parseArgs();
  const neon = require(path.join(root, "lib/shared/neon-memory.js"));
  const { isoWeekId } = require(path.join(root, "lib/marketing/weekly-organic-bundle.js"));
  const weekId = isoWeekId();
  const taskKey = `bossmind_marketing_activation_${weekId}`;

  const init = await neon.initializeSharedMemory();
  const neonOn = Boolean(init?.enabled);

  const capabilities = {
    neon: neonOn,
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
    enrichRequested: process.env.BOSSMIND_MARKETING_AI_ENRICH === "1",
    socialAutopublish: process.env.BOSSMIND_MARKETING_AUTOPUBLISH === "1",
    socialDryRun: opts.dryRunSocial || process.env.BOSSMIND_MARKETING_SOCIAL_DRY_RUN === "1",
    uiSurfaces: {
      engagementStrip: true,
      elitePricingUx: true,
      note: "Engagement + Elite pricing ship in Next.js UI; no separate daemon.",
    },
  };

  const lock = acquireLock();
  if (!lock.ok) {
    console.log(
      JSON.stringify({
        ok: true,
        skipped: true,
        reason: lock.reason,
        weekId,
        lock: lock.existing,
      })
    );
    process.exit(0);
  }

  if (!neonOn && fs.existsSync(localWeekMarker(weekId)) && !opts.force) {
    releaseLock();
    console.log(
      JSON.stringify({
        ok: true,
        skipped: true,
        reason: "local_week_marker_no_neon",
        weekId,
        marker: localWeekMarker(weekId),
      })
    );
    process.exit(0);
  }

  let row = neonOn ? await getTaskRow(neon, taskKey) : null;
  if (row?.status === "completed" && !opts.force) {
    releaseLock();
    console.log(
      JSON.stringify({
        ok: true,
        skipped: true,
        reason: "already_completed_week",
        weekId,
        taskKey,
        updatedAt: row.updated_at,
      })
    );
    process.exit(0);
  }

  if (row?.status === "in_progress" && !opts.force && !taskStale(row.updated_at)) {
    releaseLock();
    console.log(
      JSON.stringify({
        ok: true,
        skipped: true,
        reason: "activation_in_progress",
        weekId,
        taskKey,
      })
    );
    process.exit(0);
  }

  if (neonOn) {
    await neon.upsertTaskState({
      projectKey,
      taskKey,
      status: "in_progress",
      assignedAgent: "bossmind-marketing-activation",
      payload: {
        weekId,
        startedAt: new Date().toISOString(),
        fromAutonomous: opts.fromAutonomous,
        capabilities,
      },
    });
    await neon.saveEvent({
      projectKey,
      eventType: "bossmind.marketing.activation.started",
      severity: "info",
      source: "bossmind-marketing-activation",
      eventKey: weekId,
      payload: { weekId, capabilities, force: opts.force },
    });
  }

  const steps = [];
  const weeklyArgsFinal = [];
  if (neonOn) weeklyArgsFinal.push("--persist-neon");
  if (neonOn && process.env.BOSSMIND_MARKETING_AI_ENRICH === "1" && process.env.DEEPSEEK_API_KEY) {
    weeklyArgsFinal.push("--enrich-ai");
  }

  const w = runNodeScript("scripts/marketing/weekly-organic-pipeline.js", weeklyArgsFinal);
  steps.push({ id: "weekly_organic", ok: w.ok, code: w.code, stderrTail: w.stderr.slice(-2000) });

  const googleArgs = neonOn ? ["--persist-neon"] : [];
  const g = runNodeScript("scripts/marketing/run-google-organic-engine.mjs", googleArgs);
  steps.push({ id: "google_organic", ok: g.ok, code: g.code, stderrTail: g.stderr.slice(-2000) });

  const socialArgs = [];
  if (neonOn) socialArgs.push("--persist-neon");
  if (capabilities.socialAutopublish) {
    socialArgs.push("--autopublish");
    if (capabilities.socialDryRun) socialArgs.push("--dry-run");
  }
  const s = runNodeScript("scripts/marketing/run-social-growth-engine.mjs", socialArgs);
  steps.push({ id: "social_growth", ok: s.ok, code: s.code, stderrTail: s.stderr.slice(-2000) });

  const allOk = steps.every((x) => x.ok);
  const summary = {
    ok: allOk,
    weekId,
    projectKey,
    neon: neonOn,
    capabilities,
    steps,
    fromAutonomous: opts.fromAutonomous,
    ts: new Date().toISOString(),
  };

  if (neonOn) {
    await neon.upsertTaskState({
      projectKey,
      taskKey,
      status: allOk ? "completed" : "failed",
      assignedAgent: "bossmind-marketing-activation",
      payload: {
        weekId,
        finishedAt: new Date().toISOString(),
        steps,
      },
    });
    await neon.saveEvent({
      projectKey,
      eventType: allOk ? "bossmind.marketing.activation.completed" : "bossmind.marketing.activation.failed",
      severity: allOk ? "info" : "warning",
      source: "bossmind-marketing-activation",
      eventKey: weekId,
      payload: summary,
    });
  } else if (allOk) {
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(
      localWeekMarker(weekId),
      JSON.stringify({ weekId, finishedAt: new Date().toISOString(), steps }, null, 2),
      "utf8"
    );
  }

  releaseLock();
  console.log(JSON.stringify(summary, null, 2));
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error("[bossmind-marketing-activation]", e);
  try {
    releaseLock();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
