#!/usr/bin/env node
/**
 * Public visibility + cross-channel alignment audit for Resumora vs GBP checklist.
 * Does NOT call Google APIs. Optional Neon event_log row (--persist-neon).
 *
 *   node scripts/resumora-gbp-visibility-audit.mjs
 *   node scripts/resumora-gbp-visibility-audit.mjs --json-out=windows-heal/reports/resumora-gbp-audit.json
 *   RESUMORA_GBP_AUDIT_ORIGIN=https://staging.example node scripts/resumora-gbp-visibility-audit.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
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
  const { runVisibilityAudit } = require(join(root, "lib/marketing/resumora-gbp-audit-lib.js"));

  const report = await runVisibilityAudit({ root });

  const jsonOut = arg("json-out", "");
  if (jsonOut) {
    const p = join(root, jsonOut.replace(/^[/\\]+/, ""));
    fs.mkdirSync(dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(report, null, 2), "utf8");
    console.error(`Wrote ${p}`);
  }

  if (hasFlag("persist-neon")) {
    const neon = require(join(root, "lib/shared/neon-memory.js"));
    await neon.ensureSharedMemoryInitialized().catch(() => {});
    if (!neon.getSqlClient()) {
      console.error(JSON.stringify({ ok: false, skipped: true, reason: "NEON_DATABASE_URL not set" }, null, 2));
    } else {
      const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
      const slim = {
        ...report,
        title: report.title,
        gbpOperatorTodo: (report.gbpOperatorTodo || []).slice(0, 30),
      };
      await neon.saveEvent({
        projectKey,
        eventType: "google_business_profile_visibility_audit",
        severity: report.overallStatus === "fail" ? "warning" : "info",
        source: "resumora-gbp-visibility-audit",
        eventKey: `gbp_audit:${report.generatedAt}`,
        payload: slim,
      });
      console.error(JSON.stringify({ ok: true, neonEvent: "google_business_profile_visibility_audit" }, null, 2));
    }
  }

  console.log(JSON.stringify(report, null, 2));

  if (hasFlag("fail-on-warn") && (report.overallStatus === "warn" || report.overallStatus === "fail")) {
    process.exit(2);
  }
  if (report.overallStatus === "fail") {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("resumora-gbp-visibility-audit:", e);
  process.exit(1);
});
