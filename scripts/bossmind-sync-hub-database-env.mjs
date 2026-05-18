#!/usr/bin/env node
/**
 * Copy NEON_DATABASE_URL from BossMind hub .env into this repo's .env.local (never prints values).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, ".env.local");
const sources = [
  "D:/BossMind/bossmind-resumora/.env",
  "D:/BossMind/02-resumora/.env.local",
  "D:/BossMind/bossmind-shared/.env.master",
];

function readNeonUrl() {
  for (const p of sources) {
    if (!fs.existsSync(p)) continue;
    const t = fs.readFileSync(p, "utf8");
    const m =
      t.match(/^NEON_DATABASE_URL=(.+)$/m) || t.match(/^DATABASE_URL=(postgres.+)$/m);
    if (m) return { url: m[1].trim().replace(/^['"]|['"]$/g, ""), source: p };
  }
  return null;
}

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

const found = readNeonUrl();
if (!found) {
  console.error(JSON.stringify({ ok: false, reason: "no_neon_url_in_hub" }));
  process.exit(1);
}

upsertEnvLine(target, "NEON_DATABASE_URL", found.url);
console.log(JSON.stringify({ ok: true, target: ".env.local", source: found.source, key: "NEON_DATABASE_URL" }));
