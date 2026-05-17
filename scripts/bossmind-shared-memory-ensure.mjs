#!/usr/bin/env node
/**
 * Ensure BossMind One Shared Memory tables + seed safety/marketing rules into Neon.
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const hub = require("../lib/shared/bossmind-hub-memory.js");
const { initializeSharedMemory } = require("../lib/shared/neon-memory.js");
const { seedRulesFromConfig, getHubStatus } = require("../lib/orchestration/bossmind-shared-memory-hub.js");

async function main() {
  const init = await initializeSharedMemory();
  const hubInit = await hub.initializeBossmindHubMemory();
  const presence = await hub.hubTablePresence();
  const seeded = await seedRulesFromConfig({ writerAgent: "memory_sync_job" });
  const status = await getHubStatus();
  console.log(
    JSON.stringify(
      {
        ok: Boolean(init.enabled && hubInit.enabled),
        init,
        hubInit,
        presence,
        seeded,
        projects: status.projects?.length ?? 0,
      },
      null,
      2
    )
  );
  if (!init.enabled) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
