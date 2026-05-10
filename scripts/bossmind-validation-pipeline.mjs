#!/usr/bin/env node
/**
 * BossMind validation gate — run locally or from CI after repairs (lint → build → runtime).
 * Does not auto-commit; pair with deployment-report API after merge.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

const cmd = isWin
  ? "npm run validate:all"
  : "npm run validate:all";

const result = spawnSync(cmd, {
  cwd: root,
  shell: true,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
