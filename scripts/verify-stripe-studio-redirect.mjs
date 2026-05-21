#!/usr/bin/env node
/** Assert checkout success_url targets /studio with session_id placeholder. */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

const { getStudioCheckoutSuccessUrl } = require(path.join(root, "lib/marketing/stripe-checkout-urls.js"));

const url = getStudioCheckoutSuccessUrl();
const ok =
  url.includes("/studio?checkout=success") && url.includes("session_id={CHECKOUT_SESSION_ID}");

console.log(JSON.stringify({ ok, successUrl: url }, null, 2));
process.exit(ok ? 0 : 1);
