#!/usr/bin/env node
/**
 * Record an operator-confirmed Google Business Profile sync checkpoint to Neon (audit only).
 * Does NOT call Google APIs or modify GBP — use after manual updates in Google Business Profile.
 *
 *   node scripts/resumora-gbp-operator-confirm.mjs --i-understand-manual-only --notes="GBP attributes updated 2026-05-14"
 *
 * Optional: --maps-url="https://www.google.com/maps?cid=..." (stored in payload only; never a secret)
 * Optional: --with-visibility-audit (fetches live site; attaches summary to Neon payload; still no Google API)
 *
 * Env: NEON_DATABASE_URL, BOSSMIND_PROJECT_KEY (default resumora)
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, def = "") {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(`--${name}=`.length).trim();
  return def;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  require(join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

  if (!hasFlag("i-understand-manual-only")) {
    console.error(
      "resumora-gbp-operator-confirm: refusing to run without --i-understand-manual-only (this script only records audit rows; GBP is edited in Google UI/API separately)."
    );
    process.exit(1);
  }

  const checklistPath = join(root, "config", "resumora-google-business-profile-checklist.json");
  const gbpAudit = require(join(root, "lib/marketing/resumora-gbp-audit-lib.js"));
  let checklistVersion = 0;
  let checklistSha256 = "";
  try {
    const raw = fs.readFileSync(checklistPath, "utf8");
    const parsed = JSON.parse(raw);
    checklistVersion = parsed.version ?? 0;
    checklistSha256 = gbpAudit.sha256Hex(raw);
  } catch {
    checklistVersion = 0;
  }

  let visibilityAudit = null;
  if (hasFlag("with-visibility-audit")) {
    visibilityAudit = await gbpAudit.runVisibilityAudit({ root });
  }

  const neon = require(join(root, "lib/shared/neon-memory.js"));
  await neon.ensureSharedMemoryInitialized().catch(() => {});

  if (!neon.getSqlClient()) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          skipped: true,
          reason: "NEON_DATABASE_URL not set — no Neon rows written.",
          checklistVersion,
          checklistSha256: checklistSha256 || undefined,
          visibilityAudit: visibilityAudit || undefined,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
  const notes = arg("notes", "").slice(0, 2000);
  const mapsUrl = arg("maps-url", arg("mapsUrl", "")).slice(0, 500);

  const payload = {
    checklistVersion,
    checklistSha256: checklistSha256 || undefined,
    notes,
    mapsUrl: mapsUrl || undefined,
    confirmedAt: new Date().toISOString(),
    source: "resumora-gbp-operator-confirm",
  };

  if (visibilityAudit) {
    payload.visibilityAudit = {
      overallStatus: visibilityAudit.overallStatus,
      checklistSha256: visibilityAudit.checklistSha256,
      generatedAt: visibilityAudit.generatedAt,
      originFinal: visibilityAudit.originFinal,
      checks: visibilityAudit.checks,
    };
  }

  const taskKey = "google_business_profile:resumora_operator_sync";

  await neon.upsertTaskState({
    projectKey,
    taskKey,
    status: "verified",
    assignedAgent: process.env.BOSSMIND_ASSIGNED_AGENT || "operator",
    payload,
  });

  await neon.saveEvent({
    projectKey,
    eventType: "google_business_profile_operator_confirmed",
    severity: "info",
    source: "resumora-gbp-operator-confirm",
    eventKey: `gbp_confirm:${payload.confirmedAt}`,
    payload,
  });

  await neon.upsertLastConfirmedCheckpoint({
    projectKey,
    checkpointKey: "google_business_profile_optimized_state",
    commitHash:
      process.env.GITHUB_SHA ||
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.RENDER_GIT_COMMIT ||
      "",
    baselineHash: checklistSha256 || "",
    payload: {
      checklistVersion,
      checklistSha256,
      taskKey,
      confirmedAt: payload.confirmedAt,
      mapsUrl: payload.mapsUrl,
      visibilityAuditSummary: visibilityAudit
        ? {
            overallStatus: visibilityAudit.overallStatus,
            originFinal: visibilityAudit.originFinal,
          }
        : undefined,
    },
    source: "resumora-gbp-operator-confirm",
    locked: true,
  });

  console.log(JSON.stringify({ ok: true, taskKey, payload }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error("resumora-gbp-operator-confirm:", e);
  process.exit(1);
});
