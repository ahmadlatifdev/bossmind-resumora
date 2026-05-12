#!/usr/bin/env node
/**
 * BossMind rolling verified backup (default 30-day retention).
 * - Copies preservation-scoped files only (never moves/deletes source).
 * - Writes manifest + per-file SHA-256; verifies copy == source before marking .verified.
 * - Prunes old run dirs only if .verified present, age > retention, and no PERMANENT marker.
 * - Updates protected/latest-verified-manifest.json (never pruned from protected/).
 *
 * Env:
 *   BOSSMIND_BACKUP_ROOT — absolute or relative root (default .bossmind/backups/rolling-30d)
 *   BOSSMIND_BACKUP_RETENTION_DAYS — default 30
 *   BOSSMIND_BACKUP_NO_PRUNE=1 — skip prune pass
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const require = createRequire(import.meta.url);

const retentionDays = Number(process.env.BOSSMIND_BACKUP_RETENTION_DAYS || 30);
const backupRoot = path.resolve(
  root,
  process.env.BOSSMIND_BACKUP_ROOT || path.join(".bossmind", "backups", "rolling-30d")
);
const noPrune = process.env.BOSSMIND_BACKUP_NO_PRUNE === "1";

function sha256File(abs) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(abs));
  return h.digest("hex");
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function collectPaths() {
  const scopePath = path.join(root, "config", "bossmind-preservation-scope.json");
  const scope = loadJson(scopePath);
  const set = new Set(scope.additionalPaths || []);
  if (scope.includeProtectedSurface) {
    const surf = path.join(root, "config", "bossmind-protected-surface.json");
    const m = loadJson(surf);
    for (const p of [...(m.surfaceLockPaths || []), ...(m.shellLockPaths || [])]) {
      if (typeof p === "string") set.add(p.replace(/\\/g, "/"));
    }
  }
  return [...set].sort();
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

async function neonLog(eventType, severity, payload) {
  try {
    if (!process.env.NEON_DATABASE_URL) return;
    const neon = require(path.join(root, "lib/shared/neon-memory.js"));
    await neon.initializeSharedMemory();
    await neon.saveEvent({
      projectKey: process.env.BOSSMIND_PROJECT_KEY || "resumora",
      eventType,
      severity,
      source: "bossmind-backup-daily",
      eventKey: `backup_${Date.now()}`,
      payload,
    });
  } catch {
    /* optional */
  }
}

