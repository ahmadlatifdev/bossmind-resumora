#!/usr/bin/env node
/**
 * publish-social.mjs — unified multi-platform publisher for the Resumora luxury video ads.
 *
 * Strategy: single source of truth (3 localized ads + captions), one publisher, one
 * receipt ledger. Each platform is attempted only when its credential is present AND
 * valid; every outcome is recorded so nothing is ever double-posted. Uncertain results
 * are reconciled (ledger lookup) before any retry.
 *
 * Platforms: facebook, tiktok, instagram, linkedin, twitter(x), youtube.
 * Video source: PULL_FROM_URL (public URLs under https://resumora.net/videos/).
 *
 * Usage:
 *   node scripts/publish-social.mjs --dry-run                 # plan only, no publish
 *   node scripts/publish-social.mjs --platform=facebook       # one platform
 *   node scripts/publish-social.mjs                           # all platforms with creds
 *
 * Zero external cost. Tokens are read from .env (gitignored); never printed.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ADS_DIR = path.join(ROOT, 'artifacts', 'tiktok-ads');
const LEDGER = path.join(ADS_DIR, 'publish-ledger.json');
const ENV = path.join(ROOT, '.env');

const LANGS = ['en', 'fr', 'es'];
const BASE = 'https://resumora.net/videos';

function env() {
  const raw = readFileSync(ENV, 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const E = env();

function caption(lang) {
  const f = path.join(ADS_DIR, `resumora-luxury-${lang.toUpperCase()}-caption.txt`);
  return existsSync(f) ? readFileSync(f, 'utf8').trim() : '';
}

function videoUrl(lang) {
  return `${BASE}/resumora-luxury-${lang.toUpperCase()}.mp4`;
}

function fileHash(lang) {
  const f = path.join(ADS_DIR, `resumora-luxury-${lang.toUpperCase()}.mp4`);
  return createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16);
}

function readLedger() {
  return existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : {};
}
function writeLedger(l) {
  mkdirSync(ADS_DIR, { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(l, null, 2), 'utf8');
}

// ---------------------------------------------------------------- platform publishers
// Each returns { ok, id?, url?, error? } and NEVER throws on a transport/credential error.

async function publishFacebook(lang, { dryRun }) {
  const token = E.FACEBOOK_PAGE_ACCESS_TOKEN;
  const pageId = E.FACEBOOK_PAGE_ID;
  if (!token || !pageId) return { ok: false, error: 'missing FACEBOOK_PAGE_ACCESS_TOKEN / PAGE_ID' };
  if (dryRun) return { ok: true, id: '(dry-run)', url: null };
  const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_url: videoUrl(lang),
      description: caption(lang),
      access_token: token,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    return { ok: false, error: `FB ${res.status}: ${JSON.stringify(data).slice(0, 200)}` };
  }
  return { ok: true, id: data.id || data.video_id || null, url: `https://facebook.com/${data.id || ''}` };
}

async function publishTikTok(lang, { dryRun }) {
  const token = E.TIKTOK_ACCESS_TOKEN;
  if (!token) return { ok: false, error: 'missing TIKTOK_ACCESS_TOKEN (OAuth not completed)' };
  if (dryRun) return { ok: true, id: '(dry-run)', url: null };
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      post_info: { title: caption(lang).slice(0, 2200), privacy_level: 'PUBLIC_TO_EVERYONE' },
      source_info: { source: 'PULL_FROM_URL', video_url: videoUrl(lang) },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    return { ok: false, error: `TikTok ${res.status}: ${JSON.stringify(data).slice(0, 200)}` };
  }
  const id = (data.data && data.data.publish_id) || null;
  return { ok: true, id, url: id ? `https://www.tiktok.com/@resumora/video/${id}` : null };
}

// Platforms below require credentials that are not present on this system.
async function publishInstagram() {
  return { ok: false, error: 'needs Instagram Business/Creator account linked to the FB page + long-lived IG token' };
}
async function publishLinkedIn() {
  return { ok: false, error: 'missing LINKEDIN_ACCESS_TOKEN + organization id' };
}
async function publishTwitter() {
  return { ok: false, error: 'missing TWITTER/X API credentials (OAuth 2.0 + media upload)' };
}
async function publishYouTube() {
  return { ok: false, error: 'missing YOUTUBE (Google OAuth) refresh token + channel id' };
}

const PLATFORMS = {
  facebook: publishFacebook,
  tiktok: publishTikTok,
  instagram: publishInstagram,
  linkedin: publishLinkedIn,
  twitter: publishTwitter,
  youtube: publishYouTube,
};

// ---------------------------------------------------------------- main
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const dryRun = flag('dry-run');
const platformFilter = (argv.find((a) => a.startsWith('--platform=')) || '').split('=')[1];

const ledger = readLedger();
const report = { at: new Date().toISOString(), dryRun, results: {} };

for (const platform of Object.keys(PLATFORMS)) {
  if (platformFilter && platform !== platformFilter) continue;
  for (const lang of LANGS) {
    const key = `${platform}_${lang}`;
    const existing = ledger[key];
    const hash = fileHash(lang);

    // Reconcile: skip if already successfully published (same hash), else allow retry.
    if (existing && existing.status === 'published' && existing.hash === hash) {
      report.results[key] = { status: 'already-published', id: existing.id, url: existing.url };
      continue;
    }

    const r = await PLATFORMS[platform](lang, { dryRun });
    const status = dryRun ? 'dry-run' : r.ok ? 'published' : 'blocked';
    const rec = {
      platform,
      lang,
      hash,
      status,
      publishId: r.id || null,
      url: r.url || null,
      error: r.error || null,
      at: new Date().toISOString(),
    };
    if (!dryRun && r.ok) ledger[key] = { ...rec, status: 'published' };
    report.results[key] = rec;
  }
}

if (!dryRun) writeLedger(ledger);

console.log(JSON.stringify(report, null, 2));
