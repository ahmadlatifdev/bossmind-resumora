#!/usr/bin/env node
/**
 * Pre-deploy governance gate — Render/Railway/Neon aligned, no Vercel path.
 * Order: hosting policy → protected surface → lint → build → optional runtime probe
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";
const require = createRequire(import.meta.url);
const neon = require(join(root, "lib/shared/neon-memory.js"));
const {
  loadContinuePoint,
} = require(join(root, "lib/orchestration/bossmind-last-confirmed-point.js"));
const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
const checkpointKey = process.env.BOSSMIND_CONTINUITY_KEY || "global_continuity";

function run(label, cmd, args, extraEnv = {}) {
  console.log(`\n→ ${label}`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  if ((r.status ?? 1) !== 0) {
    console.error(`bossmind-deploy-gate: FAILED at ${label}`);
    process.exit(r.status ?? 1);
  }
}

await neon.initializeSharedMemory().catch(() => {});
const continuePoint = await loadContinuePoint({
  neon,
  projectKey,
  checkpointKey,
});
const continueEnv = continuePoint?.checkpoint?.commit_hash
  ? { BOSSMIND_CONTINUE_FROM_COMMIT: String(continuePoint.checkpoint.commit_hash) }
  : {};
if (continuePoint?.checkpoint) {
  console.log(
    `bossmind-deploy-gate: continue from checkpoint ${continuePoint.source} commit=${
      continuePoint.checkpoint.commit_hash ||
      continuePoint.checkpoint.commitHash ||
      "n/a"
    }`
  );
}

if (process.env.BOSSMIND_DEPLOY_SKIP_CHECKPOINT !== "1") {
  run("Pre-deploy preservation checkpoint", "node", ["scripts/bossmind-deploy-checkpoint.mjs"], continueEnv);
}

run("Hosting policy (no Vercel)", "node", ["scripts/bossmind-hosting-guard.mjs"], continueEnv);
run("Forbidden public UI patterns (marketing)", "node", ["scripts/bossmind-public-ui-forbidden-scan.mjs"], continueEnv);
run("Protected surface", "node", ["scripts/bossmind-protected-surface-verify.mjs"], continueEnv);

if (process.env.BOSSMIND_DEPLOY_GATE_SKIP_IMMUTABLE !== "1") {
  const probeEnv =
    process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN ||
    process.env.BOSSMIND_PRODUCTION_PUBLIC_ORIGIN ||
    "";
  run(
    "Immutable luxury baseline (checksum + optional prod probe)",
    "node",
    ["scripts/bossmind-immutable-verify.mjs"],
    probeEnv ? { ...continueEnv, BOSSMIND_IMMUTABLE_PROBE_ORIGIN: probeEnv } : continueEnv
  );
}

if (process.env.BOSSMIND_SKIP_ANTILEAK !== "1") {
  run("Anti-leak", "node", ["scripts/bossmind-antileak-guard.mjs"], continueEnv);
}

if (process.env.BOSSMIND_DEPLOY_GATE_SKIP_LINT !== "1") {
  run("Lint", npm, ["run", "lint"], continueEnv);
}
run("Production build", npm, ["run", "build"], continueEnv);

if (process.env.BOSSMIND_DEPLOY_GATE_UI_PROBE === "1") {
  run("UI probe (set BOSSMIND_PROBE_ORIGIN)", npm, ["run", "bossmind:ui-probe"], continueEnv);
}

if (process.env.BOSSMIND_DEPLOY_GATE_ULTRA === "1") {
  const ultraOrigin =
    process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN ||
    process.env.BOSSMIND_PRODUCTION_PUBLIC_ORIGIN ||
    process.env.BOSSMIND_REALITY_LIVE_URL ||
    "";
  const ultraArgs = ["scripts/bossmind-ultra-antileak.mjs", "--skip-build"];
  if (ultraOrigin) ultraArgs.push(`--origin=${ultraOrigin}`);
  run("Ultra anti-leak validation", "node", ultraArgs, {
    ...continueEnv,
    BOSSMIND_ULTRA_SKIP_ANTILEAK: process.env.BOSSMIND_SKIP_ANTILEAK || "1",
  });
}

console.log("\nbossmind-deploy-gate: ok — safe to deploy (Render frontend / Railway backend / Neon memory).");
process.exit(0);
