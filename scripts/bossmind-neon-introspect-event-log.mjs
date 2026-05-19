#!/usr/bin/env node
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { parseEnvContent } = require(path.join(root, "lib/shared/load-project-env.js"));

const merged = {
  ...parseEnvContent(fs.readFileSync(path.join(root, ".env"), "utf8")),
  ...parseEnvContent(fs.readFileSync(path.join(root, ".env.local"), "utf8")),
};
const url = merged.NEON_DATABASE_URL || merged.DATABASE_URL;
if (!url) {
  console.error(JSON.stringify({ ok: false, reason: "no_database_url" }));
  process.exit(1);
}
const sql = neon(url);
const cols = await sql`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'event_log'
  ORDER BY ordinal_position`;
console.log(JSON.stringify({ ok: true, columns: cols }, null, 2));
