#!/usr/bin/env node
/**
 * Scan Chrome profiles for Stripe session artifacts (read-only).
 * node scripts/bossmind-stripe-profile-scan.mjs [--profile-dir="C:\...\Profile 1"]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const require = createRequire(import.meta.url);

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length) : "";
}

function countStripeCookies(cookiesPath) {
  if (!fs.existsSync(cookiesPath)) return { count: 0, error: "missing" };
  try {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(cookiesPath, { readOnly: true });
    const row = db
      .prepare("SELECT COUNT(*) AS c FROM cookies WHERE host_key LIKE '%stripe%'")
      .get();
    db.close();
    return { count: Number(row?.c || 0) };
  } catch (e) {
    return { count: -1, error: e.message };
  }
}

function scanStorageArtifacts(profileDir, roots) {
  const hits = [];
  let removedCandidates = 0;
  for (const rootName of roots) {
    const root = path.join(profileDir, rootName);
    if (!fs.existsSync(root)) continue;
    const walk = (dir, depth = 0) => {
      if (depth > 8) return;
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (/stripe/i.test(ent.name)) {
          hits.push(full.replace(/\\/g, "/"));
          removedCandidates += 1;
        }
        if (ent.isDirectory()) walk(full, depth + 1);
      }
    };
    walk(root);
  }
  return { hits: hits.slice(0, 50), hitCount: hits.length, removedCandidates };
}

function scanPreferences(profileDir) {
  const prefPath = path.join(profileDir, "Preferences");
  if (!fs.existsSync(prefPath)) return {};
  try {
    const prefs = JSON.parse(fs.readFileSync(prefPath, "utf8"));
    const blockThirdParty =
      prefs?.profile?.content_settings?.exceptions?.cookies ||
      prefs?.profile?.default_content_setting_values?.cookies;
    const extensions = prefs?.extensions?.settings || {};
    const extCount = Object.keys(extensions).length;
    return {
      extensionCount: extCount,
      thirdPartyCookiesRestricted: blockThirdParty === 1 || blockThirdParty === 2,
    };
  } catch {
    return {};
  }
}

function main() {
  const profileDir = arg("profile-dir");
  if (!profileDir) {
    console.error("Missing --profile-dir=");
    process.exit(1);
  }
  const configPath = path.join(__dirname, "..", "config", "bossmind-stripe-session-recovery.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const cookies = fs.existsSync(path.join(profileDir, "Network", "Cookies"))
    ? path.join(profileDir, "Network", "Cookies")
    : path.join(profileDir, "Cookies");
  const out = {
    profileDir: profileDir.replace(/\\/g, "/"),
    cookies: countStripeCookies(cookies),
    storage: scanStorageArtifacts(profileDir, config.storageGlobRoots || []),
    preferences: scanPreferences(profileDir),
  };
  console.log(JSON.stringify(out));
}

main();
