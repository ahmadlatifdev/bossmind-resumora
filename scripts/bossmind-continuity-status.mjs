#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
const checkpointKey = process.env.BOSSMIND_CONTINUITY_KEY || "global_continuity";

const neon = require(path.join(root, "lib/shared/neon-memory.js"));
const { loadContinuePoint } = require(path.join(
  root,
  "lib/orchestration/bossmind-last-confirmed-point.js"
));

await neon.initializeSharedMemory().catch(() => {});
const cp = await loadContinuePoint({ neon, projectKey, checkpointKey });
console.log(
  JSON.stringify(
    {
      projectKey,
      checkpointKey,
      source: cp?.source || "none",
      checkpoint: cp?.checkpoint || null,
    },
    null,
    2
  )
);

