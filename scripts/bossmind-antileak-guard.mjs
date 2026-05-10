#!/usr/bin/env node
/**
 * Active Anti-Leak gate: blocks edits to protected paths (from PROTECTED_COMPONENTS_REGISTRY.md)
 * and large destructive CSS changes unless BOSSMIND_PROTECTED_EDIT_OK=1.
 *
 * Compare range: BOSSMIND_ANTILEAK_BASE (default origin/main, else main, else HEAD~1)
 *
 * Shared-memory schema/helpers (`lib/shared/neon-memory.js`) stay listed in the registry for
 * traceability but are excluded here so orchestration/neon indexing changes can ship with
 * normal PR review (UI/copy/Stripe paths remain hard-blocked).
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = join(root, "docs", "PROTECTED_COMPONENTS_REGISTRY.md");

const ORCHESTRATION_EXCEPTION_PATHS = new Set(["lib/shared/neon-memory.js"]);

if (process.env.BOSSMIND_PROTECTED_EDIT_OK === "1") {
  console.log("bossmind-antileak: BOSSMIND_PROTECTED_EDIT_OK=1 — bypassing hard blocks.");
  process.exit(0);
}

/** Git-relative paths stay slash-separated (avoid path.normalize flipping to '\\' on Windows). */
function posixPath(p) {
  return String(p).replace(/\\/g, "/");
}

function resolveBaseRef() {
  const env = process.env.BOSSMIND_ANTILEAK_BASE;
  if (env) return env;
  for (const candidate of ["origin/main", "main", "HEAD~1"]) {
    try {
      execSync(`git rev-parse --verify ${candidate}`, { cwd: root, stdio: "ignore" });
      return candidate;
    } catch {
      /* next */
    }
  }
  return "HEAD~1";
}

function loadProtectedPaths() {
  const text = readFileSync(registryPath, "utf8");
  const set = new Set();
  const re = /`([^`]+\.(?:jsx?|tsx?|css|js))`/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const p = posixPath(m[1]);
    if (!p.includes("..")) set.add(p);
  }
  const extra = (process.env.BOSSMIND_EXTRA_PROTECTED_PATHS || "")
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of extra) set.add(posixPath(p));
  return set;
}

function changedFiles(base) {
  const set = new Set();
  let mergeBase = base;
  try {
    mergeBase = execSync(`git merge-base HEAD ${base}`, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    /* use base as-is */
  }
  const mergeFrom = mergeBase || base;
  const diffNames = execSync(`git diff --name-only ${mergeFrom}`, {
    cwd: root,
    encoding: "utf8",
  });
  const stagedNames = execSync(`git diff --name-only --cached ${mergeFrom}`, {
    cwd: root,
    encoding: "utf8",
  });
  for (const block of [diffNames, stagedNames]) {
    for (const line of block.split("\n")) {
      const f = line.trim();
      if (f) set.add(posixPath(f));
    }
  }
  const porcelain = execSync(`git status --porcelain`, { cwd: root, encoding: "utf8" });
  for (const line of porcelain.split("\n")) {
    if (!line.trim()) continue;
    const raw = line.slice(3).trim();
    const name = raw.includes(" -> ") ? raw.split(" -> ").pop().trim() : raw;
    if (name) set.add(posixPath(name));
  }
  return set;
}

function cssDeletionLines(fromRef) {
  try {
    const stat = execSync(`git diff ${fromRef} --numstat -- styles/resumora-global.css`, {
      cwd: root,
      encoding: "utf8",
    }).trim();
    if (!stat) return 0;
    const [adds, dels] = stat.split("\t");
    const d = Number(dels);
    return Number.isFinite(d) ? d : 0;
  } catch {
    return 0;
  }
}

function conflictMarkers(files) {
  const bad = [];
  for (const f of files) {
    if (!f || !existsSync(join(root, f))) continue;
    try {
      const body = readFileSync(join(root, f), "utf8");
      const openMarker = "<".repeat(7);
      const closeMarker = ">".repeat(7);
      if (body.includes(openMarker) || body.includes(closeMarker)) bad.push(f);
    } catch {
      /* ignore */
    }
  }
  return bad;
}

const base = resolveBaseRef();
let mergeBaseForCss = base;
try {
  mergeBaseForCss = execSync(`git merge-base HEAD ${base}`, { cwd: root, encoding: "utf8" }).trim();
} catch {
  /* keep base */
}

const protectedSet = loadProtectedPaths();
for (const ex of ORCHESTRATION_EXCEPTION_PATHS) protectedSet.delete(ex);

const files = changedFiles(base);
const hits = [...files].filter((f) =>
  [...protectedSet].some((p) => f === p || f.endsWith("/" + p))
);

if (hits.length) {
  console.error("bossmind-antileak: blocked — protected paths touched:\n  " + hits.join("\n  "));
  console.error("Set BOSSMIND_PROTECTED_EDIT_OK=1 only with explicit owner approval.");
  process.exit(1);
}

const dels = cssDeletionLines(mergeBaseForCss || base);
const cssThreshold = Number(process.env.BOSSMIND_ANTILEAK_CSS_DELETE_MAX || 180);
if (dels > cssThreshold) {
  console.error(
    `bossmind-antileak: blocked — resumora-global.css shows ${dels} deleted lines vs base (max ${cssThreshold}).`
  );
  process.exit(2);
}

const markers = conflictMarkers(files);
if (markers.length) {
  console.error("bossmind-antileak: merge conflict markers in:\n  " + markers.join("\n  "));
  process.exit(3);
}

console.log(`bossmind-antileak: ok (base=${base}, protected=${protectedSet.size} paths).`);
