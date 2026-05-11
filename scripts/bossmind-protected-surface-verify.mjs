#!/usr/bin/env node
/**
 * Verifies every path in config/bossmind-protected-surface.json exists (anti-deletion / route integrity).
 * Does not prove visual regression — structural presence only.
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "config", "bossmind-protected-surface.json");

if (!existsSync(manifestPath)) {
  console.error("bossmind-protected-surface-verify: missing config/bossmind-protected-surface.json");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const paths = [...(manifest.surfaceLockPaths || []), ...(manifest.shellLockPaths || [])];
const missing = [];
for (const rel of paths) {
  const p = join(root, ...String(rel).split("/").filter(Boolean));
  if (!existsSync(p)) missing.push(rel);
}

if (missing.length) {
  console.error(
    "bossmind-protected-surface-verify: missing approved route files:\n  " + missing.join("\n  ")
  );
  process.exit(1);
}

console.log(
  `bossmind-protected-surface-verify: ok (${paths.length} modules present, project=${manifest.project || "resumora"}).`
);
process.exit(0);
