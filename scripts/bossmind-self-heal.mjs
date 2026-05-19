#!/usr/bin/env node
/**
 * Build → on failure: log to Neon + run repair flow (planner + shared memory) → retry build once.
 * Does not auto-apply AI patches (Cursor must apply changes). Rollback stays manual/git.
 */
import { spawnSync } from "child_process";
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { runRepairFlow } = require("../lib/orchestration/langgraph-repair-flow");
const neon = require("../lib/shared/neon-memory");

const PROJECT_KEY = process.env.BOSSMIND_PROJECT_KEY || "resumora";

function runBuild() {
  const r = spawnSync("npm run build", { cwd: root, shell: true, encoding: "utf8" });
  return { ok: r.status === 0, stdout: r.stdout || "", stderr: r.stderr || "", status: r.status };
}

async function main() {
  const init = await neon.initializeSharedMemory();
  let first = runBuild();
  if (first.ok) {
    console.log("bossmind-self-heal: build passed.");
    if (init.enabled) {
      await neon.saveEvent({
        projectKey: PROJECT_KEY,
        eventType: "self_heal.build_ok",
        severity: "info",
        source: "bossmind-self-heal",
        payload: {},
      });
    }
    process.exit(0);
  }

  const clip = `${first.stderr}\n${first.stdout}`.slice(-12000);
  const sentryEvent = {
    eventId: `build-${Date.now()}`,
    errorType: "next_build_failed",
    errorMessage: clip.slice(0, 2000),
    stack: clip,
  };

  if (init.enabled) {
    await neon.saveEvent({
      projectKey: PROJECT_KEY,
      eventType: "self_heal.build_failed",
      severity: "error",
      source: "bossmind-self-heal",
      payload: { status: first.status, excerpt: clip.slice(0, 4000) },
    });
  }

  if (init.enabled) {
    try {
      await runRepairFlow({
        projectKey: PROJECT_KEY,
        sentryEvent,
        validationResult: { ok: false, details: "Build failed before validation" },
        deployResult: { ok: false, details: "No deploy — local self-heal" },
      });
    } catch (e) {
      console.error("bossmind-self-heal: repair flow error:", e.message);
    }
  } else {
    console.warn("bossmind-self-heal: Neon offline — skipped repair flow.");
  }

  if (process.env.BOSSMIND_SELF_HEAL_NPM_CI === "1") {
    console.log("bossmind-self-heal: running npm ci (BOSSMIND_SELF_HEAL_NPM_CI=1)...");
    spawnSync("npm ci", { cwd: root, shell: true, stdio: "inherit" });
  }

  const second = runBuild();
  if (second.ok) {
    console.log("bossmind-self-heal: build passed after repair pass.");
    if (init.enabled) {
      await neon.saveEvent({
        projectKey: PROJECT_KEY,
        eventType: "self_heal.retry_ok",
        severity: "info",
        source: "bossmind-self-heal",
        payload: {},
      });
    }
    process.exit(0);
  }

  console.error("bossmind-self-heal: build still failing after retry. Inspect logs above.");
  if (init.enabled) {
    await neon.saveEvent({
      projectKey: PROJECT_KEY,
      eventType: "self_heal.retry_failed",
      severity: "error",
      source: "bossmind-self-heal",
      payload: { excerpt: `${second.stderr}\n${second.stdout}`.slice(0, 4000) },
    });
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
