#!/usr/bin/env node
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { parseEnvContent } = require(path.join(root, "lib/shared/load-project-env.js"));

const tables = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["task_state", "error_memory", "event_log"];

const merged = {
  ...parseEnvContent(fs.readFileSync(path.join(root, ".env"), "utf8")),
  ...parseEnvContent(fs.readFileSync(path.join(root, ".env.local"), "utf8")),
};
const url = merged.NEON_DATABASE_URL || merged.DATABASE_URL;
const sql = neon(url);
const out = {};
for (const table of tables) {
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY ordinal_position`;
  out[table] = cols.map((c) => c.column_name);
}
console.log(JSON.stringify(out, null, 2));
