#!/usr/bin/env node
/**
 * Roll back Firebase Hosting live channel from live-backup snapshot.
 * Requires Application Default Credentials (OIDC in CI).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const project = process.env.GCP_PROJECT_ID || 'resumora-live';
const site = process.env.HOSTING_SITE || 'client-resumora-live';
const backupChannel = process.env.HOSTING_BACKUP_CHANNEL || 'live-backup';

function log(msg) {
  console.log(`[rollback] ${msg}`);
}

function run(cmd) {
  log(`> ${cmd}`);
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function channelExists(channelId) {
  try {
    const out = run(
      `npx firebase-tools@latest hosting:channel:list --project ${project} --json --non-interactive`
    );
    const data = JSON.parse(out);
    const channels = data?.result?.channels || data?.channels || [];
    return channels.some((c) => String(c.channelId || c.id || '') === channelId);
  } catch {
    return false;
  }
}

try {
  if (!channelExists(backupChannel)) {
    log(`No ${backupChannel} channel — live was never promoted this run; rollback skipped`);
    fs.writeFileSync(
      'deploy-rollback-result.json',
      JSON.stringify({ rolledBack: false, reason: 'no_backup_channel' }, null, 2)
    );
    process.exit(0);
  }

  run(
    `npx firebase-tools@latest hosting:clone ${site}:${backupChannel} ${site}:live --project ${project} --non-interactive`
  );
  log('Rollback: Success — live restored from live-backup');
  fs.writeFileSync(
    'deploy-rollback-result.json',
    JSON.stringify({ rolledBack: true, fromChannel: backupChannel }, null, 2)
  );
} catch (err) {
  const msg = err.stderr?.toString?.() || err.message || String(err);
  log(`Rollback FAILED: ${msg.slice(0, 400)}`);
  fs.writeFileSync(
    'deploy-rollback-result.json',
    JSON.stringify({ rolledBack: false, error: msg.slice(0, 500) }, null, 2)
  );
  process.exit(1);
}
