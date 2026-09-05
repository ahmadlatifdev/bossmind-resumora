#!/usr/bin/env node
/**
 * Firebase App Check — reCAPTCHA Enterprise (score-based) for resumora.net Web App.
 * Never prints secret keys or sk_live_/whsec_/pk_live_/price_ values.
 *
 * Env:
 *   GCP_PROJECT_ID (default resumora-live)
 *   FIREBASE_WEB_APP_ID (VITE_FIREBASE_APP_ID)
 *   APP_CHECK_DOMAINS (comma-separated, default resumora.net,www.resumora.net)
 *   APP_CHECK_RISK_THRESHOLD (default 0.5)
 *   RECAPTCHA_KEY_DISPLAY_NAME (default Resumora Web App Check)
 *
 * Requires: gcloud auth application-default login OR CI OIDC ADC.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const project = process.env.GCP_PROJECT_ID || 'resumora-live';
const appId =
  process.env.FIREBASE_WEB_APP_ID ||
  process.env.VITE_FIREBASE_APP_ID ||
  '1:994522492058:web:26ef921ce6a38003a4c323';
const domains = (process.env.APP_CHECK_DOMAINS || 'resumora.net,www.resumora.net')
  .split(',')
  .map((d) => d.trim())
  .filter(Boolean);
const riskThreshold = Number(process.env.APP_CHECK_RISK_THRESHOLD || 0.5);
const displayName = process.env.RECAPTCHA_KEY_DISPLAY_NAME || 'Resumora Web App Check';
const outPath = process.env.APP_CHECK_OUTPUT_JSON || 'artifacts/app-check-config.json';

function log(step, extra = {}) {
  console.log(JSON.stringify({ scope: 'setup-app-check', step, ...extra }));
}

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function ensureDir(filePath) {
  const dir = filePath.replace(/[/\\][^/\\]+$/, '');
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

try {
  log('enable_apis');
  run(`gcloud services enable recaptchaenterprise.googleapis.com firebaseappcheck.googleapis.com --project=${project}`);

  const domainFlags = domains.map((d) => `--domains=${d}`).join(' ');
  log('create_recaptcha_key', { domains, riskThreshold });
  const keyJson = run(
    `gcloud recaptcha keys create ${displayName.replace(/\s+/g, '-').toLowerCase()} --project=${project} --web ${domainFlags} --integration-type=score --display-name="${displayName}" --format=json`
  );
  const key = JSON.parse(keyJson);
  const siteKey = key.name?.split('/').pop() || key.keyId || null;

  if (!siteKey) {
    throw new Error('reCAPTCHA Enterprise key created but site key id missing from response');
  }

  log('register_app_check', { appId: appId.slice(0, 12) + '…' });
  // Firebase App Check provider registration (reCAPTCHA Enterprise)
  const token = run('gcloud auth print-access-token').trim();
  const registerUrl = `https://firebaseappcheck.googleapis.com/v1/projects/${project}/apps/${encodeURIComponent(appId)}/recaptchaEnterpriseConfig?updateMask=siteKey`;
  const res = await fetch(registerUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ siteKey }),
  });

  const registerText = await res.text();
  if (!res.ok && !registerText.includes('ALREADY_EXISTS')) {
    log('register_warn', { status: res.status, hint: registerText.slice(0, 200) });
  } else {
    log('register_ok', { status: res.status });
  }

  ensureDir(outPath);
  const artifact = {
    project,
    appId,
    recaptchaSiteKey: siteKey,
    domains,
    riskThreshold,
    enforcementNote:
      'Set enforcement to score >= threshold in Firebase Console > App Check, or via API after deploy.',
    clientEnvKey: 'VITE_FIREBASE_APP_CHECK_SITE_KEY',
  };
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));

  log('complete', {
    siteKeyPrefix: String(siteKey).slice(0, 8) + '…',
    output: outPath,
    nextStep: `Set GitHub secret / env name VITE_FIREBASE_APP_CHECK_SITE_KEY (value not logged)`,
  });
} catch (err) {
  const msg = err.stderr?.toString?.() || err.message || String(err);
  console.error(JSON.stringify({ scope: 'setup-app-check', step: 'error', message: msg.slice(0, 400) }));
  process.exit(1);
}
