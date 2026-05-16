#!/usr/bin/env node
/**
 * Resumora Google ecosystem audit — marketing, analytics, SEO, email auth, optional PageSpeed.
 *
 *   npm run resumora:google:ecosystem:audit
 *   npm run resumora:google:ecosystem:audit -- --origin=https://resumora.net
 *   npm run resumora:google:ecosystem:audit -- --persist-neon
 *
 * Optional: GOOGLE_PAGESPEED_API_KEY for Lighthouse scores via PageSpeed Insights API.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, def = "") {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(`--${name}=`.length).trim();
  return def;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  try {
    require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  } catch {
    /* optional */
  }

  const { runResumoraGoogleEcosystemAudit } = require(path.join(
    root,
    "lib/marketing/resumora-google-ecosystem-audit-lib.js"
  ));

  const origin = arg("origin", process.env.RESUMORA_GOOGLE_AUDIT_ORIGIN || "https://resumora.net");
  const report = await runResumoraGoogleEcosystemAudit({ root, origin });

  const outDir = path.join(root, "windows-heal", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `resumora-google-ecosystem-audit-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");
  report.reportFile = outFile.replace(/\\/g, "/");

  if (hasFlag("persist-neon")) {
    const neon = require(path.join(root, "lib/shared/neon-memory.js"));
    await neon.ensureSharedMemoryInitialized().catch(() => {});
    if (!neon.getSqlClient()) {
      report.neonPersist = { skipped: true, reason: "NEON_DATABASE_URL unset" };
    } else {
      const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
      const sev = report.scoring?.overallGoogleEcosystemReadinessPercent < 50 ? "warning" : "info";
      await neon.saveEvent({
        projectKey,
        eventType: "resumora.google_ecosystem_audit",
        severity: sev,
        source: "resumora-google-ecosystem-audit",
        eventKey: `google_eco:${report.generatedAt}`,
        payload: {
          scoring: report.scoring,
          liveHtmlSignals: report.liveHtmlSignals,
          services: report.services,
          reportFile: report.reportFile,
        },
      });
      report.neonPersist = { ok: true };
    }
  }

  console.log(JSON.stringify(report, null, 2));

  const anyFail = Object.values(report.services || {}).some((s) => s && s.status === "FAIL");
  process.exit(anyFail ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
