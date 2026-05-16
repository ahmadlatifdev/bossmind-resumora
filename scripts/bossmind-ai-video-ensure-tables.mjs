#!/usr/bin/env node
/**
 * Ensure Neon DDL includes AI Video tables (idempotent).
 *
 *   npm run bossmind:ai-video:ensure-tables
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

try {
  require(join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
} catch {
  /* optional */
}

async function main() {
  const neon = require(join(root, "lib/shared/neon-memory.js"));
  const init = await neon.initializeSharedMemory();
  console.log(JSON.stringify({ ok: init.enabled, reason: init.reason || null }, null, 2));
  process.exit(init.enabled ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
