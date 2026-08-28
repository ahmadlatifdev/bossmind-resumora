/**
 * Prepare Stripe secrets for Firebase Extension install (no secret values printed).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const project = 'resumora-live';

function readKey(filePath, name) {
  if (!fs.existsSync(filePath)) return '';
  const t = fs.readFileSync(filePath, 'utf8');
  const m = t.match(new RegExp(`^${name}=(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
}

function firstKey(name) {
  for (const p of [
    'D:/BossMind/config/secrets.env',
    path.join(root, '.env.local'),
    path.join(root, 'functions', '.env'),
  ]) {
    const v = readKey(p, name);
    if (v) return v;
  }
  return '';
}

const sk = firstKey('STRIPE_SECRET_KEY');
if (!sk.startsWith('sk_')) {
  console.error('NO_STRIPE_SECRET_KEY');
  process.exit(1);
}

const tmp = path.join(process.env.TEMP || '/tmp', 'bm-stripe-api-key.txt');
fs.writeFileSync(tmp, sk, { mode: 0o600 });
console.log(`KEY_MODE=${sk.startsWith('sk_live') ? 'live' : 'test'}`);

const gcloudBin = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
const token = execFileSync(gcloudBin, ['auth', 'print-access-token'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
}).trim();

try {
  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    [
      '--yes',
      'firebase-tools@13',
      'functions:secrets:set',
      'STRIPE_API_KEY',
      '--data-file',
      tmp,
      '--project',
      project,
      '--token',
      token,
    ],
    { stdio: 'inherit', shell: true, cwd: root }
  );
  console.log('STRIPE_API_KEY_SET=ok');
} catch (e) {
  console.error('STRIPE_API_KEY_SET=fail');
  process.exitCode = 1;
} finally {
  try {
    fs.unlinkSync(tmp);
  } catch (_) {}
}

const paramsPath = path.join(root, 'extensions', 'firestore-stripe-payments.env');
fs.mkdirSync(path.dirname(paramsPath), { recursive: true });
const params = [
  'LOCATION=us-central1',
  'PRODUCTS_COLLECTION=products',
  // Merge into users docs so AuthContext users/{uid} paths stay valid
  'CUSTOMERS_COLLECTION=users',
  'STRIPE_CONFIG_COLLECTION=configuration',
  'SYNC_USERS_ON_CREATE=Do not sync',
  'DELETE_STRIPE_CUSTOMERS=Do not delete',
  'CREATE_CHECKOUT_SESSION_MIN_INSTANCES=0',
  // Secret Manager refs — no raw secret values in this file
  `STRIPE_API_KEY=projects/${project}/secrets/STRIPE_API_KEY/versions/latest`,
  `STRIPE_WEBHOOK_SECRET=projects/${project}/secrets/STRIPE_WEBHOOK_SECRET/versions/latest`,
].join('\n');
fs.writeFileSync(paramsPath, params + '\n', 'utf8');
console.log(`PARAMS_WRITTEN=${paramsPath}`);
