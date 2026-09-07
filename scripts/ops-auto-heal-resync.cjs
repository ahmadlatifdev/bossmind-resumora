#!/usr/bin/env node
/**
 * Ops auto-heal resync — local Node + gcloud only.
 *
 * Compares KEY PRESENCE / SHAPES (never prints secret values) across:
 *   - local .env / functions/.env
 *   - Secret Manager secret names
 *   - Cloud Run service env / secret refs
 *
 * Apply mode requires: SELF_HEAL_ALLOW_GCLOUD=true
 * IAM bind mode requires: SELF_HEAL_ALLOW_IAM_BIND=true (extra gate)
 *
 * Usage:
 *   node scripts/ops-auto-heal-resync.cjs              # dry-run plan
 *   SELF_HEAL_ALLOW_GCLOUD=true node scripts/ops-auto-heal-resync.cjs --apply
 *   SELF_HEAL_ALLOW_GCLOUD=true SELF_HEAL_ALLOW_IAM_BIND=true node scripts/ops-auto-heal-resync.cjs --apply
 */
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');
const allowGcloud = String(process.env.SELF_HEAL_ALLOW_GCLOUD || '').toLowerCase() === 'true';
const allowIam = String(process.env.SELF_HEAL_ALLOW_IAM_BIND || '').toLowerCase() === 'true';
const project = process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '';
const region = process.env.GCP_REGION || 'us-central1';
const runtimeSa =
  process.env.RUNTIME_SA_EMAIL ||
  (project ? `${project}@appspot.gserviceaccount.com` : '');
