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
 *   SELF_HEAL_ALLOW_GCLOUD=true node scripts/ops-auto-heal-resync.cjs --apply --loop
 *   SELF_HEAL_ALLOW_GCLOUD=true SELF_HEAL_ALLOW_IAM_BIND=true node scripts/ops-auto-heal-resync.cjs --apply
 */
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function resolveGcloudBin() {
  if (process.env.GCLOUD_BIN && fs.existsSync(process.env.GCLOUD_BIN)) {
    return process.env.GCLOUD_BIN;
  }
  if (process.platform === 'win32') {
    const candidates = [
      path.join(
        process.env.LOCALAPPDATA || '',
        'Google',
        'Cloud SDK',
        'google-cloud-sdk',
        'bin',
        'gcloud.cmd'
      ),
      path.join(
        process.env.ProgramFiles || 'C:\\Program Files',
        'Google',
        'Cloud SDK',
        'google-cloud-sdk',
        'bin',
        'gcloud.cmd'
      ),
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c)) return c;
    }
    return 'gcloud.cmd';
  }
  return 'gcloud';
}

const GCLOUD = resolveGcloudBin();
const apply = process.argv.includes('--apply');
const loop = process.argv.includes('--loop');
const loopMs = Math.max(5000, Number(process.env.HEAL_LOOP_MS || 10_000) || 10_000);
const allowGcloud = String(process.env.SELF_HEAL_ALLOW_GCLOUD || '').toLowerCase() === 'true';
const allowIam = String(process.env.SELF_HEAL_ALLOW_IAM_BIND || '').toLowerCase() === 'true';
const project = process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '';
const region = process.env.GCP_REGION || 'us-central1';
const runtimeSa =
  process.env.RUNTIME_SA_EMAIL ||
  (project ? `${project}@appspot.gserviceaccount.com` : '');
const servicesEnv = String(process.env.HEAL_CLOUD_RUN_SERVICES || '').trim();

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
  const opts = {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  };
  // Prefer PATH `gcloud` on Windows to avoid space-in-path .cmd quoting bugs.
  let bin = GCLOUD;
  if (process.platform === 'win32') {
    opts.shell = true;
    if (String(GCLOUD).toLowerCase().endsWith('gcloud.cmd') || /\s/.test(GCLOUD)) {
      bin = 'gcloud';
    }
  }
  const out = execFileSync(bin, args, opts);
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

/** Read secret payload for inject — never log the value. */
function readSecretValue(name) {
  try {
    const raw = gcloud(
      ['secrets', 'versions', 'access', 'latest', `--secret=${name}`, `--project=${project}`],
      { json: false }
    );
    return String(raw || '').trim();
  } catch {
    return '';
  }
}

