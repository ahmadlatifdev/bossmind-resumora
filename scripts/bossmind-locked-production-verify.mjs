#!/usr/bin/env node
/**
 * Locked Production Mode — single-source structural UI authority + sealed immutable checksums.
 * Pair with `npm run bossmind:deploy:gate` for lint/build/surface/anti-leak before ship.
 *
 *   npm run bossmind:locked-production:verify
 *
 * Optional production HTML marker probe:
 *   BOSSMIND_IMMUTABLE_PROBE_ORIGIN=https://resumora.net
 *
 * Emergency bypass (explicit approval only):
 *   BOSSMIND_BASELINE_OVERRIDE=1
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const { structuralAuthorityReport } = require(join(root, "lib/orchestration/bossmind-interface-authority.js"));

function run(label, cmd, args, extraEnv = {}) {
  console.log(`\n→ ${label}`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  if ((r.status ?? 1) !== 0) {
    console.error(`bossmind-locked-production-verify: FAILED at ${label}`);
    process.exit(r.status ?? 1);
  }
}

console.log("\n=== BossMind locked production verify (design lock) ===\n");

const structural = structuralAuthorityReport(root);
console.log("Structural UI authority:", JSON.stringify(structural, null, 2));
if (!structural.ok) {
  console.error(
    "\nbossmind-locked-production-verify: structural authority FAILED (duplicate HomePage, bad pages/index.js, or app/ router conflict)."
  );
  process.exit(1);
}

const probeEnv =
  process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN ||
  process.env.BOSSMIND_PRODUCTION_PUBLIC_ORIGIN ||
  "";

run("Brand asset authority (locked logo + conflict scan)", "node", ["scripts/bossmind-brand-asset-forbidden-scan.mjs"]);
run("Immutable luxury baseline (checksums + optional prod probe)", "node", ["scripts/bossmind-immutable-verify.mjs"], probeEnv ? { BOSSMIND_IMMUTABLE_PROBE_ORIGIN: probeEnv } : {});
run("Immutable execution chain (snapshot + live /pricing)", "node", ["scripts/bossmind-immutable-execution-chain.mjs"], probeEnv ? { BOSSMIND_IMMUTABLE_PROBE_ORIGIN: probeEnv, BOSSMIND_REALITY_LIVE_URL: probeEnv } : {});

console.log(
  "\n=== OK — locked production design lock verified ===\n" +
    "Checksums match sealed baseline; homepage routing has a single canonical source.\n" +
    "Before deploy, also run: npm run bossmind:deploy:gate\n"
);
process.exit(0);
