#!/usr/bin/env node
/**
 * BossMind AI Video — Railway worker / local daemon. Advances the in-Neon pipeline one atomic step per tick.
 *
 *   npm run bossmind:ai-video:orchestrator
 *   npm run bossmind:ai-video:orchestrator:once
 *
 * Env:
 *   BOSSMIND_AI_VIDEO_ORCH_POLL_MS (default 8000) — sleep when idle (daemon mode)
 *   BOSSMIND_AI_VIDEO_ORCH_MAX_STEPS (default 100000 daemon, 40 for --once)
 *   BOSSMIND_AI_VIDEO_ORCH_ONCE=1 or --once — exit after pipeline idle or max steps
 * Requires NEON_DATABASE_URL, credentials for DeepSeek/OpenAI/etc. per bossmind-ai-video-providers.js
 */
import process from "node:process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

require(join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

const neon = require(join(root, "lib/shared/neon-memory.js"));
const store = require(join(root, "lib/orchestration/bossmind-ai-video-store.js"));
const { runOrchestratorStep } = require(join(root, "lib/orchestration/bossmind-ai-video-orchestrator-lib.js"));

const runOnce = process.argv.includes("--once") || process.env.BOSSMIND_AI_VIDEO_ORCH_ONCE === "1";
const pollMs = Number(process.env.BOSSMIND_AI_VIDEO_ORCH_POLL_MS || 8000);
const maxStepsArg = process.argv.find((a) => a.startsWith("--max-steps="));
const defaultMax = runOnce ? 40 : 100_000;
const maxSteps = maxStepsArg
  ? Number(maxStepsArg.split("=")[1])
  : Number(process.env.BOSSMIND_AI_VIDEO_ORCH_MAX_STEPS || defaultMax);

let stopping = false;
function gracefulStop() {
  stopping = true;
}

async function main() {
  const init = await neon.initializeSharedMemory();
  if (!init.enabled) {
    console.error("[ai-video-orchestrator] Neon unavailable:", init.reason);
    process.exit(1);
  }
  const db = await store.ensureDb();
  if (!db.ok) {
    console.error("[ai-video-orchestrator] Database:", db.reason);
    process.exit(1);
  }
  const { sql } = db;

  process.on("SIGINT", gracefulStop);
  process.on("SIGTERM", gracefulStop);

  await neon.saveEvent({
    projectKey: store.projectKey(),
    eventType: "ai_video.orchestrator.start",
    source: "bossmind-ai-video-orchestrator",
    eventKey: `boot-${process.pid}-${Date.now()}`,
    payload: { runOnce, pollMs, maxSteps },
  });

  console.log(
    `[ai-video-orchestrator] project=${store.projectKey()} once=${runOnce} pollMs=${pollMs} maxSteps=${maxSteps}`
  );

  let steps = 0;
  while (!stopping && steps < maxSteps) {
    const out = await runOrchestratorStep(sql);
    console.log(JSON.stringify({ t: new Date().toISOString(), ...out }));
    if (out.ran) {
      steps += 1;
      continue;
    }
    if (runOnce) break;
    await new Promise((r) => setTimeout(r, pollMs));
  }

  await neon.saveEvent({
    projectKey: store.projectKey(),
    eventType: "ai_video.orchestrator.stop",
    source: "bossmind-ai-video-orchestrator",
    eventKey: `stop-${process.pid}`,
    payload: { reason: stopping ? "signal" : runOnce ? "once_done" : "max_steps", steps },
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
