#!/usr/bin/env node
/**
 * Push hub-merged env keys to GitHub Actions secrets (never prints values).
 * Enables render-env-sync workflow after RENDER_API_KEY is added to GitHub or .env.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { HUB_ENV_SOURCES } = require(path.join(root, "lib/shared/hub-env-sources.js"));
const { parseEnvContent } = require(path.join(root, "lib/shared/load-project-env.js"));

const REPO = process.env.BOSSMIND_GITHUB_REPO || "ahmadlatifdev/bossmind-resumora";
const KEYS = [
  "NEON_DATABASE_URL",
  "DATABASE_URL",
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PRICE_BASIC",
  "NEXT_PUBLIC_STRIPE_PRICE_PRO",
  "NEXT_PUBLIC_STRIPE_PRICE_ELITE",
  "NEXT_PUBLIC_STRIPE_PRICE_ESSENTIAL_ADVANCED",
  "RENDER_API_KEY",
  "RENDER_SERVICE_ID",
];

function mergeEnv() {
  let merged = {};
  for (const src of HUB_ENV_SOURCES) {
    if (fs.existsSync(src)) merged = { ...merged, ...parseEnvContent(fs.readFileSync(src, "utf8")) };
  }
  for (const local of [".env.local", ".env"]) {
    const p = path.join(root, local);
    if (fs.existsSync(p)) merged = { ...merged, ...parseEnvContent(fs.readFileSync(p, "utf8")) };
  }
  const neon =
    merged.NEON_DATABASE_URL ||
    merged.DATABASE_URL ||
    merged.BOSSMIND_DATABASE_URL ||
    merged.NEON_DB ||
    "";
  if (neon) {
    merged.NEON_DATABASE_URL = neon;
    merged.DATABASE_URL = neon;
  }
  return merged;
}

function ghSecretSet(key, value) {
  const r = spawnSync("gh", ["secret", "set", key, "-R", REPO, "-b", value], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return { key, ok: r.status === 0, status: r.status, stderr: r.stderr?.slice(0, 200) };
}

const merged = mergeEnv();
const results = [];
for (const key of KEYS) {
  const val = merged[key] || "";
  if (!val) {
    results.push({ key, skipped: true });
    continue;
  }
  results.push(ghSecretSet(key, val));
}

console.log(
  JSON.stringify(
    {
      ok: results.some((r) => r.ok),
      repo: REPO,
      results,
      hint: "Then run: gh workflow run render-env-sync.yml -R " + REPO,
    },
    null,
    2
  )
);

process.exit(results.some((r) => r.ok) ? 0 : 2);
