#!/usr/bin/env node
/**
 * Seal the current workspace as the immutable production luxury baseline.
 * Writes config/bossmind-immutable-production-baseline.json + file snapshots under config/bossmind-baseline-snapshots/.
 *
 * Re-run only when leadership explicitly approves a new public UI baseline.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { execSync } from "child_process";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const {
  computeBaselineFingerprint,
  computePathsFingerprint,
} = require(path.join(root, "lib/orchestration/bossmind-baseline-fingerprint.js"));
const { getImmutableInterfacePaths, DEFAULT_IMMUTABLE_INTERFACE_PATHS } = require(path.join(
  root,
  "lib/orchestration/bossmind-immutable-baseline.js"
));

const SNAPSHOT_DIR = "config/bossmind-baseline-snapshots/luxury-v1";
const CONFIG_OUT = path.join(root, "config", "bossmind-immutable-production-baseline.json");

function gitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function copySnapshot(ifacePaths) {
  const destRoot = path.join(root, SNAPSHOT_DIR);
  for (const rel of ifacePaths) {
    const src = path.join(root, ...rel.split("/"));
    const dest = path.join(destRoot, ...rel.split("/"));
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

const existing = fs.existsSync(CONFIG_OUT) ? JSON.parse(fs.readFileSync(CONFIG_OUT, "utf8")) : {};
const ifacePaths = existing.immutableInterfacePaths?.length
  ? existing.immutableInterfacePaths
  : DEFAULT_IMMUTABLE_INTERFACE_PATHS;

const luxury = computePathsFingerprint(root, ifacePaths);
const workspace = computeBaselineFingerprint(root);

if (luxury.missing.length) {
  console.error("bossmind-baseline-seal: missing luxury paths:\n  " + luxury.missing.join("\n  "));
  process.exit(1);
}
if (workspace.missing.length) {
  console.error("bossmind-baseline-seal: missing workspace paths:\n  " + workspace.missing.join("\n  "));
  process.exit(1);
}

copySnapshot(ifacePaths);

const defaultEnforcement = {
  verifyCommand: "npm run bossmind:locked-production:verify",
  deployGateCommand: "npm run bossmind:deploy:gate",
  completionGateCommand: "npm run bossmind:completion:gate",
  baselineOverrideEnv: "BOSSMIND_BASELINE_OVERRIDE=1",
  restoreCommand: "npm run bossmind:baseline:restore",
  notes:
    "No silent overwrite: snapshots under snapshotRelativeDir are git-tracked; seal updates checksums. Production hosts are not auto-rolled back from this repo.",
};

const payload = {
  version: 1,
  enabled: true,
  description:
    typeof existing.description === "string" && existing.description.trim().length > 0
      ? existing.description
      : "Immutable confirmed Resumora luxury public UI (resumora.net). Deploy + runtime authority must match these checksums.",
  productionPublicOrigin:
    typeof existing.productionPublicOrigin === "string" && /^https:\/\//i.test(existing.productionPublicOrigin)
      ? existing.productionPublicOrigin.replace(/\/$/, "")
      : "https://resumora.net",
  lockedProductionMode: existing.lockedProductionMode !== false,
  enforcementContract: {
    ...defaultEnforcement,
    ...(typeof existing.enforcementContract === "object" && existing.enforcementContract !== null
      ? existing.enforcementContract
      : {}),
  },
  sealedAt: new Date().toISOString(),
  sealedGitHead: gitHead(),
  lockFullWorkspaceFingerprint: existing.lockFullWorkspaceFingerprint === true,
  immutableInterfacePaths: ifacePaths,
  snapshotRelativeDir: SNAPSHOT_DIR,
  lockedLuxuryInterfaceFingerprint: luxury.hash,
  lockedFullWorkspaceFingerprint: workspace.hash,
};

fs.mkdirSync(path.dirname(CONFIG_OUT), { recursive: true });
fs.writeFileSync(CONFIG_OUT, JSON.stringify(payload, null, 2), "utf8");

console.log("bossmind-baseline-seal: OK");
console.log(`  lockedLuxuryInterfaceFingerprint: ${luxury.hash}`);
console.log(`  lockedFullWorkspaceFingerprint:   ${workspace.hash}`);
console.log(`  snapshots: ${SNAPSHOT_DIR} (${ifacePaths.length} files)`);
console.log(`  config:    config/bossmind-immutable-production-baseline.json`);
process.exit(0);
