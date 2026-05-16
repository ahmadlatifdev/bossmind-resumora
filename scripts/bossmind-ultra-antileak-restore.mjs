#!/usr/bin/env node
/**
 * Restore golden anti-leak snapshot to working tree (latest confirmed healthy only).
 *
 *   npm run bossmind:ultra:antileak:restore
 *   npm run bossmind:ultra:antileak:restore -- --dry-run
 */
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const { restoreGoldenSnapshot } = require(path.join(root, "lib/orchestration/bossmind-ultra-antileak-lib.js"));
  const out = restoreGoldenSnapshot(root, { dryRun: hasFlag("dry-run") });
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
