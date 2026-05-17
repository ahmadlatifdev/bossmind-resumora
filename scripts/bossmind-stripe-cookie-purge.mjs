#!/usr/bin/env node
/**
 * Purge Stripe-related rows from Chrome Cookies SQLite (Chrome must be closed).
 * Usage: node scripts/bossmind-stripe-cookie-purge.mjs --cookies="C:\...\Cookies"
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length) : "";
}

function purgeWithNodeSqlite(cookiesPath) {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require("node:sqlite"));
  } catch {
    return { ok: false, error: "node_sqlite_unavailable" };
  }
  if (!fs.existsSync(cookiesPath)) return { ok: true, removed: 0, note: "no_cookies_file" };
  const db = new DatabaseSync(cookiesPath, { readOnly: false });
  const before = db
    .prepare("SELECT COUNT(*) AS c FROM cookies WHERE host_key LIKE '%stripe%'")
    .get();
  db.exec(
    "DELETE FROM cookies WHERE host_key LIKE '%stripe%' OR name LIKE '%__stripe%';"
  );
  const after = db
    .prepare("SELECT COUNT(*) AS c FROM cookies WHERE host_key LIKE '%stripe%'")
    .get();
  const removed = Number(before?.c || 0) - Number(after?.c || 0);
  db.close();
  return { ok: true, removed, via: "node:sqlite" };
}

function purgeWithSqlite3Cli(cookiesPath) {
  const r = spawnSync(
    "sqlite3",
    [
      cookiesPath,
      "DELETE FROM cookies WHERE host_key LIKE '%stripe%' OR name LIKE '%__stripe%';",
    ],
    { encoding: "utf8" }
  );
  if (r.error || r.status !== 0) {
    return { ok: false, error: r.stderr || r.error?.message || "sqlite3_failed" };
  }
  return { ok: true, removed: -1, via: "sqlite3_cli" };
}

function main() {
  const cookiesPath = arg("cookies");
  if (!cookiesPath) {
    console.error("Missing --cookies= path");
    process.exit(1);
  }
  let out = purgeWithNodeSqlite(cookiesPath);
  if (!out.ok && out.error === "node_sqlite_unavailable") {
    out = purgeWithSqlite3Cli(cookiesPath);
  }
  console.log(JSON.stringify(out));
  process.exit(out.ok ? 0 : 1);
}

main();
