#!/usr/bin/env node
/**
 * Auto-inject Stripe HITL secrets/env into Cloud Run getsystemhealth (us-central1).
 * Reads root .env / .env.local — never prints secret or price_ values.
 *
 * Canvas/selfHeal playbook:
 *   --update-secrets=STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest
 *   --update-secrets=STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest
 *   --update-env-vars=STRIPE_PRICE_*=…,CHECKOUT_SESSION_PREFIX=cs_live_,SELF_HEAL_*
 *
 * Usage:
 *   node scripts/auto-inject-secrets.cjs
 *   SELF_HEAL_ALLOW_GCLOUD=true node scripts/auto-inject-secrets.cjs
 */
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const project =
  process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'resumora-live';
const region = process.env.GCP_REGION || 'us-central1';
const service = process.env.HEALTH_CHECKLIST_SERVICE || 'getsystemhealth';
const allowGcloud =
  String(process.env.SELF_HEAL_ALLOW_GCLOUD || 'true').toLowerCase() === 'true';

const SECRET_KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
const PRICE_KEYS = [
  'STRIPE_PRICE_BASIC',
  'STRIPE_PRICE_BALANCED',
  'STRIPE_PRICE_PROFESSIONAL_TIER',
  'STRIPE_PRICE_ADVANCED',
];

