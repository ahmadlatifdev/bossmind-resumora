#!/usr/bin/env node
/** Closed-loop: core optimization + safe self-heal chain steps. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = spawnSync(process.execPath, [path.join(root, "scripts/bossmind-core-optimization.mjs"), "--closed-loop"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
