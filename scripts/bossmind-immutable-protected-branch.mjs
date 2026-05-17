#!/usr/bin/env node
/**
 * Create/update resumora-production-locked branch from current HEAD (protected production snapshot).
 *   npm run bossmind:immutable:protected-branch
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { loadExecutionConfig } = require(path.join(root, "lib/orchestration/bossmind-immutable-execution-chain.js"));

const branch = loadExecutionConfig(root).protectedBranch || "resumora-production-locked";
const head = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();

try {
  execSync(`git branch -f ${branch} ${head}`, { cwd: root, stdio: "pipe" });
} catch {
  execSync(`git branch ${branch} ${head}`, { cwd: root, stdio: "pipe" });
}

console.log(JSON.stringify({ branch, head, message: `Branch ${branch} points to ${head}` }, null, 2));
