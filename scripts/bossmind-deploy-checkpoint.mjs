#!/usr/bin/env node
/**
 * Pre-deploy immutable checkpoint: copies preservation-scoped files to
 * .bossmind/backups/pre-deploy/<timestamp>/files/ (same logic as daily, smaller retention manual).
 * Never deletes source. Safe to run before every deploy.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

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

function main() {
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.join(root, ".bossmind", "backups", "pre-deploy", id);
  const filesDir = path.join(base, "files");
  const manifest = { version: 1, kind: "pre-deploy", runId: id, ts: new Date().toISOString(), files: [] };

  fs.mkdirSync(filesDir, { recursive: true });
  for (const rel of collectPaths()) {
    const abs = path.join(root, ...rel.split("/"));
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    const dest = path.join(filesDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(abs, dest);
    manifest.files.push({ relativePath: rel, sha256: sha256File(abs), size: fs.statSync(abs).size });
  }
  fs.writeFileSync(path.join(base, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  try {
    const ex = path.join(root, "config", "bossmind-env-structure.example.txt");
    if (fs.existsSync(ex)) fs.copyFileSync(ex, path.join(base, "env-structure-reference.example.txt"));
  } catch {
    /* ignore */
  }
  console.log(JSON.stringify({ ok: true, checkpoint: base.replace(/\\/g, "/"), fileCount: manifest.files.length }, null, 2));
}

main();
