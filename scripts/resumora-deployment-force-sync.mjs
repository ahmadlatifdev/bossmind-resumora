#!/usr/bin/env node
/**
 * Clean rebuild + route audit + ultra anti-leak (in-repo reconciliation).
 *   npm run resumora:deployment:force-sync
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(script, extraEnv = {}) {
  const r = spawnSync(npm, ["run", script], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: process.platform === "win32",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run("clean:next");
run("build");
run("resumora:deployment:route-audit");
run("resumora:pricing:ui-verify");
run("bossmind:ultra:antileak");
if (process.env.BOSSMIND_FORCE_SYNC_SNAPSHOT_LOCK === "1") {
  run("bossmind:ultra:antileak:snapshot-lock");
}
console.log("resumora-deployment-force-sync: complete");
