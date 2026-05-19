#!/usr/bin/env node
/**
 * Sync critical env vars from BossMind hub .env → Render service (requires API key).
 * Never prints secret values.
 *
 *   node scripts/bossmind-render-production-env-sync.mjs --dry-run
 *   node scripts/bossmind-render-production-env-sync.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_ENV = path.join(root, ".env.local");
const { HUB_ENV_SOURCES } = require(path.join(root, "lib/shared/hub-env-sources.js"));
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
  "NEXT_PUBLIC_SITE_URL",
  "BOSSMIND_PROJECT_KEY",
  "NODE_ENV",
  "RESUMORA_POST_PURCHASE_WEBHOOK_URL",
];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const { parseEnvContent } = require(path.join(root, "lib/shared/load-project-env.js"));
  return parseEnvContent(fs.readFileSync(filePath, "utf8"));
}

async function renderPutEnv(serviceId, key, value, apiKey) {
  const res = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ envVar: { key, value } }),
  });
  if (res.status === 409) {
    const patch = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value }),
    });
    return { key, status: patch.status, updated: patch.ok };
  }
  return { key, status: res.status, created: res.ok };
}

function mergeEnvSources() {
  let merged = {};
  for (const src of HUB_ENV_SOURCES) {
    merged = { ...merged, ...parseEnvFile(src) };
  }
  merged = { ...merged, ...parseEnvFile(LOCAL_ENV) };
  for (const [k, v] of Object.entries(process.env)) {
    if (v != null && String(v).trim() !== "") merged[k] = v;
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
  if (!merged.NODE_ENV) merged.NODE_ENV = "production";
  if (!merged.NEXT_PUBLIC_SITE_URL) merged.NEXT_PUBLIC_SITE_URL = "https://www.resumora.net";
  if (!merged.BOSSMIND_PROJECT_KEY) merged.BOSSMIND_PROJECT_KEY = "resumora";
  return merged;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const merged = mergeEnvSources();
  const renderKey = merged.RENDER_API_KEY || "";
  const serviceId = merged.RENDER_SERVICE_ID || "";

  const planned = [];
  for (const key of KEYS) {
    const val = merged[key] || (key === "DATABASE_URL" ? merged.NEON_DATABASE_URL : "");
    if (val) planned.push({ key, present: true });
    else planned.push({ key, present: false });
  }

  const report = {
    ok: false,
    apply,
    hubSourcesLoaded: HUB_ENV_SOURCES.filter((p) => fs.existsSync(p)).length,
    localEnvFound: fs.existsSync(LOCAL_ENV),
    renderApiKeyPresent: Boolean(renderKey),
    renderServiceIdPresent: Boolean(serviceId),
    planned,
    results: [],
  };

  if (!apply) {
    report.hint = "Re-run with --apply when RENDER_API_KEY and RENDER_SERVICE_ID are set";
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  if (!renderKey || !serviceId) {
    console.log(JSON.stringify({ ...report, error: "missing_render_credentials" }, null, 2));
    process.exit(1);
  }

  for (const key of KEYS) {
    const value = merged[key] || (key === "DATABASE_URL" ? merged.NEON_DATABASE_URL : "");
    if (!value) {
      report.results.push({ key, skipped: true, reason: "missing_in_hub" });
      continue;
    }
    report.results.push(await renderPutEnv(serviceId, key, value, renderKey));
  }

  report.ok = report.results.some((r) => r.created || r.updated);
  const outPath = path.join(root, "windows-heal", "reports", `render-env-sync-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, reportPath: outPath }, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
