#!/usr/bin/env node
/**
 * After S3 IAM validation: merge AWS storage env into local + hub vaults + Render (if API key present).
 * Never logs secret values.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { HUB_ENV_SOURCES } = require(path.join(root, "lib/shared/hub-env-sources.js"));
const { parseEnvContent } = require(path.join(root, "lib/shared/load-project-env.js"));

const BUCKET = process.env.S3_BUCKET || "bossmind-resumora-uploads-377426330385";
const REGION = process.env.AWS_REGION || "us-east-1";
const STORAGE_PROFILE = process.env.AWS_STORAGE_PROFILE || "default";

const SYNC_KEYS = [
  "S3_BUCKET",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "CLIENT_DOCUMENT_STORAGE",
];

function readAwsProfile(profile) {
  const credPath = path.join(os.homedir(), ".aws", "credentials");
  if (!fs.existsSync(credPath)) return {};
  const raw = fs.readFileSync(credPath, "utf8");
  const blockRe = new RegExp(`\\[${profile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]([\\s\\S]*?)(?=\\[|$)`, "i");
  const m = raw.match(blockRe);
  if (!m) return {};
  const block = m[1];
  const access = block.match(/aws_access_key_id\s*=\s*(\S+)/i)?.[1] || "";
  const secret = block.match(/aws_secret_access_key\s*=\s*(\S+)/i)?.[1] || "";
  return { AWS_ACCESS_KEY_ID: access, AWS_SECRET_ACCESS_KEY: secret };
}

function mergeIntoFile(filePath, patch) {
  const lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").split(/\r?\n/) : [];
  const keys = new Set(Object.keys(patch));
  const out = [];
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (m && keys.has(m[1])) continue;
    out.push(line);
  }
  for (const [k, v] of Object.entries(patch)) {
    out.push(`${k}=${v}`);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${out.join("\n").replace(/\n*$/, "")}\n`, "utf8");
  return Object.keys(patch);
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

async function putRenderEnv(apiKey, serviceId, key, value) {
  const post = await renderFetch(apiKey, `/services/${serviceId}/env-vars`, {
    method: "POST",
    body: JSON.stringify({ envVar: { key, value } }),
  });
  if (post.ok) return true;
  const list = await renderFetch(apiKey, `/services/${serviceId}/env-vars?limit=100`);
  if (!list.ok || !Array.isArray(list.body)) return false;
  const row = list.body.find((r) => r?.envVar?.key === key);
  const id = row?.envVar?.id;
  if (!id) return false;
  const put = await renderFetch(apiKey, `/services/${serviceId}/env-vars/${id}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
  return put.ok;
}

function loadMergedEnv() {
  let merged = {};
  for (const src of HUB_ENV_SOURCES) {
    if (fs.existsSync(src)) merged = { ...merged, ...parseEnvContent(fs.readFileSync(src, "utf8")) };
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (v != null && String(v).trim() !== "") merged[k] = v;
  }
  return merged;
}

async function main() {
  const profileCreds = readAwsProfile(STORAGE_PROFILE);
  const patch = {
    S3_BUCKET: BUCKET,
    AWS_REGION: REGION,
    AWS_DEFAULT_REGION: REGION,
    CLIENT_DOCUMENT_STORAGE: "s3",
    ...profileCreds,
  };
  for (const k of Object.keys(patch)) {
    if (!patch[k]) delete patch[k];
  }

  const targets = [
    path.join(root, ".env.local"),
    path.join(root, ".env"),
    path.join(root, ".bossmind", "render-production-env.env"),
    path.join(process.env.BOSSMIND_HUB_ROOT || "D:/BossMind", "bossmind-shared/automation/.env.master.local"),
  ];

  const updated = {};
  for (const t of targets) {
    try {
      updated[t] = mergeIntoFile(t, patch);
    } catch (e) {
      updated[t] = { error: e.message };
    }
  }

  const merged = loadMergedEnv();
  const apiKey = merged.RENDER_API_KEY || merged.RENDER_API_TOKEN || "";
  const serviceId = merged.RENDER_SERVICE_ID || "";
  const renderResult = { attempted: false, keys: [] };
  if (apiKey && serviceId) {
    renderResult.attempted = true;
    for (const key of SYNC_KEYS) {
      if (!patch[key]) continue;
      const ok = await putRenderEnv(apiKey, serviceId, key, patch[key]);
      renderResult.keys.push({ key, ok });
    }
  } else {
    renderResult.hint = "Set RENDER_API_KEY + RENDER_SERVICE_ID to sync Render automatically";
  }

  const report = {
    timestamp: new Date().toISOString(),
    bucket: BUCKET,
    region: REGION,
    localFilesUpdated: Object.keys(updated).filter((k) => !updated[k]?.error),
    render: renderResult,
    keysPatched: Object.keys(patch).filter((k) => !k.includes("SECRET")),
  };

  const reportPath = path.join(root, "windows-heal", "reports", "aws-storage-env-sync.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  return renderResult.attempted && renderResult.keys.some((k) => !k.ok) ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
