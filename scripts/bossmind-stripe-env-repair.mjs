#!/usr/bin/env node
/**
 * Repair corrupted Stripe env scalars + sync price IDs from payment-links lock.
 * Never prints secret values.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const hubRoot = process.env.BOSSMIND_HUB_ROOT || "D:/BossMind";
const { HUB_ENV_SOURCES } = require(path.join(root, "lib/shared/hub-env-sources.js"));
const { extractValidPublishableKey } = require(path.join(root, "lib/marketing/stripe-key-format.js"));
const { parseEnvContent } = require(path.join(root, "lib/shared/load-project-env.js"));
const { CANONICAL_PRICE_ENV } = require(path.join(root, "lib/marketing/stripe-plan-map.js"));
const { priceIdsFromLock } = require(path.join(root, "lib/marketing/stripe-price-lock.js"));

const TARGETS = [
  path.join(root, ".env.local"),
  path.join(hubRoot, "bossmind-shared/automation/.env.master.local"),
];

function upsert(filePath, key, value) {
  if (!value) return false;
  let lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").split(/\r?\n/) : [];
  let found = false;
  const out = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) {
    if (out.length && out[out.length - 1] !== "") out.push("");
    out.push(`${key}=${value}`);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, out.join("\n").replace(/\n*$/, "\n"));
  return true;
}

function mergeHub() {
  let m = {};
  for (const src of HUB_ENV_SOURCES) {
    if (!fs.existsSync(src)) continue;
    m = { ...m, ...parseEnvContent(fs.readFileSync(src, "utf8")) };
  }
  return m;
}

const merged = mergeHub();
const lockPrices = priceIdsFromLock();
const repairs = [];

const pk = extractValidPublishableKey(merged.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");
if (pk) {
  for (const t of TARGETS) {
    if (upsert(t, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", pk)) repairs.push({ key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", file: t });
  }
}

const wh = String(merged.STRIPE_WEBHOOK_SECRET || "").trim();
if (/^whsec_[A-Za-z0-9_]+$/.test(wh)) {
  for (const t of TARGETS) {
    if (upsert(t, "STRIPE_WEBHOOK_SECRET", wh)) repairs.push({ key: "STRIPE_WEBHOOK_SECRET", file: t });
  }
}

if (merged.STRIPE_SECRET_KEY && /^sk_(test|live)_/.test(String(merged.STRIPE_SECRET_KEY).replace(/\s/g, ""))) {
  const sk = String(merged.STRIPE_SECRET_KEY).replace(/\s/g, "").match(/sk_(?:test|live)_[A-Za-z0-9_]+/)?.[0];
  if (sk) {
    for (const t of TARGETS) {
      if (upsert(t, "STRIPE_SECRET_KEY", sk)) repairs.push({ key: "STRIPE_SECRET_KEY", file: t });
    }
  }
}

for (const [planId, envKey] of Object.entries(CANONICAL_PRICE_ENV)) {
  const priceId = lockPrices[planId];
  if (!priceId) continue;
  for (const t of TARGETS) {
    if (upsert(t, envKey, priceId)) repairs.push({ key: envKey, planId, file: t });
  }
}

const { auditStripeProductionState } = require(path.join(root, "lib/marketing/stripe-env-audit.js"));
require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
const audit = auditStripeProductionState();

console.log(
  JSON.stringify(
    {
      ok: audit.checkoutReady,
      repairs: repairs.length,
      checkoutReady: audit.checkoutReady,
      financialPipelineReady: audit.financialPipelineReady,
      priceIds: audit.priceIds,
    },
    null,
    2
  )
);
process.exit(audit.checkoutReady ? 0 : 2);
