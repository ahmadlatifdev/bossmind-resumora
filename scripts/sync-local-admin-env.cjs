#!/usr/bin/env node
/**
 * Upsert ADMIN_REFUND_PASSWORD + VITE_ADMIN_PASSWORD into root .env
 * from .env.local and/or GCP Secret Manager. Never prints secret values.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

function parseEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function upsertEnvFile(filePath, updates) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const lines = existing ? existing.split(/\r?\n/) : [];
  const keys = new Set(Object.keys(updates));
  const next = [];
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (m && keys.has(m[1])) continue;
    if (/^#\s*(ADMIN_REFUND_PASSWORD|VITE_ADMIN_PASSWORD)=/.test(line)) continue;
    if (line.length || next.length) next.push(line);
  }
  while (next.length && next[next.length - 1] === '') next.pop();
  for (const [k, v] of Object.entries(updates)) {
    next.push(`${k}=${v}`);
  }
  next.push('');
  fs.writeFileSync(filePath, next.join('\n'), 'utf8');
}

function readSmAdmin() {
  try {
    const out = execFileSync(
      'gcloud',
      [
        'secrets',
        'versions',
        'access',
        'latest',
        '--secret=ADMIN_REFUND_PASSWORD',
        '--project=resumora-live',
      ],
      { encoding: 'utf8', shell: process.platform === 'win32', windowsHide: true }
    );
    return String(out || '').trim();
  } catch {
    return '';
  }
}

const local = parseEnv(path.join(root, '.env.local'));
const env = parseEnv(path.join(root, '.env'));
const vitePw = String(
  local.VITE_ADMIN_PASSWORD ||
    local.ADMIN_REFUND_PASSWORD ||
    env.VITE_ADMIN_PASSWORD ||
    env.ADMIN_REFUND_PASSWORD ||
    ''
).trim();
let adminPw = String(local.ADMIN_REFUND_PASSWORD || env.ADMIN_REFUND_PASSWORD || '').trim();
const sm = readSmAdmin();
if (sm) adminPw = sm;
if (!adminPw && vitePw) adminPw = vitePw;
if (!adminPw) {
  console.error('NO_PASSWORD_SOURCE: set .env.local VITE_ADMIN_PASSWORD or SM ADMIN_REFUND_PASSWORD');
  process.exit(2);
}
const finalVite = vitePw || adminPw;
upsertEnvFile(path.join(root, '.env'), {
  ADMIN_REFUND_PASSWORD: adminPw,
  VITE_ADMIN_PASSWORD: finalVite,
});
const check = parseEnv(path.join(root, '.env'));
console.log(
  JSON.stringify(
    {
      ok: true,
      envAdmin: Boolean(check.ADMIN_REFUND_PASSWORD),
      envViteAdmin: Boolean(check.VITE_ADMIN_PASSWORD),
      fromSecretManager: Boolean(sm),
    },
    null,
    2
  )
);
