#!/usr/bin/env node
/**
 * Google Search Console DNS verification recovery for resumora.net
 *
 *   npm run resumora:gsc:verify-recovery
 *   npm run resumora:gsc:verify-recovery -- --domain=resumora.net --wait-seconds=60
 *   npm run resumora:gsc:verify-recovery -- --preferred-token=YOUR_TOKEN_FROM_GSC
 *   npm run resumora:gsc:verify-recovery -- --lock --notes="verified after DNS cleanup"
 *
 * Optional API probe: GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN + GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET
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

  const { runGscVerificationRecovery, lockVerificationToNeon } = require(path.join(
    root,
    "lib/orchestration/resumora-gsc-verification-lib.js"
  ));

  const waitSec = Number(arg("wait-seconds", "0")) || 0;
  const report = await runGscVerificationRecovery({
    root,
    domain: arg("domain", "resumora.net"),
    origin: arg("origin", process.env.RESUMORA_GOOGLE_AUDIT_ORIGIN || "https://resumora.net"),
    preferredToken: arg("preferred-token", ""),
    waitMs: waitSec * 1000,
  });

  const outDir = path.join(root, "windows-heal", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `resumora-gsc-verification-recovery-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");
  report.reportFile = outFile.replace(/\\/g, "/");

  if (hasFlag("lock")) {
    report.neonLock = await lockVerificationToNeon(report, { notes: arg("notes", "") });
  }

  console.log(JSON.stringify(report, null, 2));

  const exitCode = report.overallStatus === "PASS" ? 0 : report.overallStatus === "WARN" ? 1 : 2;
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
