#!/usr/bin/env node
/**
 * BossMind SEO + AI visibility audit (Resumora live checks + stack manifest).
 * Does not connect SE Ranking, NeuronWriter, LowFruits, or OAuth Google/Bing APIs.
 *
 *   node scripts/bossmind-seo-ai-visibility-audit.mjs
 *   node scripts/bossmind-seo-ai-visibility-audit.mjs --json-out=windows-heal/reports/bossmind-seo-ai-visibility-audit.json
 *   node scripts/bossmind-seo-ai-visibility-audit.mjs --persist-neon
 *   node scripts/bossmind-seo-ai-visibility-audit.mjs --auto-fix-safe
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

function ensureEnvExampleSafeBlock() {
  const p = join(root, ".env.example");
  if (!fs.existsSync(p)) return { ok: false, reason: "no .env.example" };
  const text = fs.readFileSync(p, "utf8");
  if (text.includes("NEXT_PUBLIC_CLARITY_PROJECT_ID")) return { ok: true, skipped: true };
  const block = `

# --- Microsoft Clarity (optional — see pages/_document.js) ---
# NEXT_PUBLIC_CLARITY_PROJECT_ID=
# --- Bing Webmaster (optional — see pages/_document.js) ---
# NEXT_PUBLIC_BING_SITE_VERIFICATION=
`;
  fs.appendFileSync(p, block, "utf8");
  return { ok: true, appended: true };
}

async function main() {
  require(join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const { runBossMindSeoAiVisibilityAudit } = require(join(root, "lib/marketing/bossmind-seo-visibility-audit-lib.js"));

  if (hasFlag("auto-fix-safe")) {
    const fix = ensureEnvExampleSafeBlock();
    console.error(JSON.stringify({ autoFixSafe: fix }, null, 2));
  }

  const report = await runBossMindSeoAiVisibilityAudit({ root });

  const jsonOut = arg("json-out", "");
  if (jsonOut) {
    const outPath = join(root, jsonOut.replace(/^[/\\]+/, ""));
    fs.mkdirSync(dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
    console.error(`Wrote ${outPath}`);
  }

  if (hasFlag("persist-neon")) {
    const neon = require(join(root, "lib/shared/neon-memory.js"));
    await neon.ensureSharedMemoryInitialized().catch(() => {});
    if (!neon.getSqlClient()) {
      console.error(JSON.stringify({ ok: false, skipped: true, reason: "NEON_DATABASE_URL not set" }, null, 2));
    } else {
      const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
      await neon.saveEvent({
        projectKey,
        eventType: "bossmind_seo_ai_visibility_audit",
        severity: report.visibilityScore < 60 ? "warning" : "info",
        source: "bossmind-seo-ai-visibility-audit",
        eventKey: `seo_ai_vis:${report.generatedAt}`,
        payload: {
          visibilityScore: report.visibilityScore,
          stackSha256: report.stackSha256,
          issues: report.issues,
          origin: report.origin,
        },
      });
      console.error(JSON.stringify({ ok: true, neonEvent: "bossmind_seo_ai_visibility_audit" }, null, 2));
    }
  }

  console.log(JSON.stringify(report, null, 2));

  if (hasFlag("fail-below") && report.visibilityScore < Number(arg("fail-below", "60"))) {
    process.exit(2);
  }
  if (report.issues.length > 3 && hasFlag("strict")) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("bossmind-seo-ai-visibility-audit:", e);
  process.exit(1);
});
