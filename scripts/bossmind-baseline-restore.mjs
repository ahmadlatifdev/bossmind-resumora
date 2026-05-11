#!/usr/bin/env node
/**
 * Restore luxury immutable files from committed snapshot (working tree only — no git reset).
 * Requires BOSSMIND_BASELINE_RESTORE_CONFIRM=RESTORE_IMMUTABLE_BASELINE
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const { verifyImmutableBaseline, getImmutableInterfacePaths } = require(path.join(
  root,
  "lib/orchestration/bossmind-immutable-baseline.js"
));

const confirm = process.env.BOSSMIND_BASELINE_RESTORE_CONFIRM || "";
if (confirm !== "RESTORE_IMMUTABLE_BASELINE") {
  console.error(
    "bossmind-baseline-restore: refused — set BOSSMIND_BASELINE_RESTORE_CONFIRM=RESTORE_IMMUTABLE_BASELINE"
  );
  process.exit(1);
}

const v = verifyImmutableBaseline(root);
const lock = v.lock;
const snapRel = v.snapshotRelativeDir || "config/bossmind-baseline-snapshots/luxury-v1";
const snapRoot = path.join(root, ...snapRel.split("/"));
const ifacePaths = getImmutableInterfacePaths(lock);

if (!fs.existsSync(snapRoot)) {
  console.error("bossmind-baseline-restore: missing snapshot dir " + snapRel);
  process.exit(1);
}

let n = 0;
for (const rel of ifacePaths) {
  const src = path.join(snapRoot, ...rel.split("/"));
  const dest = path.join(root, ...rel.split("/"));
  if (!fs.existsSync(src)) {
    console.warn("bossmind-baseline-restore: skip missing snapshot " + rel);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  n += 1;
}

console.log(`bossmind-baseline-restore: restored ${n} files from ${snapRel}`);
process.exit(0);
