#!/usr/bin/env node
/**
 * Read-only integrity: workspace file hashes vs last verified backup manifest.
 * Exit 1 on drift. Does not modify files.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.BOSSMIND_BACKUP_PROJECT_ROOT
  ? path.resolve(process.env.BOSSMIND_BACKUP_PROJECT_ROOT)
  : path.join(__dirname, "..");
const backupRoot = path.resolve(
  root,
  process.env.BOSSMIND_BACKUP_ROOT || path.join(".bossmind", "backups", "rolling-30d")
);
const manifestPath = path.join(backupRoot, "protected", "latest-verified-manifest.json");

function sha256File(abs) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(abs));
  return h.digest("hex");
}

function main() {
  if (!fs.existsSync(manifestPath)) {
    console.error("preservation-validate: no latest-verified-manifest.json — run npm run bossmind:backup:daily first");
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const drift = [];
  for (const ent of manifest.files || []) {
    const abs = path.join(root, ...String(ent.relativePath).split("/"));
    if (!fs.existsSync(abs)) {
      drift.push({ path: ent.relativePath, reason: "missing" });
      continue;
    }
    const h = sha256File(abs);
    if (h !== ent.sha256) drift.push({ path: ent.relativePath, reason: "hash_mismatch", expected: ent.sha256, actual: h });
  }
  const out = { ok: drift.length === 0, manifestRunId: manifest.runId, manifestTs: manifest.ts, driftCount: drift.length, drift };
  console.log(JSON.stringify(out, null, 2));
  process.exit(drift.length ? 1 : 0);
}

main();
