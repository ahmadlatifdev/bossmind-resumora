#!/usr/bin/env node
/**
 * Restore preservation-scoped files from a verified backup run into the working tree.
 * Isolated to paths in that run's manifest only (does not touch other repos).
 *
 * BOSSMIND_RECOVERY_CONFIRM=APPLY_FROM_BACKUP
 * BOSSMIND_RECOVERY_RUN_ID=<run folder name under rolling-30d/runs/>
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

function sha256File(abs) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(abs));
  return h.digest("hex");
}

function main() {
  if (process.env.BOSSMIND_RECOVERY_CONFIRM !== "APPLY_FROM_BACKUP") {
    console.error("Refused: set BOSSMIND_RECOVERY_CONFIRM=APPLY_FROM_BACKUP");
    process.exit(1);
  }
  const runId = process.env.BOSSMIND_RECOVERY_RUN_ID || "";
  if (!runId) {
    console.error("Set BOSSMIND_RECOVERY_RUN_ID to a folder name under backups/.../runs/");
    process.exit(1);
  }
  const runDir = path.join(backupRoot, "runs", runId);
  const manifestPath = path.join(runDir, "manifest.json");
  const filesDir = path.join(runDir, "files");
  if (!fs.existsSync(manifestPath) || !fs.existsSync(path.join(runDir, ".verified"))) {
    console.error("Run not found or not verified:", runId);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  let n = 0;
  for (const ent of manifest.files || []) {
    const src = path.join(filesDir, ...String(ent.relativePath).split("/"));
    const dest = path.join(root, ...String(ent.relativePath).split("/"));
    if (!fs.existsSync(src)) continue;
    const h = sha256File(src);
    if (h !== ent.sha256) {
      console.error("Backup copy corrupted:", ent.relativePath);
      process.exit(1);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    n += 1;
  }
  console.log(JSON.stringify({ ok: true, restoredFiles: n, runId }, null, 2));
}

main();
