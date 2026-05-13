#!/usr/bin/env node
/**
 * Enterprise preflight — fast structural + policy gates before wide edits or CI.
 * Does not deploy, screenshot, or auto-fix; pair with `npm run bossmind:deploy:gate` before ship.
 *
 *   npm run bossmind:enterprise:preflight
 *
 * Optional:
 *   BOSSMIND_ENTERPRISE_PREFLIGHT_SKIP_IMMUTABLE=1  — skip checksum lock (not recommended)
 *   BOSSMIND_ENTERPRISE_PREFLIGHT_BUILD=1           — also run `next build` (slower)
 *   BOSSMIND_SKIP_ANTILEAK=1                         — skip anti-leak (same as other pipelines)
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";
const require = createRequire(import.meta.url);

function run(label, cmd, args = [], extraEnv = {}) {
  console.log(`\n→ ${label}`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  if ((r.status ?? 1) !== 0) {
    console.error(`bossmind-enterprise-preflight: FAILED — ${label}`);
    process.exit(r.status ?? 1);
  }
}

run("Hosting policy (no Vercel path drift)", "node", ["scripts/bossmind-hosting-guard.mjs"]);
run("Forbidden public UI patterns", "node", ["scripts/bossmind-public-ui-forbidden-scan.mjs"]);
run("Protected surface registry", "node", ["scripts/bossmind-protected-surface-verify.mjs"]);

const { structuralAuthorityReport } = require(join(root, "lib/orchestration/bossmind-interface-authority.js"));
console.log("\n→ Structural UI authority (single HomePage / index bootstrap / router hygiene)");
const structural = structuralAuthorityReport(root);
console.log(JSON.stringify(structural, null, 2));
if (!structural.ok) {
  console.error("bossmind-enterprise-preflight: structural authority FAILED.");
  process.exit(1);
}

if (process.env.BOSSMIND_ENTERPRISE_PREFLIGHT_SKIP_IMMUTABLE !== "1") {
  const probeEnv =
    process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN || process.env.BOSSMIND_PRODUCTION_PUBLIC_ORIGIN || "";
  run(
    "Immutable luxury baseline (checksums + optional prod probe)",
    "node",
    ["scripts/bossmind-immutable-verify.mjs"],
    probeEnv ? { BOSSMIND_IMMUTABLE_PROBE_ORIGIN: probeEnv } : {}
  );
}

if (process.env.BOSSMIND_SKIP_ANTILEAK !== "1") {
  run("Anti-leak guard", "node", ["scripts/bossmind-antileak-guard.mjs"]);
}

if (process.env.BOSSMIND_ENTERPRISE_PREFLIGHT_BUILD === "1") {
  run("Production build", npm, ["run", "build"]);
}

console.log(
  "\nbossmind-enterprise-preflight: OK — next: `npm run bossmind:deploy:gate` before deploy; optional `npm run bossmind:reality:gate` with BOSSMIND_REALITY_LIVE_URL after deploy."
);
process.exit(0);
