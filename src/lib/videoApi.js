/**
 * Video library API (browser → Resumora Cloud Functions).
 * HeyGen removed — catalog + download tracking only; publish via Bilibili pipeline.
 */

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
