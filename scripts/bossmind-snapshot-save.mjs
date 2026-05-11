#!/usr/bin/env node
/**
 * Git tag rollback point + Neon event (optional). Run before risky edits / merges.
 *
 * Env:
 *   BOSSMIND_SKIP_GIT_TAG=1 — Neon event only when DB configured
 *   BOSSMIND_GIT_EXE — full path to git.exe if `git` is not on PATH for Node (Windows)
 */
import { spawnSync } from "child_process";
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const neon = require("../lib/shared/neon-memory");
const PROJECT_KEY = process.env.BOSSMIND_PROJECT_KEY || "resumora";

const label = process.argv[2] || `stable-${new Date().toISOString().replace(/[:.]/g, "-")}`;

/** Override git binary if PATH is stripped for Node children (Windows/Cursor): BOSSMIND_GIT_EXE=C:\\Program Files\\Git\\bin\\git.exe */
function gitExe() {
  return process.env.BOSSMIND_GIT_EXE || "git";
}

function head() {
  const r = spawnSync(gitExe(), ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  return r.stdout?.trim() || null;
}

async function main() {
  const h = head();
  if (!h) {
    console.error("bossmind-snapshot: not a git repo or HEAD missing.");
    process.exit(1);
  }

  const tag = `bossmind/${label}-${h.slice(0, 10)}`;

  if (process.env.BOSSMIND_SKIP_GIT_TAG !== "1") {
    const r = spawnSync(gitExe(), ["tag", "-a", tag, "-m", `BossMind snapshot ${label}`], {
      cwd: root,
      encoding: "utf8",
    });
    if (r.status !== 0) {
      console.error("bossmind-snapshot: git tag failed:", r.stderr || r.stdout);
      process.exit(2);
    }
    console.log(`bossmind-snapshot: created tag ${tag} at ${h}`);
  } else {
    console.log("bossmind-snapshot: skipped git tag (BOSSMIND_SKIP_GIT_TAG=1)");
  }

  const init = await neon.initializeSharedMemory();
  if (init.enabled) {
    await neon.saveEvent({
      projectKey: PROJECT_KEY,
      eventType: "orchestration.snapshot.tag",
      severity: "info",
      source: "bossmind-snapshot-save",
      payload: { tag, commit: h, label },
    });
    await neon.saveDeploymentHistory({
      projectKey: PROJECT_KEY,
      commitHash: h,
      environment: process.env.NODE_ENV || "development",
      status: "snapshot",
      summary: `BossMind git tag ${tag}`,
      metadata: { tag, label },
    });
  }

  console.log("bossmind-snapshot: done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
