#!/usr/bin/env node
/**
 * Sync Stripe product catalog to Resumora brand authority.
 * npm run bossmind:stripe:brand-sync           # dry-run
 * npm run bossmind:stripe:brand-sync -- --apply
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function hasFlag(n) {
  return process.argv.includes(`--${n}`);
}

async function main() {
  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const { applyStripeBrandSync } = require(path.join(root, "lib/marketing/stripe-brand-sync.js"));
  const apply = hasFlag("apply");
  const result = await applyStripeBrandSync({ cwd: root, dryRun: !apply });

  const outDir = path.join(root, "windows-heal", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `stripe-brand-sync-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
  result.reportFile = outFile.replace(/\\/g, "/");

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
