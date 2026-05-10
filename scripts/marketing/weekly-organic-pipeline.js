#!/usr/bin/env node
/**
 * BossMind weekly organic marketing pipeline — stdout JSON + optional Neon event_log.
 *
 * Usage:
 *   node scripts/marketing/weekly-organic-pipeline.js [--week=2026-W19] [--enrich-ai] [--persist-neon]
 *
 * Env:
 *   NEON_DATABASE_URL — store campaign history (shared memory)
 *   DEEPSEEK_API_KEY   — optional AI hook enrichment (V3)
 */

const fs = require("fs");
const path = require("path");
const {
  buildWeeklyOrganicBundle,
  enrichWeeklyBundleWithDeepSeek,
  isoWeekId,
  persistWeeklyBundleEvent,
} = require("../../lib/marketing/weekly-organic-bundle");

function parseArgs() {
  const raw = process.argv.slice(2);
  let week = null;
  let enrichAi = false;
  let persistNeon = false;
  for (const a of raw) {
    if (a.startsWith("--week=")) week = a.split("=")[1];
    if (a === "--enrich-ai") enrichAi = true;
    if (a === "--persist-neon") persistNeon = true;
  }
  return { week: week || isoWeekId(), enrichAi, persistNeon };
}

async function main() {
  const { week, enrichAi, persistNeon } = parseArgs();
  let bundle = buildWeeklyOrganicBundle(week);
  if (enrichAi) {
    bundle = await enrichWeeklyBundleWithDeepSeek(bundle);
  }
  if (persistNeon && process.env.NEON_DATABASE_URL) {
    try {
      await persistWeeklyBundleEvent(bundle);
    } catch (e) {
      bundle.neonPersistError = e.message || String(e);
    }
  }

  const outDir = path.join(process.cwd(), ".bossmind", "campaigns");
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${bundle.weekId}.json`), JSON.stringify(bundle, null, 2), "utf8");
  } catch {
    /* optional filesystem snapshot */
  }

  process.stdout.write(JSON.stringify(bundle, null, 2));
  process.stdout.write("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
