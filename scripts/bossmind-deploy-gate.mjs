#!/usr/bin/env node
/**
 * Pre-deploy governance gate — Render/Railway/Neon aligned, no Vercel path.
 * Order: hosting policy → protected surface → lint → build → optional runtime probe
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";

function run(label, cmd, args) {
  console.log(`\n→ ${label}`);
  const r = spawnSync(cmd, args, { cwd: root, shell: true, stdio: "inherit" });
  if ((r.status ?? 1) !== 0) {
    console.error(`bossmind-deploy-gate: FAILED at ${label}`);
    process.exit(r.status ?? 1);
  }
}

run("Hosting policy (no Vercel)", "node", ["scripts/bossmind-hosting-guard.mjs"]);
run("Protected surface", "node", ["scripts/bossmind-protected-surface-verify.mjs"]);

if (process.env.BOSSMIND_SKIP_ANTILEAK !== "1") {
  run("Anti-leak", "node", ["scripts/bossmind-antileak-guard.mjs"]);
}

if (process.env.BOSSMIND_DEPLOY_GATE_SKIP_LINT !== "1") {
  run("Lint", npm, ["run", "lint"]);
}
run("Production build", npm, ["run", "build"]);

if (process.env.BOSSMIND_DEPLOY_GATE_UI_PROBE === "1") {
  run("UI probe (set BOSSMIND_PROBE_ORIGIN)", npm, ["run", "bossmind:ui-probe"]);
}

console.log("\nbossmind-deploy-gate: ok — safe to deploy (Render frontend / Railway backend / Neon memory).");
process.exit(0);
