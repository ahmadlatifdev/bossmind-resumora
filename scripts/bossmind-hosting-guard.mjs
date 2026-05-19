#!/usr/bin/env node
/**
 * BossMind hosting-policy guard.
 *
 * Enforces locked architecture:
 * - Render: frontend/public interfaces
 * - Railway: backend/APIs/workers/orchestration
 * - Neon: memory/database authority
 *
 * Fails on dropped-provider env keys and deployment guidance:
 * - Vercel, Cloudflare (platform), Supabase, Windsurf
 *
 * Approved live: Render, Railway, Neon, GitHub, Squarespace (marketing/domain).
 *
 * Override (explicit/manual): BOSSMIND_ALLOW_DROPPED_HOSTING=1
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowOverride = process.env.BOSSMIND_ALLOW_DROPPED_HOSTING === "1";

const ENV_ALLOWLIST = new Set([
  "BOSSMIND_ALLOW_DROPPED_HOSTING",
  "BOSSMIND_ALLOW_VERCEL",
]);

const TEXT_EXT = new Set([
  ".md",
  ".mdc",
  ".txt",
  ".json",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".yml",
  ".yaml",
  ".env",
  ".example",
  ".ps1",
  ".sh",
]);

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "coverage",
  "dist",
  "build",
  "out",
  "windows-heal",
]);

const SKIP_FILES = new Set([
  "package-lock.json",
  "bossmind-hosting-guard.mjs",
]);

const policyOnlyPatterns = [
  /not part of .*architecture/i,
  /unless explicitly reapproved/i,
  /do not .*vercel/i,
  /never propose .*vercel/i,
  /\bdropped\b/i,
  /never wire/i,
  /Squarespace stays live/i,
];

const forbiddenPatterns = [
  /deploy(?:ed|ment)?\s+(?:to|on)\s+vercel/i,
  /use\s+vercel/i,
  /vercel\.com/i,
  /vercel\s+cli/i,
  /\bvercel\.json\b/i,
  /\b\.vercel\b/i,
  /\bVERCEL_[A-Z0-9_]*\b/,
  /\bNEXT_PUBLIC_VERCEL_[A-Z0-9_]*\b/,
  /deploy(?:ed|ment)?\s+(?:to|on)\s+(?:cloudflare|supabase|windsurf)/i,
  /use\s+(?:cloudflare\s+pages|cloudflare\s+workers|supabase|windsurf)/i,
  /\bcloudflare\.com\/.*(?:pages|workers)/i,
  /\bsupabase\.co\b/i,
  /\bwindsurf\b/i,
  /\bSUPABASE_[A-Z0-9_]*\b/,
  /\bNEXT_PUBLIC_SUPABASE_[A-Z0-9_]*\b/,
  /\bCLOUDFLARE_[A-Z0-9_]*\b/,
];

function shouldScanTextFile(filePath) {
  const base = path.basename(filePath);
  if (SKIP_FILES.has(base)) return false;
  const ext = path.extname(filePath);
  if (TEXT_EXT.has(ext)) return true;
  if (base.endsWith(".env.example")) return true;
  if (base.endsWith(".md")) return true;
  return false;
}

function walk(dir, acc = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(root, abs).replace(/\\/g, "/");
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(abs, acc);
      continue;
    }
    if (shouldScanTextFile(abs)) acc.push({ abs, rel });
  }
  return acc;
}

function isPolicyOnlyLine(line) {
  if (policyOnlyPatterns.some((p) => p.test(line))) return true;
  if (/SUPABASE_DATABASE_URL/.test(line) && /database|env|checkedKeys|alias/i.test(line)) return true;
  if (/windsurf/i.test(line) && /dropped|removed|never wire|do not/i.test(line)) return true;
  return false;
}

function scanFile({ abs, rel }) {
  let body = "";
  try {
    body = fs.readFileSync(abs, "utf8");
  } catch {
    return [];
  }
  const findings = [];
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || isPolicyOnlyLine(line)) continue;
    for (const p of forbiddenPatterns) {
      if (p.test(line)) {
        findings.push({
          file: rel,
          line: i + 1,
          text: line.trim(),
          pattern: String(p),
        });
      }
    }
  }
  return findings;
}

function fail(msg, findings = []) {
  console.error(`bossmind-hosting-guard: ${msg}`);
  for (const f of findings.slice(0, 50)) {
    console.error(`  - ${f.file}:${f.line} -> ${f.text}`);
  }
  process.exit(1);
}

if (allowOverride) {
  console.log("bossmind-hosting-guard: BOSSMIND_ALLOW_DROPPED_HOSTING=1 override active.");
  process.exit(0);
}

const DROPPED_ENV_RE = /^(VERCEL|SUPABASE|CLOUDFLARE|WINDSURF)_/i;
const badEnv = Object.keys(process.env).filter(
  (k) => DROPPED_ENV_RE.test(k) && !ENV_ALLOWLIST.has(k)
);
if (badEnv.length) {
  fail(`blocked dropped-provider env keys detected: ${badEnv.join(", ")}`);
}

const files = walk(root);
const findings = files.flatMap(scanFile);
if (findings.length) {
  fail("blocked dropped-provider deployment/config guidance detected.", findings);
}

console.log(
  "bossmind-hosting-guard: ok (Render/Railway/Neon + Squarespace live; Cloudflare/Vercel/Supabase/Windsurf dropped)."
);
process.exit(0);

