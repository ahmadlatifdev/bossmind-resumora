#!/usr/bin/env node
/**
 * Merge BossMind hub env → bossmind-resumora/.env + .env.local (never prints secrets).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { HUB_ENV_SOURCES } = require(path.join(root, "lib/shared/hub-env-sources.js"));
const { parseEnvContent } = require(path.join(root, "lib/shared/load-project-env.js"));

function mergeAll() {
  let merged = {};
  const loaded = [];
  for (const src of HUB_ENV_SOURCES) {
    if (!fs.existsSync(src)) continue;
    merged = { ...merged, ...parseEnvContent(fs.readFileSync(src, "utf8")) };
    loaded.push(src.replace(/\\/g, "/").replace(/^.*BossMind\//, ""));
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
  return { merged, loaded };
}

function writeEnvFile(filePath, merged) {
  const lines = [
    `# BossMind hub bootstrap — ${new Date().toISOString()}`,
    `# Do not commit. Regenerate: npm run bossmind:hub-env-bootstrap`,
    "",
  ];
  for (const [k, v] of Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))) {
    if (v == null || String(v).trim() === "") continue;
    lines.push(`${k}=${v}`);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join("\n") + "\n");
}

const { merged, loaded } = mergeAll();
const repoEnv = path.join(root, ".env");
const localEnv = path.join(root, ".env.local");

writeEnvFile(repoEnv, merged);
writeEnvFile(localEnv, merged);

const checklist = [
  "NEON_DATABASE_URL",
  "DATABASE_URL",
  "STRIPE_SECRET_KEY",
  "RENDER_API_KEY",
  "RENDER_SERVICE_ID",
].map((key) => ({ key, present: Boolean(String(merged[key] || "").trim()) }));

console.log(
  JSON.stringify(
    {
      ok: checklist.find((c) => c.key === "NEON_DATABASE_URL")?.present,
      sources: loaded,
      wrote: [".env", ".env.local"],
      checklist,
    },
    null,
    2
  )
);

process.exit(checklist.find((c) => c.key === "NEON_DATABASE_URL")?.present ? 0 : 2);