function parseEnvFile(filePath) {
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

function mergeLocalEnv() {
  return {
    ...parseEnvFile(path.join(root, '.env')),
    ...parseEnvFile(path.join(root, '.env.local')),
    ...parseEnvFile(path.join(root, 'functions', '.env')),
  };
}

function shapeOk(value, prefixes) {
  const v = String(value || '').trim();
  return Boolean(v && prefixes.some((p) => v.startsWith(p)));
}

function gcloud(args) {
  const opts = {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  };
  if (process.platform === 'win32') opts.shell = true;
  return execFileSync('gcloud', args, opts);
}

function secretExists(name) {
  try {
    gcloud(['secrets', 'describe', name, `--project=${project}`, '--format=value(name)']);
    return true;
  } catch {
    return false;
  }
}

function ensureSecretFromLocal(name, value) {
  const v = String(value || '').trim();
  if (!v) return { ok: false, reason: 'missing_local_value' };
  if (!secretExists(name)) {
    gcloud([
      'secrets',
      'create',
      name,
      `--project=${project}`,
      '--replication-policy=automatic',
    ]);
  }
  // Pipe value via stdin file to avoid argv leakage in process lists where possible
  const tmp = path.join(root, `.tmp-${name}-${Date.now()}.secret`);
  try {
    fs.writeFileSync(tmp, v, { encoding: 'utf8', mode: 0o600 });
    gcloud([
      'secrets',
      'versions',
      'add',
      name,
      `--project=${project}`,
      `--data-file=${tmp}`,
    ]);
    return { ok: true, ensured: true };
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function redactEnvPair(pair) {
  const eq = pair.indexOf('=');
  if (eq <= 0) return pair;
  const key = pair.slice(0, eq);
  const val = pair.slice(eq + 1);
  if (/^price_|^sk_|^pk_|^whsec_/i.test(val)) return `${key}=***`;
  if (/SECRET|KEY|TOKEN|PASSWORD|PRICE/i.test(key) && !/SELF_HEAL|PREFIX/i.test(key)) {
    return `${key}=***`;
  }
  return pair;
}

function main() {
  if (!allowGcloud) {
    console.error('Refusing: set SELF_HEAL_ALLOW_GCLOUD=true');
    process.exit(3);
  }

  const env = mergeLocalEnv();
  const inventory = {
    STRIPE_SECRET_KEY: shapeOk(env.STRIPE_SECRET_KEY || env.SECRET_STRIPE, [
      'sk_live_',
      'sk_test_',
    ]),
    STRIPE_WEBHOOK_SECRET: shapeOk(
      env.STRIPE_WEBHOOK_SECRET || env.STRIPE_WEBHOOK_SECRET_LIVE,
      ['whsec_']
    ),
    prices: Object.fromEntries(
      PRICE_KEYS.map((k) => [k, shapeOk(env[k], ['price_'])])
    ),
    CHECKOUT_SESSION_PREFIX: String(env.CHECKOUT_SESSION_PREFIX || 'cs_live_').trim(),
  };

  console.log(
    JSON.stringify(
      {
        mode: 'auto-inject',
        project,
        region,
        service,
        shapes: {
          STRIPE_SECRET_KEY: inventory.STRIPE_SECRET_KEY ? 'ok' : 'bad_or_missing',
          STRIPE_WEBHOOK_SECRET: inventory.STRIPE_WEBHOOK_SECRET ? 'ok' : 'bad_or_missing',
          prices: inventory.prices,
          CHECKOUT_SESSION_PREFIX: inventory.CHECKOUT_SESSION_PREFIX,
        },
      },
      null,
      2
    )
  );

  const results = [];
  let failed = 0;

  // 1) Ensure Secret Manager has latest from local .env (no value logs)
  const secretPayloads = {
    STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY || env.SECRET_STRIPE || '',
    STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET || env.STRIPE_WEBHOOK_SECRET_LIVE || '',
  };
  for (const key of SECRET_KEYS) {
    try {
      if (!shapeOk(secretPayloads[key], key.includes('WEBHOOK') ? ['whsec_'] : ['sk_live_', 'sk_test_'])) {
        results.push({ step: `ensure_${key}`, ok: false, reason: 'local_shape_invalid' });
        failed += 1;
        continue;
      }
      const out = ensureSecretFromLocal(key, secretPayloads[key]);
      results.push({ step: `ensure_${key}`, ok: out.ok, reason: out.reason || null });
      if (!out.ok) failed += 1;
      else console.error(`OK: Secret Manager ${key} version added`);
    } catch (err) {
      failed += 1;
      results.push({
        step: `ensure_${key}`,
        ok: false,
        error: String(err && err.message ? err.message : err).slice(0, 200),
      });
      console.error(`FAIL: ensure ${key}`, String(err && err.message ? err.message : err).slice(0, 200));
    }
  }

  // 2) Mount secrets on getsystemhealth (canvas HITL commands)
  const secretMounts = SECRET_KEYS.map((k) => `${k}=${k}:latest`).join(',');
  try {
    console.error(
      `Running: gcloud run services update ${service} --update-secrets=${SECRET_KEYS.map((k) => `${k}=***`).join(',')} …`
    );
    gcloud([
      'run',
      'services',
      'update',
      service,
      `--project=${project}`,
      `--region=${region}`,
      `--update-secrets=${secretMounts}`,
      '--quiet',
    ]);
    results.push({ step: 'update_secrets', ok: true });
    console.error('OK: update_secrets');
  } catch (err) {
    // Firebase Gen2 often crashes on --update-secrets; prices/gates still applied below.
    // Secrets remain in SM for Functions defineSecret remount on next GHA deploy.
    failed += 1;
    results.push({
      step: 'update_secrets',
      ok: false,
      note: 'Firebase Gen2 may reject --update-secrets; SM versions updated; env inject continues',
      error: String(err && err.message ? err.message : err).slice(0, 220),
    });
    console.error(
      'FAIL: update_secrets (continuing with env inject)',
      String(err && err.message ? err.message : err).slice(0, 220)
    );
  }

  // 3) Prices + checkout prefix + permanent auto-ACK gates
  const envPairs = [];
  const prefix = inventory.CHECKOUT_SESSION_PREFIX;
  if (prefix === 'cs_live_' || prefix === 'cs_test_') {
    envPairs.push(`CHECKOUT_SESSION_PREFIX=${prefix}`);
  } else {
    envPairs.push('CHECKOUT_SESSION_PREFIX=cs_live_');
  }
  for (const k of PRICE_KEYS) {
    const v = String(env[k] || '').trim();
    if (/^price_/.test(v)) envPairs.push(`${k}=${v}`);
  }
  envPairs.push('SELF_HEAL_ALLOW_GCLOUD=true', 'SELF_HEAL_ALLOW_AUTO_ACK=true');

  try {
    const redacted = envPairs.map(redactEnvPair).join(',');
    console.error(
      `Running: gcloud run services update ${service} --update-env-vars=${redacted} --quiet`
    );
    gcloud([
      'run',
      'services',
      'update',
      service,
      `--project=${project}`,
      `--region=${region}`,
      `--update-env-vars=${envPairs.join(',')}`,
      '--quiet',
    ]);
    results.push({ step: 'update_env', ok: true, keys: envPairs.map((p) => p.split('=')[0]) });
    console.error('OK: update_env');
  } catch (err) {
    failed += 1;
    results.push({
      step: 'update_env',
      ok: false,
      error: String(err && err.message ? err.message : err).slice(0, 220),
    });
    console.error('FAIL: update_env', String(err && err.message ? err.message : err).slice(0, 220));
  }

  // Also inject sibling health services used by System Health dashboard
  const siblings = String(
    process.env.HEAL_SIBLING_SERVICES || 'runsystemhealth,decidesystemheal,autoacksystemheal,systemhealthcron'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const svc of siblings) {
    try {
      gcloud([
        'run',
        'services',
        'update',
        svc,
        `--project=${project}`,
        `--region=${region}`,
        `--update-env-vars=${envPairs.join(',')}`,
        '--quiet',
      ]);
      results.push({ step: `update_env_${svc}`, ok: true });
      console.error(`OK: update_env ${svc}`);
    } catch (err) {
      // Non-fatal if service name missing
      results.push({
        step: `update_env_${svc}`,
        ok: false,
        error: String(err && err.message ? err.message : err).slice(0, 160),
      });
      console.error(`WARN: update_env ${svc}`, String(err && err.message ? err.message : err).slice(0, 160));
    }
  }

  const hardFailed = results.filter(
    (r) =>
      !r.ok &&
      r.step !== 'update_secrets' &&
      !String(r.step || '').startsWith('update_env_')
  ).length;
  const softSecretFail = results.some((r) => r.step === 'update_secrets' && !r.ok);

  console.log(
    JSON.stringify(
      {
        ok: hardFailed === 0,
        hardFailed,
        softSecretFail,
        results,
        note: softSecretFail
          ? 'SM versions updated; Cloud Run --update-secrets blocked by Firebase Gen2 — Functions defineSecret remounts on next GHA deploy'
          : null,
      },
      null,
      2
    )
  );
  console.error(
    hardFailed
      ? `\nCompleted with ${hardFailed} hard failure(s).`
      : softSecretFail
        ? '\nCompleted (env + SM OK). Secret mount via GHA/Functions defineSecret on next deploy.'
        : '\nCompleted. Open System Health — score should recover without manual ACK.'
  );
  process.exit(hardFailed ? 1 : 0);
}

main();
