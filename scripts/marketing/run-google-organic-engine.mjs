#!/usr/bin/env node
/**
 * Google organic marketing bundle — JSON artifacts for SEO, landing, YouTube, GSC workflow.
 *
 *   node scripts/marketing/run-google-organic-engine.mjs [--week=2026-W20] [--persist-neon]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");

const {
  generateGoogleOrganicBundle,
  persistGoogleOrganicBundle,
  isoWeekId,
} = require(path.join(root, "lib/marketing/google-organic-engine.js"));

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { weekId: isoWeekId(), persistNeon: false };
  for (const a of args) {
    if (a.startsWith("--week=")) out.weekId = a.split("=")[1];
    if (a === "--persist-neon") out.persistNeon = true;
  }
  return out;
}

async function main() {
  const opts = parseArgs();
  const bundle = await generateGoogleOrganicBundle({ weekId: opts.weekId });
  const outDir = path.join(root, ".bossmind", "campaigns", "google-organic");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${bundle.weekId}.json`), JSON.stringify(bundle, null, 2), "utf8");

  let persist = { persisted: false, reason: "skip" };
  if (opts.persistNeon && bundle.enabled !== false) {
    persist = await persistGoogleOrganicBundle(bundle);
  }

  process.stdout.write(JSON.stringify({ ok: true, weekId: bundle.weekId, persist, path: path.join(outDir, `${bundle.weekId}.json`) }, null, 2));
  process.stdout.write("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
