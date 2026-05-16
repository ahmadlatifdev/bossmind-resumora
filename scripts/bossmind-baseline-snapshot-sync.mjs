#!/usr/bin/env node
/**
 * Copy current immutable interface files into luxury-v1 snapshot (no git changes to live tree beyond snapshot).
 *   npm run bossmind:baseline:snapshot-sync
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const { getImmutableInterfacePaths } = require(path.join(root, "lib/orchestration/bossmind-immutable-baseline.js"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "config/bossmind-immutable-production-baseline.json"), "utf8"));
const snapRel = lock.snapshotRelativeDir || "config/bossmind-baseline-snapshots/luxury-v1";
const snapRoot = path.join(root, ...snapRel.split("/"));
const paths = getImmutableInterfacePaths(lock);

let authorityExtra = [];
try {
  const auth = JSON.parse(
    fs.readFileSync(path.join(root, "config/bossmind-protected-ui-authority.json"), "utf8")
  );
  authorityExtra = auth.fingerprintExtraPaths || [];
} catch {
  /* ignore */
}
const allPaths = [...new Set([...paths, ...authorityExtra])];

let n = 0;
for (const rel of allPaths) {
  const src = path.join(root, ...rel.split("/"));
  const dest = path.join(snapRoot, ...rel.split("/"));
  if (!fs.existsSync(src)) {
    console.warn("skip missing source " + rel);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  n += 1;
}
console.log(`bossmind-baseline-snapshot-sync: copied ${n} files → ${snapRel}`);
process.exit(0);
