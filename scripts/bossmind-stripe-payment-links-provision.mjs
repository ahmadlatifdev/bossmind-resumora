#!/usr/bin/env node
/**
 * Provision isolated Stripe payment links (one per Resumora service/plan).
 * npm run bossmind:stripe:payment-links
 * npm run bossmind:stripe:payment-links:apply
 * npm run bossmind:stripe:payment-links:apply -- --force
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function hasFlag(n) {
  return process.argv.includes(`--${n}`);
}

async function main() {
  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const { runPaymentLinksProvision } = require(path.join(
    root,
    "lib/marketing/stripe-payment-links-engine.js"
  ));

  const result = await runPaymentLinksProvision({
    cwd: root,
    projectKey: process.env.BOSSMIND_PROJECT_KEY || "resumora",
    dryRun: !hasFlag("apply"),
    force: hasFlag("force"),
    persist: true,
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
