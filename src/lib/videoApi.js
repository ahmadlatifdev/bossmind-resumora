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

export const CORE_VIDEO_PROMPTS = Object.freeze([
  {
    id: 'vid-resume-writing',
    title: 'Resume writing that gets interviews',
    prompt:
      'Professional career coach avatar. Scene 1 talking-head intro. Scene 2 B-roll desk writing. Scene 3 bullet examples on screen. Scene 4 B-roll handshake. Scene 5 closing tip. Duration about 5 minutes. English.',
  },
  {
    id: 'vid-ats-optimization',
    title: 'ATS optimization essentials',
    prompt:
      'Career coach explains ATS keywords. Mix talking-head with B-roll of resume scanning UI. Include two pure B-roll scenes. About 5 minutes. English.',
  },
  {
    id: 'vid-linkedin-tips',
    title: 'LinkedIn tips that sync with your resume',
    prompt:
      'Coach covers LinkedIn headline and About section. Talking-head + LinkedIn UI B-roll + office B-roll. About 5 minutes. English.',
  },
  {
    id: 'vid-interview-prep',
    title: 'Interview preparation that closes offers',
    prompt:
      'Coach teaches STAR answers and closing questions. Include two B-roll scenes (interview room, notes). About 5 minutes. English.',
  },
]);
