#!/usr/bin/env node
/**
 * Write gitignored Render production env bundle for manual dashboard import.
 * Never prints secret values to stdout.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HUB = "D:/BossMind/bossmind-resumora/.env";
const LOCAL = path.join(root, ".env.local");
const OUT = path.join(root, ".bossmind/render-production-env.env");

const KEYS = [
  "NEON_DATABASE_URL",
  "DATABASE_URL",
  "PORT",
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PRICE_BASIC",
  "NEXT_PUBLIC_STRIPE_PRICE_PRO",
  "NEXT_PUBLIC_STRIPE_PRICE_ELITE",
  "NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL_ADVANCED",
  "NEXT_PUBLIC_SITE_URL",
  "BOSSMIND_PROJECT_KEY",
  "NODE_ENV",
  "RESUMORA_POST_PURCHASE_WEBHOOK_URL",
];

function parse(file) {
  if (!fs.existsSync(file)) return {};
  const { parseEnvContent } = require(path.join(root, "lib/shared/load-project-env.js"));
  return parseEnvContent(fs.readFileSync(file, "utf8"));
}

const merged = { ...parse(HUB), ...parse(LOCAL) };
for (const [k, v] of Object.entries(process.env)) {
  if (v != null && String(v).trim() !== "") merged[k] = v;
}
if (!merged.NODE_ENV) merged.NODE_ENV = "production";
if (!merged.NEXT_PUBLIC_SITE_URL) merged.NEXT_PUBLIC_SITE_URL = "https://www.resumora.net";
if (!merged.BOSSMIND_PROJECT_KEY) merged.BOSSMIND_PROJECT_KEY = "resumora";
if (!merged.DATABASE_URL && merged.NEON_DATABASE_URL) {
  merged.DATABASE_URL = merged.NEON_DATABASE_URL;
}

const lines = ["# Resumora Render production — paste into Render → Environment", "# Generated " + new Date().toISOString(), ""];
const checklist = [];
for (const key of KEYS) {
  const val = merged[key];
  checklist.push({ key, present: Boolean(val) });
  if (val) lines.push(`${key}=${val}`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join("\n") + "\n");

console.log(
  JSON.stringify(
    {
      ok: checklist.filter((c) => c.present).length >= 4,
      outPath: OUT,
      gitignored: true,
      checklist,
      hint: "Render Dashboard → resumora web service → Environment → paste from bundle file",
    },
    null,
    2
  )
);

process.exit(checklist.find((c) => c.key === "NEON_DATABASE_URL")?.present ? 0 : 2);
