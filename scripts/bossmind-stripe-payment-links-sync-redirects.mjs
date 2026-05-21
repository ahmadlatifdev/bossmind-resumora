#!/usr/bin/env node
/**
 * Sync Stripe payment link after_completion → /studio (no full reprovision).
 * npm run bossmind:stripe:payment-links:sync-redirects
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

const { syncPaymentLinkRedirects } = require(path.join(
  root,
  "lib/marketing/stripe-payment-links-engine.js"
));

const result = await syncPaymentLinkRedirects({ cwd: root, force: true });
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