function listRunServices() {
  try {
    const raw = gcloud(
      [
        'run',
        'services',
        'list',
        `--project=${project}`,
        `--region=${region}`,
        '--format=value(metadata.name)',
      ],
      { json: false }
    );
    return String(raw || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (err) {
    console.error('Cloud Run list failed:', err.message || err);
    return [
      'getsystemhealth',
      'runsystemhealth',
      'createcheckoutsession',
      'stripewebhook',
    ];
  }
}

async function fetchHealthScore() {
  const base = String(process.env.RESUMORA_API_BASE || 'https://resumora.net').replace(/\/$/, '');
  const password = String(
    process.env.ADMIN_REFUND_PASSWORD || process.env.VITE_ADMIN_PASSWORD || ''
  ).trim();
  if (!password) return null;
  try {
    const res = await fetch(`${base}/api/admin/system-health`, {
      headers: { 'X-Admin-Password': password },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    const score = Number((data.health && data.health.score) ?? data.score);
    return Number.isFinite(score) ? score : null;
  } catch {
    return null;
  }
}

function resolveServices() {
  if (servicesEnv) {
    return servicesEnv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return listRunServices();
}

/**
 * @returns {{ failed: number, plan: object }}
 */
function runOnce() {
  if (!project) {
    console.error('Set GCP_PROJECT_ID (or GCLOUD_PROJECT) before running.');
    process.exit(2);
  }

  const services = resolveServices();
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

  // Price IDs from Secret Manager when local file lacks them (values never logged).
  const priceValues = {};
  for (const k of PRICE_KEYS) {
    const local = String(merged[k] || '').trim();
    if (/^price_/.test(local)) {
      priceValues[k] = local;
      continue;
    }
    if (!secretNames.includes(k)) continue;
    const v = readSecretValue(k);
    if (/^price_/.test(v)) {
      priceValues[k] = v;
      localShapes[k] = shape(v, ['price_']);
    }
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
      const envMap = {};
      for (const e of env) {
        if (e && e.name && typeof e.value === 'string') envMap[e.name] = e.value;
      }
      serviceReports.push({
        service: svc,
        ok: true,
        envKeys,
        secretRefs,
        hasStripeSecret:
          envKeys.includes('STRIPE_SECRET_KEY') ||
          secretRefs.some((s) => s.name === 'STRIPE_SECRET_KEY'),
        hasWebhook:
          envKeys.includes('STRIPE_WEBHOOK_SECRET') ||
          secretRefs.some((s) => s.name === 'STRIPE_WEBHOOK_SECRET') ||
          secretRefs.some((s) => s.name === 'STRIPE_WEBHOOK_SECRET_LIVE'),
        hasPrefix: envKeys.includes(PREFIX_KEY),
        hasZeroTouch:
          String(envMap.SELF_HEAL_ALLOW_GCLOUD || '').toLowerCase() === 'true' ||
          String(envMap.SELF_HEAL_ALLOW_AUTO_ACK || '').toLowerCase() === 'true',
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
      STRIPE_WEBHOOK_SECRET_LIVE: secretNames.includes('STRIPE_WEBHOOK_SECRET_LIVE'),
      prices: PRICE_KEYS.filter((k) => secretNames.includes(k)),
    },
    services: serviceReports.map((s) => ({
      service: s.service,
      ok: s.ok,
      hasStripeSecret: s.hasStripeSecret,
      hasWebhook: s.hasWebhook,
      hasPrefix: s.hasPrefix,
      hasZeroTouch: s.hasZeroTouch,
      error: s.error || undefined,
    })),
    actions: [],
  };

  for (const svc of serviceReports.filter((s) => s.ok)) {
    const mounts = [];
    if (plan.secretManagerHas.STRIPE_SECRET_KEY && !svc.hasStripeSecret) {
      mounts.push('STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest');
    }
    if (plan.secretManagerHas.STRIPE_WEBHOOK_SECRET && !svc.hasWebhook) {
      mounts.push('STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest');
    } else if (plan.secretManagerHas.STRIPE_WEBHOOK_SECRET_LIVE && !svc.hasWebhook) {
      mounts.push('STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET_LIVE:latest');
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
    if ((prefixVal === 'cs_live_' || prefixVal === 'cs_test_') && !svc.hasPrefix) {
      envUpdates.push(`${PREFIX_KEY}=${prefixVal}`);
    }
    for (const k of PRICE_KEYS) {
      const v = String(priceValues[k] || '').trim();
      if (/^price_/.test(v)) envUpdates.push(`${k}=${v}`);
    }
    envUpdates.push('SELF_HEAL_ALLOW_GCLOUD=true', 'SELF_HEAL_ALLOW_AUTO_ACK=true');
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

  // Never log secret values or Stripe price/webhook/sk IDs — shapes + redacted plan only
  const safePlan = JSON.parse(JSON.stringify(plan));
  if (Array.isArray(safePlan.actions)) {
    for (const action of safePlan.actions) {
      if (!Array.isArray(action.args)) continue;
      action.args = action.args.map((a) => {
        if (typeof a !== 'string' || !a.startsWith('--update-env-vars=')) return a;
        return (
          '--update-env-vars=' +
          a
            .slice('--update-env-vars='.length)
            .split(',')
            .map((pair) => {
              const eq = pair.indexOf('=');
              if (eq <= 0) return pair;
              const key = pair.slice(0, eq);
              const val = pair.slice(eq + 1);
              if (/^price_|^sk_|^pk_|^whsec_/i.test(val)) return `${key}=***`;
              if (/PRICE|SECRET|KEY|TOKEN|PASSWORD/i.test(key) && !/SELF_HEAL|PREFIX/i.test(key)) {
                return `${key}=***`;
              }
              return pair;
            })
            .join(',')
        );
      });
    }
  }
  console.log(JSON.stringify(safePlan, null, 2));

  if (!apply) {
    console.error('\nDry-run only. Re-run with --apply and SELF_HEAL_ALLOW_GCLOUD=true to execute.');
    return { failed: 0, plan, dryRun: true };
  }
  if (!allowGcloud) {
    console.error('Refusing apply: SELF_HEAL_ALLOW_GCLOUD is not true.');
    return { failed: 3, plan, blocked: true };
  }

  let failed = 0;
  for (const action of plan.actions) {
    if (action.type === 'skipped_iam') continue;
    if (action.type === 'iam_bind' && !allowIam) continue;
    try {
      // Redact env values that look like secrets from console (keep keys only)
      const safeArgs = action.args.map((a) => {
        if (typeof a === 'string' && a.startsWith('--update-env-vars=')) {
          return (
            '--update-env-vars=' +
            a
              .slice('--update-env-vars='.length)
              .split(',')
              .map((pair) => {
                const eq = pair.indexOf('=');
                if (eq <= 0) return pair;
                const key = pair.slice(0, eq);
                if (/PRICE|SECRET|KEY|TOKEN|PASSWORD/i.test(key) && !/SELF_HEAL|PREFIX/i.test(key)) {
                  return `${key}=***`;
                }
                return pair;
              })
              .join(',')
          );
        }
        return a;
      });
      console.error(`Running: gcloud ${safeArgs.join(' ')}`);
      gcloud(action.args);
      console.error(`OK: ${action.type} ${action.service || ''}`);
    } catch (err) {
      failed += 1;
      console.error(
        `FAIL: ${action.type}`,
        String(err && err.message ? err.message : err).slice(0, 300)
      );
    }
  }

  console.error(
    failed
      ? `\nCompleted with ${failed} failure(s). Re-run System Health.`
      : '\nCompleted. Re-run System Health (Run diagnosis once).'
  );
  return { failed, plan };
}

async function main() {
  if (loop) {
    if (!apply || !allowGcloud) {
      console.error('--loop requires --apply and SELF_HEAL_ALLOW_GCLOUD=true');
      process.exit(3);
    }
    console.error(`Zero-touch ops loop every ${loopMs}ms until health score >= 100 (or forever if no admin password).`);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const score = await fetchHealthScore();
      if (score != null && score >= 100) {
        console.error(`Health score ${score} — loop idle (still watching).`);
      } else {
        console.error(
          score == null
            ? 'Health score unavailable — applying resync.'
            : `Health score ${score} < 100 — applying resync.`
        );
        runOnce();
      }
      await new Promise((r) => setTimeout(r, loopMs));
    }
  }

  const result = runOnce();
  if (result.dryRun) process.exit(0);
  if (result.blocked) process.exit(3);
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
