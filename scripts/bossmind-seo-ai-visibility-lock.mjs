#!/usr/bin/env node
/**
 * Lock confirmed BossMind SEO + AI visibility stack state into Neon (audit only).
 * Does not verify SE Ranking / GSC dashboards — run after operator + deploy checks.
 *
 *   node scripts/bossmind-seo-ai-visibility-lock.mjs --i-understand-external-ops-manual --notes="Stack v1 + Render env complete"
 *
 * Optional: --audit-json=windows-heal/reports/bossmind-seo-ai-visibility-audit.json
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

  if (!hasFlag("i-understand-external-ops-manual")) {
    console.error(
      "bossmind-seo-ai-visibility-lock: refusing without --i-understand-external-ops-manual (Neon audit only; SE Ranking / GSC / Bing dashboards are external)."
    );
    process.exit(1);
  }

  const neon = require(join(root, "lib/shared/neon-memory.js"));
  const auditLib = require(join(root, "lib/marketing/bossmind-seo-visibility-audit-lib.js"));
  await neon.ensureSharedMemoryInitialized().catch(() => {});

  if (!neon.getSqlClient()) {
    console.log(JSON.stringify({ ok: false, skipped: true, reason: "NEON_DATABASE_URL not set" }, null, 2));
    process.exit(0);
  }

  const stackPath = join(root, "config", "bossmind-seo-ai-visibility-stack.json");
  const rawStack = fs.readFileSync(stackPath, "utf8");
  const stackSha = auditLib.sha256Hex(rawStack);
  const stack = JSON.parse(rawStack);

  const notes = arg("notes", "").slice(0, 2000);
  const auditJsonPath = arg("audit-json", "");
  let auditSummary = null;
  if (auditJsonPath) {
    try {
      const p = join(root, auditJsonPath.replace(/^[/\\]+/, ""));
      const aj = JSON.parse(fs.readFileSync(p, "utf8"));
      auditSummary = {
        visibilityScore: aj.visibilityScore,
        generatedAt: aj.generatedAt,
        issueCount: Array.isArray(aj.issues) ? aj.issues.length : 0,
      };
    } catch (e) {
      auditSummary = { error: String(e && e.message ? e.message : e) };
    }
  }

  const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
  const confirmedAt = new Date().toISOString();
  const checkpointKey = "bossmind_seo_ai_visibility_stack_locked";

  const payload = {
    stackVersion: stack.version,
    stackSha256: stackSha,
    notes,
    confirmedAt,
    source: "bossmind-seo-ai-visibility-lock",
    auditSummary,
  };

  await neon.upsertTaskState({
    projectKey,
    taskKey: "seo_ai_visibility:bossmind_stack",
    status: "verified",
    assignedAgent: process.env.BOSSMIND_ASSIGNED_AGENT || "operator",
    payload,
  });

  await neon.saveEvent({
    projectKey,
    eventType: "bossmind_seo_ai_visibility_locked",
    severity: "info",
    source: "bossmind-seo-ai-visibility-lock",
    eventKey: `seo_ai_lock:${confirmedAt}`,
    payload,
  });

  await neon.upsertLastConfirmedCheckpoint({
    projectKey,
    checkpointKey,
    commitHash: process.env.GITHUB_SHA || "",
    baselineHash: stackSha,
    payload,
    source: "bossmind-seo-ai-visibility-lock",
    locked: true,
  });

  console.log(JSON.stringify({ ok: true, checkpointKey, payload }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error("bossmind-seo-ai-visibility-lock:", e);
  process.exit(1);
});
