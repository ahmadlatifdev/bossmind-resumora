/**
 * Configure Stripe CLI with test key from vault (never prints the key).
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function readKey(filePath, name) {
  if (!fs.existsSync(filePath)) return '';
  const t = fs.readFileSync(filePath, 'utf8');
  const m = t.match(new RegExp(`^${name}=(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
}

const sk =
  readKey('D:/BossMind/config/secrets.env', 'STRIPE_SECRET_KEY') ||
  readKey(path.join(root, '.env.local'), 'STRIPE_SECRET_KEY') ||
  readKey(path.join(root, 'functions', '.env'), 'STRIPE_SECRET_KEY');

if (!sk.startsWith('sk_')) {
  console.error('NO_STRIPE_SECRET_KEY');
  process.exit(1);
}

const stripe =
  process.platform === 'win32'
    ? 'C:\\Users\\user\\AppData\\Local\\Microsoft\\WinGet\\Links\\stripe.exe'
    : 'stripe';

execFileSync(stripe, ['config', '--set', 'test_mode_api_key', sk], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
execFileSync(stripe, ['config', '--set', 'live_mode_api_key', ''], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

console.log(`STRIPE_CLI_CONFIGURED=yes MODE=${sk.startsWith('sk_live') ? 'live' : 'test'}`);
