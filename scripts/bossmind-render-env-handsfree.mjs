#!/usr/bin/env node
/**
 * Hands-free Render env repair: hub merge → Render API sync → clear-cache deploy → live verify.
 * Never prints secret values.
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

const SYNC_KEYS = [
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

const API_KEY_CANDIDATES = [
  "RENDER_API_KEY",
  "RENDER_API_TOKEN",
  "BOSSMIND_RENDER_API_KEY",
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

async function renderFetch(apiKey, pathSuffix, init = {}) {
  const res = await fetch(`https://api.render.com/v1${pathSuffix}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(60000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function resolveRenderCredentials(merged) {
  let apiKey = "";
  for (const k of API_KEY_CANDIDATES) {
    if (merged[k]) {
      apiKey = merged[k];
      break;
    }
  }
  let serviceId = merged.RENDER_SERVICE_ID || "";

  if (apiKey && !serviceId) {
    const list = await renderFetch(apiKey, "/services?limit=50");
    if (list.ok && Array.isArray(list.body)) {
      const match =
        list.body.find((s) => /resumora/i.test(s?.service?.name || s?.name || "")) ||
        list.body.find((s) => /resumora/i.test(s?.service?.slug || ""));
      serviceId = match?.service?.id || match?.id || serviceId;
    }
  }

  if (!apiKey) {
    for (const k of API_KEY_CANDIDATES) {
      const candidate = merged[k];
      if (!candidate) continue;
      const list = await renderFetch(candidate, "/services?limit=5");
      if (list.ok) {
        apiKey = candidate;
        break;
      }
    }
  }

  return { apiKey, serviceId };
}

async function putEnvVar(apiKey, serviceId, key, value) {
  const post = await renderFetch(apiKey, `/services/${serviceId}/env-vars`, {
    method: "POST",
    body: JSON.stringify({ envVar: { key, value } }),
  });
  if (post.status === 409) {
    const put = await renderFetch(
      apiKey,
      `/services/${serviceId}/env-vars/${encodeURIComponent(key)}`,
      { method: "PUT", body: JSON.stringify({ value }) }
    );
    return { key, updated: put.ok, status: put.status };
  }
  return { key, created: post.ok, status: post.status };
}

async function triggerDeploy(apiKey, serviceId) {
  return renderFetch(apiKey, `/services/${serviceId}/deploys`, {
    method: "POST",
    body: JSON.stringify({ clearCache: "clear" }),
  });
}

async function probeLive(origin) {
  const base = origin.replace(/\/$/, "");
  const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(35000) });
  const body = await health.json().catch(() => ({}));
  const register = await fetch(`${base}/api/engagement/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `handsfree-${Date.now()}@resumora.invalid`,
      password: "HandsFree123!",
      displayName: "HandsFree",
    }),
    signal: AbortSignal.timeout(35000),
  });
  const regBody = await register.json().catch(() => ({}));
  return {
    healthOk: body?.ok === true,
    databaseOk: body?.database?.ok === true,
    healthStatus: health.status,
    registerStatus: register.status,
    registerOk: register.status === 201,
    registerError: regBody?.error,
    recoveryHint: body?.recoveryHint,
  };
}

function runBootstrap() {
  return spawnSync(process.execPath, [path.join(root, "scripts/bossmind-hub-env-bootstrap.mjs")], {
    cwd: root,
    stdio: "inherit",
  });
}

async function main() {
  const origin = process.argv.find((a) => a.startsWith("--origin="))?.slice(9) || "https://www.resumora.net";
  const bootstrap = runBootstrap();
  if (bootstrap.status !== 0) process.exit(bootstrap.status ?? 1);

  const merged = mergeEnv();
  const { apiKey, serviceId } = await resolveRenderCredentials(merged);

  const report = {
    ok: false,
    origin,
    neonPresent: Boolean(merged.NEON_DATABASE_URL),
    renderApiKeyPresent: Boolean(apiKey),
    renderServiceIdPresent: Boolean(serviceId),
    syncResults: [],
    deploy: null,
    live: null,
  };

  if (!merged.NEON_DATABASE_URL) {
    console.log(JSON.stringify({ ...report, error: "no_neon_url_in_hub" }, null, 2));
    process.exit(2);
  }

  if (!apiKey || !serviceId) {
    spawnSync(process.execPath, [path.join(root, "scripts/bossmind-render-env-bundle.mjs")], {
      cwd: root,
      stdio: "inherit",
    });
    console.log(
      JSON.stringify(
        {
          ...report,
          error: "missing_render_api_credentials",
          bundlePath: path.join(root, ".bossmind/render-production-env.env"),
          hint:
            "Add RENDER_API_KEY + RENDER_SERVICE_ID to bossmind-resumora/.env (from Render Dashboard → Account → API Keys / Service ID), then re-run: npm run bossmind:render:env-handsfree",
        },
        null,
        2
      )
    );
    process.exit(3);
  }

  for (const key of SYNC_KEYS) {
    const value = merged[key] || (key === "DATABASE_URL" ? merged.NEON_DATABASE_URL : "");
    if (!value) {
      report.syncResults.push({ key, skipped: true });
      continue;
    }
    report.syncResults.push(await putEnvVar(apiKey, serviceId, key, value));
  }

  report.deploy = await triggerDeploy(apiKey, serviceId);

  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 30000));
    report.live = await probeLive(origin);
    if (report.live.databaseOk && report.live.registerOk) {
      report.ok = true;
      break;
    }
  }

  const outPath = path.join(root, "windows-heal/reports", `render-env-handsfree-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, reportPath: outPath }, null, 2));
  process.exit(report.ok ? 0 : 4);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
