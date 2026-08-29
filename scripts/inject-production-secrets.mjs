/**
 * Inject Stripe secrets into functions/.env from central vault (never logs values).
 * Optionally set GitHub FIREBASE_SERVICE_ACCOUNT if JSON path provided.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const vaultPath = path.join('D:', 'BossMind', 'config', 'secrets.env');
const functionsEnv = path.join(root, 'functions', '.env');

function loadVault() {
  const merged = {};
  for (const p of [
    vaultPath,
    path.join(root, '.env.local'),
    path.join(root, '.env'),
  ]) {
    if (fs.existsSync(p)) Object.assign(merged, dotenv.parse(fs.readFileSync(p, 'utf8')));
  }
  return merged;
}

const vault = loadVault();

/** Plain env keys (non-Secret-Manager) written to functions/.env */
const envKeys = [
  'RESEND_API_KEY',
  'SENDGRID_API_KEY',
  'DUNNING_FROM_EMAIL',
  'ALLOW_UNAUTH_BILLING',
];

/** Bound via Firebase Secret Manager — never plain .env (Cloud Run overlap) */
const secretManagerKeys = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];

let text = fs.existsSync(functionsEnv) ? fs.readFileSync(functionsEnv, 'utf8') : '# Auto-injected from vault\n';
for (const key of envKeys) {
  const value = vault[key];
  if (!value) continue;
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
}
// Strip Secret Manager keys from .env to avoid deploy overlap
for (const key of secretManagerKeys) {
  text = text.replace(new RegExp(`^${key}=.*\\n?`, 'm'), '');
}
fs.writeFileSync(functionsEnv, text.endsWith('\n') ? text : `${text}\n`, 'utf8');

const saCandidates = [
  path.join(root, 'firebase-service-account.json'),
  path.join('D:', 'BossMind', 'config', 'firebase-service-account.json'),
  path.join('D:', 'BossMind', 'bossmind-resumora', 'firebase-service-account.json'),
];

let saSet = false;
for (const saPath of saCandidates) {
  if (!fs.existsSync(saPath)) continue;
  const size = fs.statSync(saPath).size;
  if (size < 100) continue; // skip empty or truncated JSON
  try {
    JSON.parse(fs.readFileSync(saPath, 'utf8')); // validate before gh secret set
  } catch {
    continue;
  }
  try {
    execSync(`gh secret set FIREBASE_SERVICE_ACCOUNT < "${saPath}"`, {
      shell: true,
      stdio: 'pipe',
      cwd: root,
    });
    saSet = true;
    break;
  } catch {
    /* try next */
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      functionsEnvWritten: envKeys.filter((k) => vault[k]).map((k) => k),
      secretManagerKeysInVault: secretManagerKeys.filter((k) => vault[k]).map((k) => k),
      missingInVault: [...envKeys, ...secretManagerKeys].filter((k) => !vault[k]),
      githubFirebaseServiceAccountSet: saSet,
      saFileFound: saCandidates.find((p) => fs.existsSync(p)) || null,
    },
    null,
    2
  )
);
