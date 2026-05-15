#!/usr/bin/env node
/**
 * Dry-run restore simulation: compare working tree to latest (or specific) verified manifest.
 * Does not modify files. Exit 0 always unless --strict and drift found.
 */
import crypto from "crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.BOSSMIND_BACKUP_PROJECT_ROOT
  ? path.resolve(process.env.BOSSMIND_BACKUP_PROJECT_ROOT)
  : path.join(__dirname, "..");
const backupRoot = path.resolve(
  root,
  process.env.BOSSMIND_BACKUP_ROOT || path.join(".bossmind", "backups", "rolling-30d")
);
const runId = process.env.BOSSMIND_RECOVERY_RUN_ID || "";

function hasFlag(n) {
  return process.argv.includes(`--${n}`);
}

function sha256File(abs) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(abs));
  return h.digest("hex");
}

function main() {
  const manifestPath = runId
    ? path.join(backupRoot, "runs", runId, "manifest.json")
    : path.join(backupRoot, "protected", "latest-verified-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(JSON.stringify({ ok: false, error: "manifest_not_found", manifestPath }));
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const drift = [];
  for (const ent of manifest.files || []) {
    const abs = path.join(root, ...String(ent.relativePath).split("/"));
    if (!fs.existsSync(abs)) {
      drift.push({ path: ent.relativePath, reason: "missing_in_workspace" });
      continue;
    }
    const h = sha256File(abs);
    if (h !== ent.sha256) drift.push({ path: ent.relativePath, reason: "hash_mismatch" });
  }
  const out = {
    ok: drift.length === 0,
    simulation: true,
    manifestPath: manifestPath.replace(/\\/g, "/"),
    runId: manifest.runId,
    projectId: manifest.projectId,
    driftCount: drift.length,
    drift: drift.slice(0, 200),
    restoreReadinessPercent: drift.length === 0 ? 100 : Math.max(0, 100 - Math.min(100, drift.length * 2)),
  };
  console.log(JSON.stringify(out, null, 2));
  if (hasFlag("strict") && drift.length) process.exit(2);
}

main();
