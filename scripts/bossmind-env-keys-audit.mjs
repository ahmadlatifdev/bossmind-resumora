#!/usr/bin/env node
/**
 * Secrets governance — expected KEY NAMES vs process.env presence (no values printed).
 * Source list: config/bossmind-env-structure.example.txt (comments and blanks ignored).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const examplePath = path.join(root, "config", "bossmind-env-structure.example.txt");

function loadExpectedKeys() {
  if (!fs.existsSync(examplePath)) return [];
  const text = fs.readFileSync(examplePath, "utf8");
  const keys = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    if (/^[A-Z][A-Z0-9_]*$/.test(t)) keys.push(t);
  }
  return [...new Set(keys)];
}

function main() {
  const expected = loadExpectedKeys();
  const present = [];
  const missing = [];
  for (const k of expected) {
    const v = process.env[k];
    if (v != null && String(v).trim() !== "") present.push(k);
    else missing.push(k);
  }
  const coveragePct =
    expected.length === 0 ? 100 : Math.round((present.length / expected.length) * 1000) / 10;
  const out = {
    ok: true,
    expectedCount: expected.length,
    presentCount: present.length,
    missingKeys: missing,
    coveragePercent: coveragePct,
    source: "config/bossmind-env-structure.example.txt",
  };
  if (process.env.BOSSMIND_ENV_KEYS_STRICT === "1" && missing.length > 0) {
    out.ok = false;
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

main();
