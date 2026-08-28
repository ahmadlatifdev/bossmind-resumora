/**
 * Merge Stripe env keys into .env (preserve existing values). Never logs secrets.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(root, '.env');
const localPath = path.join(root, '.env.local');

function loadMerged() {
  const merged = {};
  for (const p of [envPath, localPath, path.join(root, 'functions', '.env')]) {
    if (fs.existsSync(p)) Object.assign(merged, dotenv.parse(fs.readFileSync(p, 'utf8')));
  }
  return merged;
}

function upsertKey(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
}

const existing = loadMerged();
let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '# Stripe + local webhook server\n';

const defaults = {
  STRIPE_SECRET_KEY: existing.STRIPE_SECRET_KEY || 'sk_test_PLACEHOLDER_REPLACE_WITH_REAL_KEY',
  STRIPE_WEBHOOK_SECRET: existing.STRIPE_WEBHOOK_SECRET || 'whsec_PLACEHOLDER_REPLACE_WITH_REAL_SECRET',
  PORT: existing.PORT || '3000',
  DATABASE_URL: existing.DATABASE_URL || existing.NEON_DATABASE_URL || '',
  REDIS_URL: existing.REDIS_URL || '',
  RESEND_API_KEY: existing.RESEND_API_KEY || '',
  SENDGRID_API_KEY: existing.SENDGRID_API_KEY || '',
  DUNNING_FROM_EMAIL: existing.DUNNING_FROM_EMAIL || 'billing@resumora.net',
  ALLOW_UNAUTH_BILLING: existing.ALLOW_UNAUTH_BILLING || 'false',
};

for (const [key, value] of Object.entries(defaults)) {
  if (!existing[key]) text = upsertKey(text, key, value);
}

fs.writeFileSync(envPath, text.endsWith('\n') ? text : `${text}\n`, 'utf8');

const status = {
  envPath,
  STRIPE_SECRET_KEY: existing.STRIPE_SECRET_KEY ? 'present' : 'placeholder_added',
  STRIPE_WEBHOOK_SECRET: existing.STRIPE_WEBHOOK_SECRET ? 'present' : 'placeholder_added',
  PORT: existing.PORT || defaults.PORT,
};

console.log(JSON.stringify(status, null, 2));
