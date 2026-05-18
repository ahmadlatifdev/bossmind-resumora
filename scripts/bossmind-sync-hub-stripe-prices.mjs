#!/usr/bin/env node
/**
 * Sync NEXT_PUBLIC_STRIPE_PRICE_* from config/resumora-stripe-payment-links-lock.json
 * into .env.local (never prints secret values).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, ".env.local");
const lockPath = path.join(root, "config/resumora-stripe-payment-links-lock.json");

const PLAN_ENV = {
  basic: "NEXT_PUBLIC_STRIPE_PRICE_BASIC",
  professional: "NEXT_PUBLIC_STRIPE_PRICE_PRO",
  elite: "NEXT_PUBLIC_STRIPE_PRICE_ELITE",
  essential_advanced: "NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL_ADVANCED",
};

function upsertEnvLine(filePath, key, value) {
  let lines = [];
  if (fs.existsSync(filePath)) {
    lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  }
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
  fs.writeFileSync(filePath, out.join("\n").replace(/\n*$/, "\n"));
}

const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const synced = [];
for (const svc of lock.services || []) {
  const planId = (svc.planIds || [])[0];
  const envKey = PLAN_ENV[planId];
  if (!envKey || !svc.priceId) continue;
  upsertEnvLine(target, envKey, svc.priceId);
  synced.push({ planId, envKey, present: true });
}

console.log(JSON.stringify({ ok: synced.length > 0, synced, target: ".env.local" }, null, 2));
process.exit(synced.length ? 0 : 1);
