/**
 * Video library API (browser → Resumora Cloud Functions).
 * HeyGen removed — catalog + download tracking only; publish via Bilibili pipeline.
 */

import { auth } from './firebase';

const API_BASE = '';

async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Video API failed (${res.status})`);
  }
  return data;
}

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Video API failed (${res.status})`);
  }
  return data;
}

/** Prefetched library catalog (Firestore-backed when available). */
export function fetchVideoCatalog() {
  return getJson('/api/video/catalog');
}

/** Server-side download tracking (5-cap). */
export function trackVideoDownload(payload) {
  return postJson('/api/video/download', payload);
}

/** Auth + subscription-gated signed stream URL for a private GCS video. */
export async function fetchVideoStreamUrl({ videoId, language = 'en' }) {
  let token = '';
  try {
    token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  } catch {
    token = '';
  }
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/video/signed-url`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ videoId, language }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Stream URL failed (${res.status})`);
  }
  return data;
}

/** True when a URL uses the r2://bucket/key scheme (Cloudflare R2 reference). */
export function isR2Url(url) {
  return /^r2:\/\//i.test(String(url || '').trim());
}

/** Parse r2://bucket/key into { bucket, key }. Returns null for non-r2 URLs. */
export function parseR2Url(url) {
  const match = String(url || '')
    .trim()
    .match(/^r2:\/\/([^/]+)\/(.+)$/i);
  if (!match) return null;
  return { bucket: match[1], key: match[2] };
}

/**
 * Resolve an r2://bucket/key reference into a temporary signed link by calling
 * the `secureAssetUrl` Firebase function (hosted at /api/secure-asset-url).
 */
export async function secureAssetUrl(r2Url) {
  const parsed = parseR2Url(r2Url);
  if (!parsed) return r2Url;

  let token = '';
  try {
    token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  } catch {
    token = '';
  }
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/secure-asset-url`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ bucket: parsed.bucket, key: parsed.key }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Secure asset URL failed (${res.status})`);
  }
  return data.url || data.signedUrl || data.signed_url || '';
}

export const CORE_VIDEO_PROMPTS = Object.freeze([
  {
    id: 'vid-resume-to-interview',
    title: 'Resume-to-Interview Mastery (ATS Optimization)',
    prompt:
      '8-minute Resumora lesson: AI Keyword Tool alignment, ATS score to STAR talking points, project-first formats for fresher and senior. EN/FR/ES masters. 1080p.',
  },
  {
    id: 'vid-star-behavioral',
    title: 'Behavioral & STAR Method Excellence',
    prompt:
      '8-minute Resumora lesson: STAR deep-dive, 4-5 story blocks, greatest weakness with transparent growth. On-screen STAR diagram. EN/FR/ES. 1080p.',
  },
  {
    id: 'vid-situational-async',
    title: 'Situational & Asynchronous Interview Strategy',
    prompt:
      '8-minute Resumora lesson: situational EQ prompts, 2+6 timing, 30-second commanding intro. EN/FR/ES. 1080p.',
  },
  {
    id: 'vid-global-career',
    title: 'Multi-Language & Global Career Positioning',
    prompt:
      '8-minute Resumora lesson: India/US/UK/Canada/Australia nuances, body language, geo-tuned AI Job Search Assistant. EN/FR/ES. 1080p.',
  },
]);
