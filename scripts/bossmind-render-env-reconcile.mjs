#!/usr/bin/env node
/**
 * Compare local hub env keys vs Render service env (keys + presence only — never prints values).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { HUB_ENV_SOURCES } = require(path.join(root, "lib/shared/hub-env-sources.js"));
const KEYS = JSON.parse(
  fs.readFileSync(path.join(root, "config/render-production-required-env.json"), "utf8")
);
const allKeys = [...new Set([...KEYS.required, ...KEYS.recommended, "DATABASE_URL", "RENDER_API_KEY", "RENDER_SERVICE_ID"])];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const { parseEnvContent } = require(path.join(root, "lib/shared/load-project-env.js"));
  return parseEnvContent(fs.readFileSync(filePath, "utf8"));
}

function mergeLocal() {
  let merged = {};
  for (const src of HUB_ENV_SOURCES) merged = { ...merged, ...parseEnvFile(src) };
  const { parseEnvContent } = require(path.join(root, "lib/shared/load-project-env.js"));
  if (fs.existsSync(path.join(root, ".env.local"))) {
    merged = { ...merged, ...parseEnvContent(fs.readFileSync(path.join(root, ".env.local"), "utf8")) };
  }
  const neon = merged.NEON_DATABASE_URL || merged.DATABASE_URL || "";
  if (neon) {
    merged.NEON_DATABASE_URL = neon;
    merged.DATABASE_URL = neon;
  }
  return merged;
}

async function fetchRenderEnvKeys(apiKey, serviceId) {
  const res = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars?limit=100`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) return { ok: false, status: res.status, keys: [] };
  const body = await res.json();
  const list = Array.isArray(body) ? body : body.envVars || body.data || [];
  const keys = list.map((row) => row.envVar?.key || row.key).filter(Boolean);
  return { ok: true, keys };
}

export async function reconcileRenderEnv() {
  const merged = mergeLocal();
  const apiKey = merged.RENDER_API_KEY || "";
  const serviceId = merged.RENDER_SERVICE_ID || "";
  const local = allKeys.map((key) => ({
    key,
    present: Boolean(String(merged[key] || (key === "DATABASE_URL" ? merged.NEON_DATABASE_URL : "")).trim()),
  }));
  const missingLocal = local.filter((c) => !c.present).map((c) => c.key);

  if (!apiKey || !serviceId) {
    return {
      ok: missingLocal.length === 0,
      score: Math.round(((allKeys.length - missingLocal.length) / allKeys.length) * 100),
      renderApiReady: false,
      missingLocal,
      missingOnRender: [],
      onlyOnRender: [],
      hint: "Set RENDER_API_KEY + RENDER_SERVICE_ID in .env.master.local for full reconcile",
    };
  }

  const remote = await fetchRenderEnvKeys(apiKey, serviceId);
  if (!remote.ok) {
    return { ok: false, score: 50, renderApiReady: true, remoteError: remote.status, missingLocal };
  }

  const renderSet = new Set(remote.keys);
  const missingOnRender = local.filter((c) => c.present && !renderSet.has(c.key)).map((c) => c.key);
  const onlyOnRender = remote.keys.filter((k) => !allKeys.includes(k) && /^[A-Z][A-Z0-9_]*$/.test(k));
  const aligned = missingLocal.length === 0 && missingOnRender.length === 0;
  const score = Math.round(
    ((allKeys.length - missingLocal.length - missingOnRender.length) / allKeys.length) * 100
  );

  return {
    ok: aligned,
    score: Math.min(100, Math.max(0, score)),
    renderApiReady: true,
    missingLocal,
    missingOnRender,
    onlyOnRenderCount: onlyOnRender.length,
  };
}

async function main() {
  const report = await reconcileRenderEnv();
  const outDir = path.join(root, ".bossmind", "env-reconcile");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `reconcile-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ ...report, reportPath: outPath }, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
