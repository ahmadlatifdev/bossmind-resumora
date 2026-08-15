/**
 * HeyGen API client helpers (browser → Resumora Cloud Functions).
 * Secrets never leave the server; only session/video IDs and public MP4 URLs return to the client.
 */

const API_BASE = "";

async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HeyGen proxy failed (${res.status})`);
  }
  return data;
}

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HeyGen proxy failed (${res.status})`);
  }
  return data;
}

/** Create / queue a video generation job (async). */
export function createHeyGenVideo(payload) {
  return postJson("/api/video/generate", payload);
}

/** Poll video status with exponential backoff. */
export async function pollHeyGenVideo(videoId, { maxAttempts = 40, onProgress } = {}) {
  let delay = 1000;
  for (let i = 0; i < maxAttempts; i += 1) {
    const status = await getJson(`/api/video/status?videoId=${encodeURIComponent(videoId)}`);
    if (typeof onProgress === "function") onProgress(status);
    const state = String(status.status || status.data?.status || "").toLowerCase();
    if (state === "completed" || state === "done" || status.video_url || status.data?.video_url) {
      return status;
    }
    if (state === "failed" || state === "error") {
      throw new Error(status.error || status.data?.error || "HeyGen video generation failed");
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(10000, Math.round(delay * 1.5));
  }
  throw new Error("HeyGen video generation timed out");
}

/** Prefetched library catalog (Firestore-backed when available). */
export function fetchVideoCatalog() {
  return getJson("/api/video/catalog");
}

/** Server-side download tracking (5-cap). */
export function trackVideoDownload(payload) {
  return postJson("/api/video/download", payload);
}

export const CORE_VIDEO_PROMPTS = Object.freeze([
  {
    id: "vid-resume-writing",
    title: "Resume writing that gets interviews",
    prompt:
      "Professional career coach avatar. Scene 1 talking-head intro. Scene 2 B-roll desk writing. Scene 3 bullet examples on screen. Scene 4 B-roll handshake. Scene 5 closing tip. Duration about 5 minutes. English.",
  },
  {
    id: "vid-ats-optimization",
    title: "ATS optimization essentials",
    prompt:
      "Career coach explains ATS keywords. Mix talking-head with B-roll of resume scanning UI. Include two pure B-roll scenes. About 5 minutes. English.",
  },
  {
    id: "vid-linkedin-tips",
    title: "LinkedIn tips that sync with your resume",
    prompt:
      "Coach covers LinkedIn headline and About section. Talking-head + LinkedIn UI B-roll + office B-roll. About 5 minutes. English.",
  },
  {
    id: "vid-interview-prep",
    title: "Interview preparation that closes offers",
    prompt:
      "Coach teaches STAR answers and closing questions. Include two B-roll scenes (interview room, notes). About 5 minutes. English.",
  },
]);
