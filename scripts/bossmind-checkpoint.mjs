#!/usr/bin/env node
/**
 * BossMind pre-edit checkpoint.
 *
 * Default (safe): prints Git snapshot instructions + optional Neon event_log (no stash).
 * With `--stash`: runs `git stash push -u` (destructive — use only when you intend to stash).
 *
 * Usage:
 *   npm run bossmind:checkpoint
 *   npm run bossmind:checkpoint -- --stash
 */
import { spawnSync } from "child_process";

const doStash = process.argv.includes("--stash");
const msg = `bossmind-checkpoint ${new Date().toISOString()}`;

if (doStash) {
  const porcelain = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  if (porcelain.status !== 0) {
    console.error("Git not available or not a repository.");
    process.exit(1);
  }
  if (!porcelain.stdout?.trim()) {
    console.log("Working tree clean — no stash needed.");
  } else {
    const stash = spawnSync("git", ["stash", "push", "-u", "-m", msg], { stdio: "inherit" });
    if (stash.status !== 0) {
      console.error("git stash push failed.");
      process.exit(stash.status || 1);
    }
    console.log(`Stashed: ${msg}`);
  }
} else {
  const head = spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" });
  const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" });
  console.log("BossMind checkpoint (non-destructive)");
  console.log(`  HEAD: ${(head.stdout || "").trim()}  branch: ${(branch.stdout || "").trim()}`);
  console.log("  To snapshot WIP safely, choose one:");
  console.log("    npm run bossmind:checkpoint -- --stash");
  console.log("    git switch -c checkpoint/your-topic && git commit -am \"WIP checkpoint\"");
}

if (process.env.NEON_DATABASE_URL) {
  try {
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const { initializeSharedMemory, saveEvent } = require("../lib/shared/neon-memory.js");
    await initializeSharedMemory();
    await saveEvent({
      projectKey: process.env.BOSSMIND_PROJECT_KEY || "resumora",
      eventType: "bossmind.git.checkpoint",
      severity: "info",
      source: "bossmind-checkpoint",
      payload: {
        message: msg,
        stashed: doStash,
      },
    });
    console.log("Logged bossmind.git.checkpoint to shared memory.");
  } catch (e) {
    console.warn("Neon checkpoint log skipped:", e?.message || e);
  }
} else if (doStash) {
  console.log("NEON_DATABASE_URL unset — skipping event_log.");
}
