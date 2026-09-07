#!/usr/bin/env node
/**
 * Sync Resumora cron schedules to GCP Cloud Scheduler (Google-only).
 * Uses existing gcloud CLI — no new npm deps.
 *
 * Source of truth for Functions crons: functions/adminEndpoints.js onSchedule.
 * Optional HTTP mirrors hit Cloud Run invoker URLs (OIDC) so Scheduler lives in GCP
 * even when GitHub Actions schedules also exist.
 *
 * Usage:
 *   node scripts/create-gcp-scheduler.mjs              # dry-run
 *   node scripts/create-gcp-scheduler.mjs --apply     # gcloud scheduler jobs create/update
 *
 * Env: GCP_PROJECT_ID, GCP_REGION (default us-central1), SCHEDULER_OIDC_SA (optional)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
const project = process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '';
const region = process.env.GCP_REGION || 'us-central1';
const location = process.env.SCHEDULER_LOCATION || region;
const oidcSa = process.env.SCHEDULER_OIDC_SA || '';

/** Mirrors Firebase Functions v2 scheduler + ops health tick (HTTP). */
const JOBS = [
  {
    name: 'resumora-finance-allocation',
    schedule: '15 7 * * *',
    timeZone: 'America/Toronto',
    description: 'Mirror financeAllocationCron (Firebase onSchedule)',
    uriEnv: 'SCHEDULER_URI_FINANCE',
    defaultPath: '/runFinanceAllocation',
  },
  {
    name: 'resumora-system-manual',
    schedule: '0 6 * * 1',
    timeZone: 'America/Toronto',
    description: 'Mirror systemManualCron weekly',
    uriEnv: 'SCHEDULER_URI_SYSTEM_MANUAL',
    defaultPath: '/updateSystemManual',
  },
  {
    name: 'resumora-system-health',
    schedule: '*/15 * * * *',
    timeZone: 'America/Toronto',
    description: 'Periodic System Health / self-heal tick (HTTP)',
    uriEnv: 'SCHEDULER_URI_SYSTEM_HEALTH',
    defaultPath: '/runSystemHealth',
  },
];

function gcloud(args) {
  const opts = {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  };
  if (process.platform === 'win32') opts.shell = true;
  return execFileSync(GCLOUD, args, opts);
}

function jobUri(job) {
  const fromEnv = String(process.env[job.uriEnv] || '').trim();
  if (fromEnv) return fromEnv;
  // Cloud Run function URL pattern (override via env in real projects)
  return `https://${job.defaultPath.replace(/^\//, '').toLowerCase()}-${region}-${project}.cloudfunctions.net${job.defaultPath}`;
}

function main() {
  if (!project) {
    console.error('Set GCP_PROJECT_ID before running.');
    process.exit(2);
  }

  const plan = JOBS.map((job) => ({
    ...job,
    uri: jobUri(job),
    gcloudCreate: [
      'scheduler',
      'jobs',
      'create',
      'http',
      job.name,
      `--project=${project}`,
      `--location=${location}`,
      `--schedule=${job.schedule}`,
      `--time-zone=${job.timeZone}`,
      `--uri=${jobUri(job)}`,
      '--http-method=POST',
      `--description=${job.description}`,
      ...(oidcSa
        ? [`--oidc-service-account-email=${oidcSa}`, `--oidc-token-audience=${jobUri(job)}`]
        : ['--quiet']),
    ],
  }));

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        project,
        region,
        location,
        note: 'Firebase Hosting remains client-resumora-live. No Vercel. Stripe secrets stay in Secret Manager.',
        jobs: plan.map((p) => ({
          name: p.name,
          schedule: p.schedule,
          timeZone: p.timeZone,
          uri: p.uri,
        })),
      },
      null,
      2
    )
  );

  if (!apply) {
    console.error('\nDry-run only. Re-run with --apply to create/update Cloud Scheduler jobs.');
    process.exit(0);
  }

  let failed = 0;
  for (const job of plan) {
    try {
      try {
        gcloud([
          'scheduler',
          'jobs',
          'describe',
          job.name,
          `--project=${project}`,
          `--location=${location}`,
        ]);
        // Update existing
        const updateArgs = [
          'scheduler',
          'jobs',
          'update',
          'http',
          job.name,
          `--project=${project}`,
          `--location=${location}`,
          `--schedule=${job.schedule}`,
          `--time-zone=${job.timeZone}`,
          `--uri=${job.uri}`,
          '--http-method=POST',
        ];
        if (oidcSa) {
          updateArgs.push(`--oidc-service-account-email=${oidcSa}`);
          updateArgs.push(`--oidc-token-audience=${job.uri}`);
        }
        console.error(`Updating ${job.name}…`);
        gcloud(updateArgs);
      } catch {
        console.error(`Creating ${job.name}…`);
        gcloud(job.gcloudCreate);
      }
      console.error(`OK ${job.name}`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL ${job.name}:`, String(err && err.message ? err.message : err).slice(0, 400));
    }
  }
  process.exit(failed ? 1 : 0);
}

main();
