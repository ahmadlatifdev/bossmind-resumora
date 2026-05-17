#!/usr/bin/env node
/**
 * Verify provisioned payment links are public and locked.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const { verifyPaymentLinks } = require(path.join(
    root,
    "lib/marketing/stripe-payment-links-engine.js"
  ));

  const report = await verifyPaymentLinks({ cwd: root });
  const outDir = path.join(root, "windows-heal", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(
    outDir,
    `stripe-payment-links-verify-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
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
