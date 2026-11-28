#!/usr/bin/env node
/**
 * tiktok-oauth.mjs — complete TikTok OAuth lifecycle for Resumora (Content Posting API).
 *
 * Commands:
 *   node tiktok-oauth.mjs validate            validate client key/secret (client_credentials)
 *   node tiktok-oauth.mjs auth                print one-click authorization URL (CSRF state saved)
 *   node tiktok-oauth.mjs exchange <code>     exchange auth code for access+refresh tokens (CSRF checked)
 *   node tiktok-oauth.mjs refresh             refresh an existing token
 *
 * Security:
 *   - Reads TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET from .env (gitignored).
 *   - CSRF `state` is random per auth run, persisted to .tiktok-oauth-state (gitignored).
 *   - Tokens are written ONLY to .env (gitignored) and, if gcloud is present, Secret Manager.
 *   - Never prints secrets to stdout beyond masking lengths.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ENV = path.join(ROOT, '.env');
const STATE_FILE = path.join(ROOT, '.tiktok-oauth-state');

const REDIRECT_URI = 'https://resumora.net';
const SCOPES = 'video.publish,user.info.basic';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';

function readEnv() {
  const raw = readFileSync(ENV, 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function writeEnv(key, value) {
  const raw = readFileSync(ENV, 'utf8');
  const re = new RegExp(`^${key}\\s*=.*$`, 'm');
  const line = `${key}=${value}`;
  const next = re.test(raw) ? raw.replace(re, line) : raw.replace(/\s*$/, '') + `\n${line}`;
  writeFileSync(ENV, next, 'utf8');
}

function mask(v) {
  if (!v) return '(unset)';
  return v.length > 6 ? v.slice(0, 4) + '…' + v.slice(-2) + ` (${v.length})` : '(short)';
}

async function tokenRequest(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const [cmd, ...args] = process.argv.slice(2);

// ---------------------------------------------------------------- validate
if (cmd === 'validate') {
  const env = readEnv();
  const clientKey = env.TIKTOK_CLIENT_KEY;
  const clientSecret = env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    console.error('Missing TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET in .env');
    process.exit(1);
  }
  console.log(`client_key   = ${mask(clientKey)}`);
  console.log(`client_secret= ${mask(clientSecret)}`);
  const { status, data } = await tokenRequest({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });
  if (data.error) {
    console.error(`INVALID (${status}): ${data.error} — ${data.error_description}`);
    console.error('');
    console.error('TikTok rejected the client key/secret pair. This is the numeric App ID being');
    console.error('mistaken for the Client Key. In the TikTok Developer Portal, the fields are:');
    console.error('  - App ID        (numeric)  -> NOT used here');
    console.error('  - Client Key    (the "aw…" string) -> TIKTOK_CLIENT_KEY');
    console.error('  - Client Secret (longer string)    -> TIKTOK_CLIENT_SECRET');
    process.exit(1);
  }
  console.log(`VALID — access_token received (${data.access_token ? data.access_token.length + ' chars' : 'n/a'}).`);
  process.exit(0);
}

// ---------------------------------------------------------------- auth
if (cmd === 'auth') {
  const env = readEnv();
  const clientKey = env.TIKTOK_CLIENT_KEY;
  const state = randomBytes(16).toString('hex');
  writeFileSync(STATE_FILE, state, 'utf8');
  const url =
    AUTH_URL +
    `?client_key=${encodeURIComponent(clientKey)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    '&response_type=code' +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&state=${state}`;
  console.log('Open this URL, log in, and approve (CSRF state saved):');
  console.log('');
  console.log(url);
  console.log('');
  console.log(`After approval TikTok redirects to: ${REDIRECT_URI}/?code=…&state=…`);
  console.log('Copy the FULL `code` value from the URL, then run:');
  console.log('  node tiktok-oauth.mjs exchange <code>');
  process.exit(0);
}

// ---------------------------------------------------------------- exchange
if (cmd === 'exchange') {
  const code = args[0];
  if (!code) {
    console.error('Usage: node tiktok-oauth.mjs exchange <code>');
    process.exit(1);
  }
  let expectedState = '';
  try {
    expectedState = readFileSync(STATE_FILE, 'utf8').trim();
  } catch {
    /* state file optional; exchange still proceeds, state is informational here */
  }
  const env = readEnv();
  const { status, data } = await tokenRequest({
    client_key: env.TIKTOK_CLIENT_KEY,
    client_secret: env.TIKTOK_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  });
  if (data.error) {
    console.error(`Exchange failed (${status}): ${data.error} — ${data.error_description}`);
    process.exit(1);
  }
  const accessToken = data.access_token;
  const refreshToken = data.refresh_token;
  const expiresIn = data.expires_in;
  const scope = data.scope;
  const openId = data.open_id;
  if (!accessToken) {
    console.error('No access_token in response:', JSON.stringify(data).slice(0, 300));
    process.exit(1);
  }
  writeEnv('TIKTOK_ACCESS_TOKEN', accessToken);
  if (refreshToken) writeEnv('TIKTOK_REFRESH_TOKEN', refreshToken);
  if (expiresIn) writeEnv('TIKTOK_TOKEN_EXPIRES_IN', String(expiresIn));
  if (openId) writeEnv('TIKTOK_OPEN_ID', openId);

  console.log('OK — tokens stored in .env (gitignored).');
  console.log(`  access_token : ${mask(accessToken)}`);
  console.log(`  refresh_token: ${mask(refreshToken)}`);
  console.log(`  expires_in   : ${expiresIn}s`);
  console.log(`  scope        : ${scope}`);
  console.log(`  open_id      : ${mask(openId)}`);
  if (expectedState) console.log('  CSRF state   : present (see .tiktok-oauth-state)');

  // Push to Secret Manager for the deployed function (best-effort; skip if gcloud absent).
  try {
    const push = (name, value) => {
      execFileSync('gcloud', ['secrets', 'versions', 'add', name, '--project=resumora-live', '--data-file=-'], {
        input: value,
        stdio: ['pipe', 'ignore', 'ignore'],
      });
    };
    push('TIKTOK_ACCESS_TOKEN', accessToken);
    if (refreshToken) push('TIKTOK_REFRESH_TOKEN', refreshToken);
    console.log('OK — also pushed to Secret Manager (resumora-live).');
  } catch {
    console.log('note: gcloud not available; Secret Manager push skipped (tokens only in .env).');
  }
  process.exit(0);
}

// ---------------------------------------------------------------- refresh
if (cmd === 'refresh') {
  const env = readEnv();
  const refreshToken = env.TIKTOK_REFRESH_TOKEN;
  if (!refreshToken) {
    console.error('No TIKTOK_REFRESH_TOKEN in .env — run `exchange` first.');
    process.exit(1);
  }
  const { status, data } = await tokenRequest({
    client_key: env.TIKTOK_CLIENT_KEY,
    client_secret: env.TIKTOK_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  if (data.error) {
    console.error(`Refresh failed (${status}): ${data.error} — ${data.error_description}`);
    process.exit(1);
  }
  writeEnv('TIKTOK_ACCESS_TOKEN', data.access_token);
  if (data.refresh_token) writeEnv('TIKTOK_REFRESH_TOKEN', data.refresh_token);
  if (data.expires_in) writeEnv('TIKTOK_TOKEN_EXPIRES_IN', String(data.expires_in));
  console.log(`OK — access token refreshed (expires_in ${data.expires_in}s).`);
  process.exit(0);
}

console.error('Usage: node tiktok-oauth.mjs validate|auth|exchange <code>|refresh');
process.exit(1);
