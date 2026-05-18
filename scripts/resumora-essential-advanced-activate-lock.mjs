#!/usr/bin/env node
/**
 * Lock Essential Advanced interview studio activation to Neon + local report.
 *
 *   npm run resumora:essential-advanced:activate-lock -- --i-understand-production --notes="..."
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function arg(name, def = "") {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(`--${name}=`.length).trim();
  return def;
}

async function main() {
  if (!hasFlag("i-understand-production")) {
    console.error("Refusing: add --i-understand-production");
    process.exit(1);
  }

  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const config = JSON.parse(
    fs.readFileSync(path.join(root, "config/resumora-essential-advanced-plan.json"), "utf8")
  );
  const { getInterviewPrepCatalog } = require(path.join(
    root,
    "lib/essential-advanced/interview-prep-content.js"
  ));

  const catalog = getInterviewPrepCatalog("en");
  const payload = {
    lockedAt: new Date().toISOString(),
    memoryType: "ESSENTIAL_ADVANCED_INTERVIEW_STUDIO_ACTIVE",
    planId: "essential_advanced",
    priceUsd: config.priceUsd,
    deliverables: config.deliverables,
    catalogCounts: catalog.counts,
    studioPath: "/studio/essential-advanced",
    pricingWhatsIncluded: true,
    notes: arg("notes", "").slice(0, 2000),
  };

  const reportsDir = path.join(root, "windows-heal", "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportsDir, `essential-advanced-activate-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2));

  const neon = require(path.join(root, "lib/shared/neon-memory.js"));
  await neon.ensureEngagementSchema().catch(() => {});
  const sql = neon.getSqlClient();

  if (sql) {
    const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
    try {
      await neon.upsertLastConfirmedCheckpoint({
        projectKey,
        checkpointKey: "essential_advanced_interview_studio",
        payload,
        source: "resumora-essential-advanced-activate-lock",
        locked: true,
      });
    } catch (e) {
      payload.neonCheckpointSkipped = e.message;
    }
    try {
      await neon.saveEvent({
        projectKey,
        eventType: "essential_advanced.interview_studio.active",
        severity: "info",
        source: "resumora-essential-advanced-activate-lock",
        payload: { reportPath, counts: catalog.counts },
      });
    } catch {
      /* legacy event_log schema */
    }
  }

  console.log(JSON.stringify({ ok: true, reportPath, payload }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
