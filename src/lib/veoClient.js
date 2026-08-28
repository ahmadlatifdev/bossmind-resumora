/**
 * Google Veo 3 client (browser → Resumora Cloud Functions).
 * Requires Firebase ID token; secrets stay on the server.
 */

import { auth } from './firebase';

async function authHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in required');
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Veo request failed (${res.status})`);
    err.code = data.code || null;
    err.fallback = data.fallback || null;
    err.attempts = data.attempts || null;
    throw err;
  }
  return data;
}

async function getJson(path) {
  const res = await fetch(path, {
    method: 'GET',
    headers: await authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Veo status failed (${res.status})`);
  }
  return data;
}

/** Start Veo generation (server may return pending + operationName). */
export function createGoogleVideo(payload) {
  return postJson('/api/video/google-generate', {
    ...payload,
    // Prefer async through Hosting to avoid gateway timeouts unless agent workflow runs server-side.
    async: payload?.agent === true ? false : true,
    wait: payload?.agent === true ? true : false,
  });
}

/** Agentic Veo/localize workflow (capped retries). */
export function runVideoGenerationAgent(payload) {
  return postJson('/api/video/agent-generate', payload || {});
}

/** Poll Veo LRO until completed / failed / timeout. */
export async function pollGoogleVideo(operationName, { maxAttempts = 60, onProgress } = {}) {
  let delay = 4000;
  for (let i = 0; i < maxAttempts; i += 1) {
    const status = await getJson(
      `/api/video/google-status?operationName=${encodeURIComponent(operationName)}`
    );
    if (typeof onProgress === 'function') onProgress(status);
    if (status.done && (status.videoUrl || status.status === 'completed')) {
      return status;
    }
    if (status.status === 'failed' || status.error) {
      throw new Error(status.error || 'Google Veo generation failed');
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(15000, Math.round(delay * 1.2));
  }
  throw new Error('Google Veo generation timed out');
}

/** HeyGen generate via existing proxy (no auth required today). */
export function createHeyGenVideo(payload) {
  return fetch('/api/video/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload || {}),
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HeyGen failed (${res.status})`);
    return data;
  });
}