const services = String(
  process.env.HEAL_CLOUD_RUN_SERVICES ||
    'getsystemhealth,runsystemhealth,createcheckoutsession,stripewebhook'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const SECRET_KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_SECRET_LIVE'];
const PRICE_KEYS = [
  'STRIPE_PRICE_BASIC',
  'STRIPE_PRICE_BALANCED',
  'STRIPE_PRICE_PROFESSIONAL_TIER',
  'STRIPE_PRICE_ADVANCED',
];
const PREFIX_KEY = 'CHECKOUT_SESSION_PREFIX';

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
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

function shape(value, prefixes) {
  const v = String(value || '').trim();
  if (!v) return { present: false, ok: false, kind: 'missing' };
  const ok = (prefixes || []).some((p) => v.startsWith(p));
  return { present: true, ok, kind: ok ? 'ok' : 'bad_prefix', length: v.length };
}

function gcloud(args, { json = false } = {}) {
  const out = execFileSync('gcloud', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (!json) return out;
  return JSON.parse(out || '{}');
}

function mergeLocalEnv() {
  const files = [
    path.join(root, '.env'),
    path.join(root, '.env.local'),
    path.join(root, 'functions', '.env'),
  ];
  const merged = {};
  const loaded = [];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    Object.assign(merged, parseEnvFile(f));
    loaded.push(f);
  }
  return { merged, loaded };
}

function main() {
  if (!project) {
    console.error('Set GCP_PROJECT_ID (or GCLOUD_PROJECT) before running.');
    process.exit(2);
  }

  const { merged, loaded } = mergeLocalEnv();
  const localShapes = {
    STRIPE_SECRET_KEY: shape(merged.STRIPE_SECRET_KEY || merged.SECRET_STRIPE, [
      'sk_live_',
      'sk_test_',
    ]),
    STRIPE_WEBHOOK_SECRET: shape(
      merged.STRIPE_WEBHOOK_SECRET || merged.STRIPE_WEBHOOK_SECRET_LIVE,
      ['whsec_']
    ),
    CHECKOUT_SESSION_PREFIX: shape(merged.CHECKOUT_SESSION_PREFIX || 'cs_live_', [
      'cs_live_',
      'cs_test_',
    ]),
  };
  for (const k of PRICE_KEYS) {
    localShapes[k] = shape(merged[k], ['price_']);
  }

  let secretNames = [];
  try {
    const list = gcloud(
      ['secrets', 'list', `--project=${project}`, '--format=value(name)'],
      { json: false }
    );
    secretNames = String(list || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((n) => n.split('/').pop());
  } catch (err) {
    console.error('Secret Manager list failed:', err.message || err);
  }

  const serviceReports = [];
  for (const svc of services) {
    try {
      const desc = gcloud(
        [
          'run',
          'services',
          'describe',
          svc,
          `--project=${project}`,
          `--region=${region}`,
          '--format=json',
        ],
        { json: true }
      );
      const container =
        (((desc.spec || {}).template || {}).spec || {}).containers ||
        (((desc.spec || {}).template || {}).spec || {}).container ||
        [];
      const c0 = Array.isArray(container) ? container[0] : container;
      const env = (c0 && c0.env) || [];
      const envKeys = env.map((e) => e.name).filter(Boolean);
      const secretRefs = env
        .filter((e) => e.valueFrom && e.valueFrom.secretKeyRef)
        .map((e) => ({ name: e.name, secret: e.valueFrom.secretKeyRef.name }));
      serviceReports.push({
        service: svc,
        ok: true,
        envKeys,
        secretRefs,
        hasStripeSecret: envKeys.includes('STRIPE_SECRET_KEY') || secretRefs.some((s) => s.name === 'STRIPE_SECRET_KEY'),
        hasWebhook:
          envKeys.includes('STRIPE_WEBHOOK_SECRET') ||
          secretRefs.some((s) => s.name === 'STRIPE_WEBHOOK_SECRET'),
        hasPrefix: envKeys.includes(PREFIX_KEY),
      });
    } catch (err) {
      serviceReports.push({
        service: svc,
        ok: false,
        error: String(err && err.message ? err.message : err).slice(0, 200),
      });
    }
  }

  const plan = {
    mode: apply ? (allowGcloud ? 'apply' : 'blocked_need_SELF_HEAL_ALLOW_GCLOUD') : 'dry-run',
    project,
    region,
    loadedEnvFiles: loaded,
    localShapes,
    secretManagerHas: {
      STRIPE_SECRET_KEY: secretNames.includes('STRIPE_SECRET_KEY'),
      STRIPE_WEBHOOK_SECRET: secretNames.includes('STRIPE_WEBHOOK_SECRET'),
    },
    services: serviceReports,
    actions: [],
  };

  // Remount secrets from Secret Manager (not from printing .env values)
  for (const svc of serviceReports.filter((s) => s.ok)) {
    const mounts = [];
    if (plan.secretManagerHas.STRIPE_SECRET_KEY && !svc.hasStripeSecret) {
      mounts.push('STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest');
    }
    if (plan.secretManagerHas.STRIPE_WEBHOOK_SECRET && !svc.hasWebhook) {
      mounts.push('STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest');
    }
    // Always refresh mounts when apply + drift suspected (local shape ok but service missing ref)
    if (plan.secretManagerHas.STRIPE_SECRET_KEY && localShapes.STRIPE_SECRET_KEY.ok) {
      if (!mounts.some((m) => m.startsWith('STRIPE_SECRET_KEY='))) {
        mounts.push('STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest');
      }
    }
    if (plan.secretManagerHas.STRIPE_WEBHOOK_SECRET && localShapes.STRIPE_WEBHOOK_SECRET.ok) {
      if (!mounts.some((m) => m.startsWith('STRIPE_WEBHOOK_SECRET='))) {
        mounts.push('STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest');
      }
    }
    if (mounts.length) {
      plan.actions.push({
        type: 'update_secrets',
        service: svc.service,
        args: [
          'run',
          'services',
          'update',
          svc.service,
          `--project=${project}`,
          `--region=${region}`,
          `--update-secrets=${[...new Set(mounts)].join(',')}`,
          '--quiet',
        ],
      });
    }

    const envUpdates = [];
    const prefixVal = String(merged[PREFIX_KEY] || 'cs_live_').trim();
    if (prefixVal === 'cs_live_' || prefixVal === 'cs_test_') {
      if (!svc.hasPrefix || true) {
        envUpdates.push(`${PREFIX_KEY}=${prefixVal}`);
      }
    }
    for (const k of PRICE_KEYS) {
      const v = String(merged[k] || '').trim();
      if (/^price_/.test(v)) envUpdates.push(`${k}=${v}`);
    }
    if (envUpdates.length) {
      plan.actions.push({
        type: 'update_env',
        service: svc.service,
        args: [
          'run',
          'services',
          'update',
          svc.service,
          `--project=${project}`,
          `--region=${region}`,
          `--update-env-vars=${envUpdates.join(',')}`,
          '--quiet',
        ],
      });
    }
  }

  if (allowIam && runtimeSa) {
    plan.actions.push({
      type: 'iam_bind',
      args: [
        'projects',
        'add-iam-policy-binding',
        project,
        `--member=serviceAccount:${runtimeSa}`,
        '--role=roles/secretmanager.secretAccessor',
        '--quiet',
      ],
    });
    plan.actions.push({
      type: 'iam_bind',
      args: [
        'projects',
        'add-iam-policy-binding',
        project,
        `--member=serviceAccount:${runtimeSa}`,
        '--role=roles/datastore.user',
        '--quiet',
      ],
    });
  } else if (apply && !allowIam) {
    plan.actions.push({
      type: 'skipped_iam',
      reason: 'Set SELF_HEAL_ALLOW_IAM_BIND=true to apply secretAccessor + datastore.user',
    });
  }

  // Never log secret values — shapes + plan only
  console.log(JSON.stringify(plan, null, 2));

  if (!apply) {
    console.error('\nDry-run only. Re-run with --apply and SELF_HEAL_ALLOW_GCLOUD=true to execute.');
    process.exit(0);
  }
  if (!allowGcloud) {
    console.error('Refusing apply: SELF_HEAL_ALLOW_GCLOUD is not true.');
    process.exit(3);
  }

  let failed = 0;
  for (const action of plan.actions) {
    if (action.type === 'skipped_iam') continue;
    if (action.type === 'iam_bind' && !allowIam) continue;
    try {
      console.error(`Running: gcloud ${action.args.join(' ')}`);
      gcloud(action.args);
      console.error(`OK: ${action.type} ${action.service || ''}`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL: ${action.type}`, String(err && err.message ? err.message : err).slice(0, 300));
    }
  }

  console.error(
    failed
      ? `\nCompleted with ${failed} failure(s). Re-run System Health.`
      : '\nCompleted. Re-run System Health (Run diagnosis once).'
  );
  process.exit(failed ? 1 : 0);
}

main();
