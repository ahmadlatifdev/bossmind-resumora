#!/usr/bin/env node
/**
 * Render production env readiness (keys only — never prints secret values).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = JSON.parse(
  fs.readFileSync(path.join(root, "config/render-production-required-env.json"), "utf8")
).required;

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    out[t.slice(0, i)] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const merged = {
  ...parseEnvFile("D:/BossMind/bossmind-resumora/.env"),
  ...parseEnvFile(path.join(root, ".env.local")),
  ...process.env,
};

const checklist = required.map((key) => ({
  key,
  present: Boolean(String(merged[key] || "").trim()),
}));

const report = {
  ok: checklist.every((c) => c.present),
  checklist,
  renderApiReady: Boolean(merged.RENDER_API_KEY && merged.RENDER_SERVICE_ID),
  applyCommand: "npm run bossmind:render:env-sync -- --apply",
  dashboard: "https://dashboard.render.com → resumora-web → Environment",
};

const outDir = path.join(root, "windows-heal/reports");
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outPath = path.join(outDir, `render-env-checklist-${stamp}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, reportPath: outPath }, null, 2));
process.exit(report.ok ? 0 : 2);
