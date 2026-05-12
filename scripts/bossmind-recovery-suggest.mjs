#!/usr/bin/env node
/**
 * Suggest recovery from a verified backup run (read-only).
 * Does not modify the working tree.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const backupRoot = path.resolve(
  root,
  process.env.BOSSMIND_BACKUP_ROOT || path.join(".bossmind", "backups", "rolling-30d")
);
const runId = process.env.BOSSMIND_RECOVERY_RUN_ID || "";

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
    console.error("recovery-suggest: manifest not found", manifestPath);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const suggest = [];
  for (const ent of manifest.files || []) {
    const abs = path.join(root, ...String(ent.relativePath).split("/"));
    if (!fs.existsSync(abs)) {
      suggest.push({ action: "restore_missing", path: ent.relativePath });
      continue;
    }
    const h = sha256File(abs);
    if (h !== ent.sha256) suggest.push({ action: "restore_mismatch", path: ent.relativePath });
  }
  const out = {
    manifestPath: manifestPath.replace(/\\/g, "/"),
    runId: manifest.runId,
    suggestCount: suggest.length,
    suggest,
    applyHint:
      "To copy files from a verified run: BOSSMIND_RECOVERY_CONFIRM=APPLY_FROM_BACKUP BOSSMIND_RECOVERY_RUN_ID=<id> npm run bossmind:recovery:apply",
  };
  console.log(JSON.stringify(out, null, 2));
}

main();
