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

const hosting = spawnSync("node scripts/bossmind-hosting-guard.mjs", {
  cwd: root,
  shell: true,
  stdio: "inherit",
});
if ((hosting.status ?? 1) !== 0) {
  process.exit(hosting.status ?? 1);
}

const surface = spawnSync("node scripts/bossmind-protected-surface-verify.mjs", {
  cwd: root,
  shell: true,
  stdio: "inherit",
});
if ((surface.status ?? 1) !== 0) {
  process.exit(surface.status ?? 1);
}

if (process.env.BOSSMIND_SKIP_ANTILEAK !== "1") {
  const anti = spawnSync("node scripts/bossmind-antileak-guard.mjs", {
    cwd: root,
    shell: true,
    stdio: "inherit",
  });
  if ((anti.status ?? 1) !== 0) {
    process.exit(anti.status ?? 1);
  }
}

if (process.env.BOSSMIND_ENFORCE_AUDIT === "1") {
  const audit = spawnSync("node scripts/bossmind-orchestration-audit.mjs", {
    cwd: root,
    shell: true,
    stdio: "inherit",
  });
  if ((audit.status ?? 1) !== 0) {
    process.exit(audit.status ?? 1);
  }
}

const cmd = isWin ? "npm run validate:all" : "npm run validate:all";

const result = spawnSync(cmd, {
  cwd: root,
  shell: true,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
