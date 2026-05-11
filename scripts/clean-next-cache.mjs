#!/usr/bin/env node
/**
 * Removes `.next` safely (no .git / source changes). Use when localhost shows
 * stale layouts after pulling the luxury baseline or switching branches.
 */
import { rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = join(root, ".next");

if (!existsSync(nextDir)) {
  console.log("clean-next-cache: no .next folder (already clean).");
  process.exit(0);
}

rmSync(nextDir, { recursive: true, force: true });
console.log("clean-next-cache: removed .next — restart dev server (npm run dev:plain).");
