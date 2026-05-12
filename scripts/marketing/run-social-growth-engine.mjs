#!/usr/bin/env node
/**
 * Unified multi-platform social growth engine:
 * - Generates bilingual queue for FB/IG/TikTok/YouTube/LinkedIn/Pinterest/X/Threads
 * - Persists bundle + publish attempts into Neon shared memory
 * - Optional webhook-based autopublish
 *
 * Usage:
 *   node scripts/marketing/run-social-growth-engine.mjs --persist-neon --autopublish
 *   node scripts/marketing/run-social-growth-engine.mjs --week=2026-W20 --dry-run
 *   node scripts/marketing/run-social-growth-engine.mjs --no-dedupe  # force publish attempts even if week already sent
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  generateUnifiedGrowthBundle,
  isoWeekId,
  persistGrowthBundle,
  runAutopublish,
} = require("../../lib/marketing/social-growth-engine");

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    weekId: isoWeekId(),
    persistNeon: false,
    autopublish: false,
    dryRun: false,
    skipDedupe: false,
  };
  for (const a of args) {
    if (a.startsWith("--week=")) out.weekId = a.split("=")[1];
    if (a === "--persist-neon") out.persistNeon = true;
    if (a === "--autopublish") out.autopublish = true;
    if (a === "--dry-run") out.dryRun = true;
    if (a === "--no-dedupe") out.skipDedupe = true;
  }
  return out;
}

function readTrendSignals() {
  const raw = process.env.SOCIAL_TREND_SIGNALS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function main() {
  const opts = parseArgs();
  const trendSignals = readTrendSignals();
  const bundle = await generateUnifiedGrowthBundle({
    weekId: opts.weekId,
    trendSignals,
  });

  const outDir = path.join(process.cwd(), ".bossmind", "campaigns", "social-growth");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${bundle.weekId}.json`), JSON.stringify(bundle, null, 2), "utf8");

  let persist = { persisted: false, reason: "skip" };
  if (opts.persistNeon) {
    persist = await persistGrowthBundle(bundle);
  }

  let publishResults = [];
  if (opts.autopublish) {
    publishResults = await runAutopublish(bundle, {
      dryRun: opts.dryRun,
      skipIfAlreadyPublished: !opts.skipDedupe,
    });
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        weekId: bundle.weekId,
        queueSize: bundle.queue.length,
        persist,
        autopublish: opts.autopublish,
        dryRun: opts.dryRun,
        publishSummary: {
          attempted: publishResults.length,
          ok: publishResults.filter((r) => r.ok).length,
          skipped: publishResults.filter((r) => r.skipped).length,
          failed: publishResults.filter((r) => !r.ok && !r.skipped).length,
        },
      },
      null,
      2
    )
  );
  process.stdout.write("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
