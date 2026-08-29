#!/usr/bin/env node
/**
 * Blue-green Firebase Hosting deploy: channel -> smoke test -> clone to live.
 * Requires OIDC auth (Application Default Credentials) already configured.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const project = process.env.GCP_PROJECT_ID || 'resumora-live';
const site = process.env.HOSTING_SITE || 'client-resumora-live';
const channelId = process.env.CHANNEL_ID || `prod-candidate-${process.env.GITHUB_RUN_ID || Date.now()}`;
const maxAttempts = Number(process.env.DEPLOY_RETRY_MAX || 2);

function log(msg) {
  console.log(`[blue-green] ${msg}`);
}

function runCapture(cmd) {
  log(`> ${cmd}`);
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function runInherit(cmd) {
  log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function isTransient(errText) {
  const t = String(errText || '').toLowerCase();
  return (
    t.includes('etimedout') ||
    t.includes('econnreset') ||
    t.includes('econnrefused') ||
    t.includes('resource temporarily unavailable') ||
    t.includes('503') ||
    t.includes('429') ||
    t.includes('socket hang up') ||
    t.includes('network') ||
    t.includes('temporarily unavailable')
  );
}

function withRetry(label, fn) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return fn(attempt);
    } catch (err) {
      lastErr = err;
      const msg = err.stderr?.toString?.() || err.stdout?.toString?.() || err.message || String(err);
      log(`${label} attempt ${attempt}/${maxAttempts} failed`);
      if (attempt < maxAttempts && isTransient(msg)) {
        log('Transient error detected — retrying in 15s');
        execSync('sleep 15');
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function fetchUrl(url, { method = 'GET' } = {}) {
  const res = await fetch(url, {
    method,
    redirect: 'follow',
    headers: { 'User-Agent': 'Resumora-Deploy-Smoke/1.0' },
  });
  const body = method === 'GET' ? await res.text() : '';
  return { status: res.status, body, ok: res.ok };
}

function extractChannelUrl(deployOutput) {
  const m =
    deployOutput.match(/https:\/\/[^\s]+--[^\s]+\.web\.app/gi) ||
    deployOutput.match(/Channel URL[^\n]*https:\/\/[^\s]+/gi);
  if (m && m.length) {
    const url = m[m.length - 1].replace(/.*(https:\/\/[^\s]+).*/, '$1');
    return url.replace(/[)\],]+$/, '');
  }
  return `https://${site}--${channelId}.web.app`;
}

async function smokeTest(previewBase) {
  const base = previewBase.replace(/\/$/, '');
  log(`Smoke test base: ${base}`);

  const head = await fetchUrl(base, { method: 'HEAD' }).catch(async () => fetchUrl(base));
  if (head.status < 200 || head.status >= 400) {
    throw new Error(`Smoke test failed: HEAD/GET ${base} returned HTTP ${head.status}`);
  }
  log(`Home probe: HTTP ${head.status} — Success`);

  const homeBody = head.body || (await fetchUrl(base)).body;
  const homeOk =
    homeBody.includes('id="root"') ||
    homeBody.includes("id='root'") ||
    /resumora\.net/i.test(homeBody) ||
    /RESUMORA/i.test(homeBody);
  if (!homeOk) {
    throw new Error(
      'Smoke test failed: home HTML missing expected resumora.net content (#root or RESUMORA branding)'
    );
  }

  const videosUrl = `${base}/videos`;
  const videos = await fetchUrl(videosUrl);
  if (videos.status < 200 || videos.status >= 400) {
    throw new Error(`Smoke test failed: GET ${videosUrl} returned HTTP ${videos.status}`);
  }
  if (!videos.body.includes('videos-root')) {
    throw new Error('Smoke test failed: /videos HTML missing div#videos-root');
  }
  log('Videos probe: Success (videos-root present)');

  fs.writeFileSync(
    'deploy-smoke-result.json',
    JSON.stringify({ previewBase: base, homeStatus: head.status, videosStatus: videos.status, ok: true }, null, 2)
  );
}

async function main() {
  if (!fs.existsSync('dist/index.html')) {
    console.error('Deployment failed due to invalid build output in dist/: dist/index.html missing');
    process.exit(1);
  }

  let deployOut = '';
  withRetry('channel deploy', () => {
    deployOut = runCapture(
      `npx firebase-tools@latest hosting:channel:deploy ${channelId} --expires 7d --project ${project} --non-interactive`
    );
    process.stdout.write(deployOut);
  });

  const previewUrl = extractChannelUrl(deployOut);
  log(`Preview channel URL: ${previewUrl}`);

  try {
    await smokeTest(previewUrl);
  } catch (err) {
    log(`Smoke test FAILED — rolling back (not promoting to live): ${err.message}`);
    try {
      runInherit(
        `npx firebase-tools@latest hosting:channel:delete ${channelId} --project ${project} --non-interactive`
      );
      log('Preview channel deleted — live channel unchanged');
    } catch (delErr) {
      log(`Channel cleanup warning: ${delErr.message || delErr}`);
    }
    fs.writeFileSync(
      'deploy-failure-classification.json',
      JSON.stringify(
        {
          category: 'smoke_test_failed',
          transient: false,
          message: err.message,
          nextSteps: 'Fix frontend build/routes locally, npm run build, re-run workflow.',
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  withRetry('promote to live', () => {
    try {
      runInherit(
        `npx firebase-tools@latest hosting:clone ${site}:live ${site}:live-backup --project ${project} --non-interactive`
      );
      log('Live snapshot copied to live-backup channel');
    } catch (backupErr) {
      log(`Live-backup snapshot warning (non-fatal): ${backupErr.message || backupErr}`);
    }
    runInherit(
      `npx firebase-tools@latest hosting:clone ${site}:${channelId} ${site}:live --project ${project} --non-interactive`
    );
  });

  log('Blue-green promote: Success — live channel updated');
  try {
    runInherit(
      `npx firebase-tools@latest hosting:channel:delete ${channelId} --project ${project} --non-interactive`
    );
  } catch (_) {
    log('Preview channel cleanup skipped (non-fatal)');
  }
}

main().catch((err) => {
  const msg = err.stderr?.toString?.() || err.message || String(err);
  const transient = isTransient(msg);
  fs.writeFileSync(
    'deploy-failure-classification.json',
    JSON.stringify(
      {
        category: transient ? 'transient_infra' : 'persistent_deploy',
        transient,
        message: msg.slice(0, 500),
        nextSteps: transient
          ? 'Workflow will retry transient errors automatically where configured.'
          : 'Inspect deploy logs; fix dist/, firebase.json, or OIDC IAM; push fix and re-run.',
      },
      null,
      2
    )
  );
  console.error(`[blue-green] FAILURE: ${msg.slice(0, 400)}`);
  process.exit(1);
});
