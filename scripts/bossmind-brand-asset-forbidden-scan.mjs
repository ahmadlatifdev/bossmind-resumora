#!/usr/bin/env node
/**
 * Block legacy/duplicate logo paths and inline Image logos outside ResumoraLogo.
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { runBrandAssetVerification } = require("../lib/orchestration/bossmind-brand-asset-verify.js");

async function main() {
  const report = await runBrandAssetVerification({ probeHtml: false });
  if (report.conflicts?.length) {
    console.error("bossmind-brand-asset-forbidden-scan: FAILED");
    for (const h of report.conflicts) {
      console.error(`  ${h.file} — ${h.issue}`);
    }
    process.exit(1);
  }
  if (!report.fileOk || !report.hashOk) {
    console.error("bossmind-brand-asset-forbidden-scan: locked asset missing or hash drift");
    process.exit(1);
  }
  console.log("bossmind-brand-asset-forbidden-scan: OK");
  process.exit(0);
}

main();
