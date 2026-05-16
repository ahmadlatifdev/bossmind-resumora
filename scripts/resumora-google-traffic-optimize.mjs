#!/usr/bin/env node
/**
 * Resumora Google Traffic Engine — full organic SEO orchestration.
 *
 *   npm run resumora:google-traffic:optimize
 *   npm run resumora:google-traffic:optimize -- --skip-ai
 *   npm run resumora:google-traffic:optimize -- --preferred-gsc-token=TOKEN
 *   npm run resumora:google-traffic:optimize -- --lock --notes="post DNS cleanup"
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
  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

  const { runGoogleTrafficEngine, lockGoogleTrafficEngineToNeon } = require(path.join(
    root,
    "lib/marketing/resumora-google-traffic-engine-lib.js"
  ));

  const report = await runGoogleTrafficEngine({
    root,
    origin: arg("origin", process.env.RESUMORA_GOOGLE_AUDIT_ORIGIN || "https://resumora.net"),
    weekId: arg("week", ""),
    skipAi: hasFlag("skip-ai"),
    preferredGscToken: arg("preferred-gsc-token", ""),
  });

  const outDir = path.join(root, "windows-heal", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `resumora-google-traffic-engine-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");
  report.reportFile = outFile.replace(/\\/g, "/");

  if (hasFlag("lock")) {
    report.neonLock = await lockGoogleTrafficEngineToNeon(report, { notes: arg("notes", "") });
  }

  console.log(JSON.stringify(report, null, 2));

  const v = report.validation || {};
  const allActive =
    v.searchConsoleVerified &&
    v.ga4TrackingActive &&
    v.organicAutomationActive &&
    v.organicTrafficEngineActive;
  process.exit(allActive ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
