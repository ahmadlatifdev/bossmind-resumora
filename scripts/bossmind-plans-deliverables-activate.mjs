#!/usr/bin/env node
/**
 * Validate all plans, free edits, interview prep content, and lock checkpoint.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function hasFlag(n) {
  return process.argv.includes(`--${n}`);
}
function arg(name, def = "") {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : def;
}

async function main() {
  if (hasFlag("lock") && !hasFlag("i-understand-production")) {
    console.error("Refusing lock without --i-understand-production");
    process.exit(1);
  }

  require(path.join(root, "lib/shared/ensure-project-env.js"));
  const { auditPlansRuntime } = require(path.join(root, "lib/shared/plans-runtime-sync.js"));
  const { auditFreeEditsPolicy } = require(path.join(root, "lib/client/plan-policy.js"));
  const { getInterviewPrepCatalog } = require(path.join(
    root,
    "lib/essential-advanced/interview-prep-content.js"
  ));
  const { validateVideoManifest } = require(path.join(root, "lib/essential-advanced/video-delivery.js"));

  const plans = auditPlansRuntime();
  const freeEdits = auditFreeEditsPolicy();
  const catalogEn = getInterviewPrepCatalog("en");
  const catalogFr = getInterviewPrepCatalog("fr");
  const videos = validateVideoManifest();

  const contentOk =
    catalogEn.counts.qa >= 50 &&
    catalogEn.counts.tips >= 20 &&
    catalogEn.counts.videos === 3 &&
    catalogEn.counts.downloads >= 4 &&
    catalogFr.counts.qa >= 50;

  const blockers = [];
  if (!plans.ok) blockers.push("plans_runtime_incomplete");
  if (!freeEdits.ok) blockers.push("free_edits_policy_mismatch");
  if (!contentOk) blockers.push("interview_prep_content_incomplete");
  if (!videos.ok) blockers.push("video_manifest_invalid");

  const report = {
    ok: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    plans,
    freeEdits,
    interviewPrep: {
      en: catalogEn.counts,
      fr: catalogFr.counts,
      contentOk,
    },
    videos: { ok: videos.ok, videoCount: videos.videoCount },
    blockers,
  };

  const reportsDir = path.join(root, "windows-heal/reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportsDir, `plans-deliverables-activate-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (hasFlag("lock")) {
    const neon = require(path.join(root, "lib/shared/neon-memory.js"));
    await neon.ensureEngagementSchema().catch(() => {});
    const payload = {
      lockedAt: report.generatedAt,
      memoryType: "RESUMORA_PLANS_DELIVERABLES_OPERATIONAL",
      freeEdits: freeEdits.actual,
      catalogCounts: catalogEn.counts,
      plans: plans.plans,
      notes: arg("notes", "").slice(0, 2000),
    };
    fs.writeFileSync(
      path.join(root, "config/bossmind-plans-deliverables-lock.json"),
      JSON.stringify(payload, null, 2)
    );
    if (neon.getSqlClient()) {
      try {
        await neon.upsertLastConfirmedCheckpoint({
          projectKey: process.env.BOSSMIND_PROJECT_KEY || "resumora",
          checkpointKey: "plans_deliverables_operational",
          payload,
          source: "bossmind-plans-deliverables-activate",
          locked: report.ok,
        });
      } catch (e) {
        payload.neonCheckpointSkipped = e.message;
      }
    }
  }

  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
