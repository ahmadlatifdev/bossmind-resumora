#!/usr/bin/env node
/**
 * Persist a verification / closed-loop checkpoint to Neon (event_log + task_state + optional deployment_history).
 * Does not deploy, patch, or screenshot — use from CI or locally after human/Render confirmation.
 *
 *   node scripts/bossmind-closed-loop-record.mjs --task-id=feat-footer-20260514 --status=verified \\
 *     --commit=$(git rev-parse HEAD) --live-url=https://resumora.net --routes=/,/pricing \\
 *     --notes="Footer drift probe passed"
 *
 * Env: NEON_DATABASE_URL (required for writes). Exits 0 with JSON skip if DB unavailable.
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, def = "") {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(`--${name}=`.length).trim();
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
    return process.argv[i + 1].trim();
  }
  return def;
}

function gitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

async function main() {
  const neon = require(join(root, "lib/shared/neon-memory.js"));
  await neon.ensureSharedMemoryInitialized().catch(() => {});
  if (!neon.getSqlClient()) {
    console.log(
      JSON.stringify({ ok: false, skipped: true, reason: "NEON_DATABASE_URL not available — no rows written." }, null, 2)
    );
    process.exit(0);
  }

  const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
  const taskId = arg("task-id") || arg("taskId");
  if (!taskId) {
    console.error("bossmind-closed-loop-record: missing --task-id");
    process.exit(1);
  }

  const status = arg("status", "recorded");
  const commit = arg("commit") || gitHead();
  const liveUrl = arg("live-url") || arg("liveUrl") || "";
  const routes = arg("routes", "/");
  const notes = arg("notes", "");
  const screenshotAfter = arg("screenshot-after") || "";
  const screenshotBefore = arg("screenshot-before") || "";
  const affected = arg("affected", "");

  const payload = {
    taskId,
    status,
    commitHash: commit,
    liveUrl,
    routes: routes.split(",").map((s) => s.trim()).filter(Boolean),
    notes,
    screenshotBefore: screenshotBefore || undefined,
    screenshotAfter: screenshotAfter || undefined,
    affectedFiles: affected ? affected.split(",").map((s) => s.trim()).filter(Boolean) : [],
    recordedAt: new Date().toISOString(),
    source: "bossmind-closed-loop-record",
  };

  const taskKey = `closed_loop:${taskId}`;

  await neon.upsertTaskState({
    projectKey,
    taskKey,
    status,
    assignedAgent: process.env.BOSSMIND_ASSIGNED_AGENT || "ci-or-manual",
    payload,
  });

  await neon.saveEvent({
    projectKey,
    eventType: "bossmind_closed_loop_checkpoint",
    severity: status === "failed" ? "warning" : "info",
    source: "bossmind-closed-loop-record",
    eventKey: taskKey,
    payload: {
      ...payload,
      notes: notes.slice(0, 2000),
    },
  });

  if (commit && (status === "verified" || status === "deployed")) {
    await neon.saveDeploymentHistory({
      projectKey,
      commitHash: commit,
      status: status === "verified" ? "verified_live" : status,
      summary: notes.slice(0, 500) || `closed_loop ${taskId}`,
      environment: process.env.BOSSMIND_DEPLOY_ENV || "production",
      metadata: { taskId, liveUrl, routes: payload.routes },
    });
  }

  console.log(JSON.stringify({ ok: true, taskKey, payload }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error("bossmind-closed-loop-record:", e);
  process.exit(1);
});
