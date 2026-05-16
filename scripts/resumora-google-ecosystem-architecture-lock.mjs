#!/usr/bin/env node
/**
 * Neon audit lock for last Google ecosystem audit report (hash + summary).
 *
 *   npm run resumora:google:ecosystem:arch-lock -- --i-understand-dashboard-gaps --notes="Q2-2026 reviewed"
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function arg(name, def = "") {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(`--${name}=`.length).trim();
  return def;
}

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

function newestReportPath() {
  const dir = join(root, "windows-heal", "reports");
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("resumora-google-ecosystem-audit-") && f.endsWith(".json"));
  if (!files.length) return null;
  files.sort();
  return join(dir, files[files.length - 1]);
}

async function main() {
  require(join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

  if (!hasFlag("i-understand-dashboard-gaps")) {
    console.error(
      "Refusing: add --i-understand-dashboard-gaps (GSC/GA4/Ads dashboards still required; this locks last JSON report only)."
    );
    process.exit(1);
  }

  const reportPath = newestReportPath();
  if (!reportPath) {
    console.error("No resumora-google-ecosystem-audit-*.json in windows-heal/reports — run npm run resumora:google:ecosystem:audit first.");
    process.exit(1);
  }

  const raw = fs.readFileSync(reportPath, "utf8");
  const report = JSON.parse(raw);
  const hash = sha256Hex(raw);
  const notes = arg("notes", "").slice(0, 2000);

  const neon = require(join(root, "lib/shared/neon-memory.js"));
  await neon.ensureSharedMemoryInitialized().catch(() => {});
  if (!neon.getSqlClient()) {
    console.log(JSON.stringify({ ok: false, skipped: true, reason: "NEON_DATABASE_URL not set" }, null, 2));
    process.exit(0);
  }

  const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
  const confirmedAt = new Date().toISOString();
  const taskKey = "bossmind:google_marketing_ecosystem_audit";
  const checkpointKey = "resumora_google_marketing_infrastructure";

  const payload = {
    reportFile: reportPath.replace(/\\/g, "/"),
    reportSha256: hash,
    scoring: report.scoring || {},
    servicesStatus: Object.fromEntries(
      Object.entries(report.services || {}).map(([k, v]) => [k, v?.status])
    ),
    notes,
    confirmedAt,
    source: "resumora-google-ecosystem-architecture-lock",
  };

  await neon.upsertTaskState({
    projectKey,
    taskKey,
    status: "verified",
    assignedAgent: process.env.BOSSMIND_ASSIGNED_AGENT || "operator",
    payload,
  });

  await neon.saveEvent({
    projectKey,
    eventType: "resumora.google_marketing_infrastructure_locked",
    severity: "info",
    source: "resumora-google-ecosystem-architecture-lock",
    eventKey: `google_mkt:${confirmedAt}`,
    payload,
  });

  await neon.upsertLastConfirmedCheckpoint({
    projectKey,
    checkpointKey,
    commitHash:
      process.env.GITHUB_SHA ||
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.RENDER_GIT_COMMIT ||
      "",
    baselineHash: hash,
    payload: { taskKey, reportFile: payload.reportFile },
    source: "resumora-google-ecosystem-architecture-lock",
    locked: true,
  });

  console.log(JSON.stringify({ ok: true, taskKey, checkpointKey, payload }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
