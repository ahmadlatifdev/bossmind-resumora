#!/usr/bin/env node
/**
 * Scan repo + optional Stripe catalog for forbidden brand variants.
 * npm run bossmind:brand:authority:scan
 * npm run bossmind:brand:authority:scan -- --stripe
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function hasFlag(n) {
  return process.argv.includes(`--${n}`);
}

async function main() {
  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const { loadBrandAuthority, scanDirectory } = require(path.join(
    root,
    "lib/marketing/bossmind-brand-authority.js"
  ));
  const config = loadBrandAuthority(root);
  const repoIssues = scanDirectory(root, config.scanPaths || [], config);

  let stripe = null;
  if (hasFlag("stripe")) {
    const { buildCatalogReport } = require(path.join(root, "lib/marketing/stripe-brand-sync.js"));
    stripe = await buildCatalogReport({ cwd: root });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    officialBrand: config.officialBrand,
    repoIssues,
    repoOk: repoIssues.length === 0,
    stripe,
    stripeOk: stripe ? (stripe.needsUpdate || []).length === 0 && (stripe.paymentLinkIssues || []).length === 0 : null,
    ok: repoIssues.length === 0 && (stripe ? stripe.ok && (stripe.needsUpdate || []).length === 0 : true),
  };

  const outDir = path.join(root, "windows-heal", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(
    outDir,
    `bossmind-brand-authority-scan-${report.generatedAt.replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");
  report.reportFile = outFile.replace(/\\/g, "/");

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
