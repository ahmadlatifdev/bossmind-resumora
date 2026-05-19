#!/usr/bin/env node
/**
 * One-shot legacy BossMind table migration (event_log, task_state, error_memory).
 * Renames pre-2026 tables missing project_key, then applies current schema.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

const { initializeSharedMemory, probeDatabaseConnection, saveEvent } = require(
  path.join(root, "lib/shared/neon-memory.js")
);

const init = await initializeSharedMemory();
const probe = await probeDatabaseConnection();
let eventTest = null;
if (probe.ok) {
  try {
    await saveEvent({
      projectKey: "resumora",
      eventType: "schema.migration.verify",
      source: "bossmind-neon-legacy-schema-migrate",
      payload: { ts: Date.now() },
    });
    eventTest = { ok: true };
  } catch (e) {
    eventTest = { ok: false, error: e.message };
  }
}

console.log(
  JSON.stringify(
    {
      ok: probe.ok && init.enabled && eventTest?.ok,
      init,
      probe,
      eventTest,
    },
    null,
    2
  )
);

process.exit(probe.ok && init.enabled && eventTest?.ok ? 0 : 2);