function runBackupForCwd(cwd, runId, destBase) {
  const relRoot = path.relative(root, cwd);
  const filesDir = path.join(destBase, "files");
  const relPaths = cwd === root ? collectPaths() : collectPaths(); // same scope file only from main root for now

  const manifest = {
    version: 1,
    runId,
    ts: new Date().toISOString(),
    cwd: cwd.replace(/\\/g, "/"),
    projectId: "resumora",
    files: [],
  };

  const missing = [];
  for (const rel of relPaths) {
    const abs = path.join(cwd, ...rel.split("/"));
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      missing.push(rel);
      continue;
    }
    const dest = path.join(filesDir, rel);
    copyFile(abs, dest);
    const st = fs.statSync(abs);
    manifest.files.push({
      relativePath: rel,
      size: st.size,
      sha256: sha256File(abs),
    });
  }

  ensureDir(destBase);
  fs.writeFileSync(path.join(destBase, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  /** Verify copies */
  let verifyOk = true;
  const verifyErrors = [];
  for (const ent of manifest.files) {
    const src = path.join(cwd, ...ent.relativePath.split("/"));
    const dst = path.join(filesDir, ent.relativePath);
    if (!fs.existsSync(dst)) {
      verifyOk = false;
      verifyErrors.push(`missing copy ${ent.relativePath}`);
      continue;
    }
    const h = sha256File(dst);
    if (h !== ent.sha256) {
      verifyOk = false;
      verifyErrors.push(`hash mismatch ${ent.relativePath}`);
    }
  }

  if (missing.length) {
    verifyOk = false;
    verifyErrors.push(`missing sources: ${missing.join(", ")}`);
  }

  const verifiedPayload = {
    runId,
    verifiedAt: new Date().toISOString(),
    fileCount: manifest.files.length,
    ok: verifyOk,
    errors: verifyErrors,
  };
  fs.writeFileSync(path.join(destBase, ".verified.json"), JSON.stringify(verifiedPayload, null, 2), "utf8");
  if (verifyOk) {
    fs.writeFileSync(path.join(destBase, ".verified"), "1", "utf8");
  }

  return { manifest, verifyOk, verifyErrors, missing };
}

function pruneOldRuns(runsDir, protectedDir) {
  if (noPrune) return { pruned: [], skipped: "BOSSMIND_BACKUP_NO_PRUNE=1" };
  if (!fs.existsSync(runsDir)) return { pruned: [] };

  let lastGoodId = "";
  try {
    lastGoodId = fs.readFileSync(path.join(protectedDir, "last-good-run-id.txt"), "utf8").trim();
  } catch {
    /* none */
  }

  const cutoff = Date.now() - retentionDays * 86400_000;
  const pruned = [];
  let entries = [];
  try {
    entries = fs.readdirSync(runsDir, { withFileTypes: true });
  } catch {
    return { pruned: [] };
  }

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const id = e.name;
    const dir = path.join(runsDir, id);
    if (id === lastGoodId) continue;
    if (fs.existsSync(path.join(dir, "PERMANENT"))) continue;
    if (!fs.existsSync(path.join(dir, ".verified"))) continue;

    const st = fs.statSync(dir);
    if (st.mtimeMs >= cutoff) continue;

    fs.rmSync(dir, { recursive: true, force: true });
    pruned.push(id);
  }
  return { pruned };
}

function appendAlert(line) {
  const p = path.join(backupRoot, "ALERT-failures.log");
  ensureDir(path.dirname(p));
  fs.appendFileSync(p, `${new Date().toISOString()} ${line}\n`, "utf8");
}

async function main() {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runsDir = path.join(backupRoot, "runs");
  const protectedDir = path.join(backupRoot, "protected");
  ensureDir(runsDir);
  ensureDir(protectedDir);

  const destBase = path.join(runsDir, runId);
  if (fs.existsSync(destBase)) {
    console.error("bossmind-backup-daily: run dir exists", destBase);
    process.exit(1);
  }
  ensureDir(destBase);

  const { manifest, verifyOk, verifyErrors, missing } = runBackupForCwd(root, runId, destBase);

  /** Protected snapshot of manifest (small) — not the full file tree */
  if (verifyOk) {
    fs.writeFileSync(path.join(protectedDir, "latest-verified-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    fs.writeFileSync(path.join(protectedDir, "last-good-run-id.txt"), runId, "utf8");
    fs.writeFileSync(path.join(protectedDir, "latest-verified-run.txt"), runId, "utf8");
  }

  const logLine = {
    runId,
    verifyOk,
    fileCount: manifest.files.length,
    missingCount: missing.length,
    backupRoot: backupRoot.replace(/\\/g, "/"),
  };
  const logPath = path.join(backupRoot, "daily-backup.log.jsonl");
  ensureDir(path.dirname(logPath));
  fs.appendFileSync(logPath, `${JSON.stringify(logLine)}\n`, "utf8");

  const prune = pruneOldRuns(runsDir, protectedDir);

  const out = {
    ok: verifyOk,
    runId,
    backupRoot: backupRoot.replace(/\\/g, "/"),
    fileCount: manifest.files.length,
    missing,
    verifyErrors,
    pruned: prune.pruned,
  };
  console.log(JSON.stringify(out, null, 2));

  if (!verifyOk) {
    await neonLog("bossmind.backup.daily.failed", "error", out);
    appendAlert(JSON.stringify(out));
    process.exit(1);
  }
  await neonLog("bossmind.backup.daily.ok", "info", { runId, fileCount: manifest.files.length, pruned: prune.pruned });
}

main().catch((e) => {
  console.error(e);
  appendAlert(String(e?.message || e));
  process.exit(1);
});
