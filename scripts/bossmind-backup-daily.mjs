#!/usr/bin/env node
/**
 * BossMind rolling verified backup (default 30-day retention).
 * - Copies preservation-scoped files only (never moves/deletes source).
 * - Writes manifest + per-file SHA-256; verifies copy == source before marking .verified.
 * - Prunes old run dirs only if .verified present, age > retention, and no PERMANENT marker.
 * - Updates protected/latest-verified-manifest.json (never pruned from protected/).
 *
 * Env:
 *   BOSSMIND_BACKUP_PROJECT_ROOT — repo root to back up (default: this package root). Use for multi-project hub runs.
 *   BOSSMIND_BACKUP_PROJECT_ID — manifest projectId (default: basename of project root)
 *   BOSSMIND_BACKUP_ROOT — absolute or relative to project root (default .bossmind/backups/rolling-30d)
 *   BOSSMIND_BACKUP_RETENTION_DAYS — default 30
 *   BOSSMIND_BACKUP_NO_PRUNE=1 — skip prune pass
 *   BOSSMIND_BACKUP_MAX_RETRIES — default 3 (verify failures only)
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const anchorRoot = path.join(__dirname, "..");
const root = process.env.BOSSMIND_BACKUP_PROJECT_ROOT
  ? path.resolve(process.env.BOSSMIND_BACKUP_PROJECT_ROOT)
  : anchorRoot;
const require = createRequire(import.meta.url);

const retentionDays = Number(process.env.BOSSMIND_BACKUP_RETENTION_DAYS || 30);
const maxRetries = Math.max(1, Math.min(8, Number(process.env.BOSSMIND_BACKUP_MAX_RETRIES || 3)));
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

function collectGenericPaths(projectRoot) {
  const candidates = [
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "next.config.ts",
    "next.config.js",
    "server.js",
    "render.yaml",
    "railway.json",
    "railway.toml",
    "ecosystem.config.cjs",
    "README.md",
    "README.mdx",
    "tsconfig.json",
  ];
  const set = new Set();
  for (const c of candidates) {
    const abs = path.join(projectRoot, ...c.split("/"));
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) set.add(c);
  }
  try {
    const cfgDir = path.join(projectRoot, "config");
    if (fs.existsSync(cfgDir)) {
      for (const f of fs.readdirSync(cfgDir)) {
        if (f.endsWith(".json")) set.add(`config/${f}`);
      }
    }
  } catch {
    /* ignore */
  }
  return [...set].sort();
}

function collectPaths() {
  const scopePath = path.join(root, "config", "bossmind-preservation-scope.json");
  if (!fs.existsSync(scopePath)) {
    return collectGenericPaths(root);
  }
  const scope = loadJson(scopePath);
  const set = new Set(scope.additionalPaths || []);
  if (scope.includeProtectedSurface) {
    const surf = path.join(root, "config", "bossmind-protected-surface.json");
    if (fs.existsSync(surf)) {
      const m = loadJson(surf);
      for (const p of [...(m.surfaceLockPaths || []), ...(m.shellLockPaths || [])]) {
        if (typeof p === "string") set.add(p.replace(/\\/g, "/"));
      }
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
    const neon = require(path.join(anchorRoot, "lib/shared/neon-memory.js"));
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
  const filesDir = path.join(destBase, "files");
  const relPaths = collectPaths();

  const manifest = {
    version: 1,
    runId,
    ts: new Date().toISOString(),
    cwd: cwd.replace(/\\/g, "/"),
    projectId: process.env.BOSSMIND_BACKUP_PROJECT_ID || path.basename(cwd) || "resumora",
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

async function neonRecordBackupFailure(out) {
  try {
    if (!process.env.NEON_DATABASE_URL) return;
    const neon = require(path.join(anchorRoot, "lib/shared/neon-memory.js"));
    await neon.initializeSharedMemory();
    await neon.upsertErrorMemory({
      projectKey: process.env.BOSSMIND_PROJECT_KEY || "resumora",
      errorType: "bossmind.backup.daily.final_failure",
      errorMessage: (out.verifyErrors || []).join("; ").slice(0, 4000) || "verify failed",
      stackExcerpt: JSON.stringify(out).slice(0, 2000),
      rootCause: "verified_copy_mismatch_or_missing_sources",
      fixPattern: "Run npm run bossmind:recovery:suggest; restore missing paths; re-run backup",
    });
  } catch {
    /* optional */
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const runsDir = path.join(backupRoot, "runs");
  const protectedDir = path.join(backupRoot, "protected");
  ensureDir(runsDir);
  ensureDir(protectedDir);

  let lastOut = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-a${attempt}`;
    const destBase = path.join(runsDir, runId);
    if (fs.existsSync(destBase)) {
      fs.rmSync(destBase, { recursive: true, force: true });
    }
    ensureDir(destBase);

    const { manifest, verifyOk, verifyErrors, missing } = runBackupForCwd(root, runId, destBase);

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
      attempt,
      projectRoot: root.replace(/\\/g, "/"),
    };
    const logPath = path.join(backupRoot, "daily-backup.log.jsonl");
    ensureDir(path.dirname(logPath));
    fs.appendFileSync(logPath, `${JSON.stringify(logLine)}\n`, "utf8");

    const prune = pruneOldRuns(runsDir, protectedDir);

    lastOut = {
      ok: verifyOk,
      runId,
      backupRoot: backupRoot.replace(/\\/g, "/"),
      fileCount: manifest.files.length,
      missing,
      verifyErrors,
      pruned: prune.pruned,
      attempt,
      projectRoot: root.replace(/\\/g, "/"),
    };
    console.log(JSON.stringify(lastOut, null, 2));

    if (verifyOk) {
      await neonLog("bossmind.backup.daily.ok", "info", {
        runId,
        fileCount: manifest.files.length,
        pruned: prune.pruned,
        attempt,
      });
      return;
    }

    await neonLog("bossmind.backup.daily.failed", "error", { ...lastOut, willRetry: attempt < maxRetries });
    appendAlert(JSON.stringify(lastOut));
    try {
      fs.rmSync(destBase, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    if (attempt < maxRetries) await delay(2000);
  }

  await neonRecordBackupFailure(lastOut);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  appendAlert(String(e?.message || e));
  process.exit(1);
});
