/**
 * HeyGen v3 avatar video integration (Cloud Functions / Cloud Run).
 *
 * Mirrors the proven API calls from pipeline/scripts/heygen-pipeline.js
 * (POST https://api.heygen.com/v3/videos, poll /v3/videos/{id}).
 *
 * Env:
 *   HEYGEN_API_KEY          (required)
 *   HEYGEN_AVATAR_ID        default avatar_id
 *   HEYGEN_VOICE_ID         default voice_id
 */
'use strict';

const HEYGEN_BASE = 'https://api.heygen.com';
const HEYGEN_V3_VIDEOS = `${HEYGEN_BASE}/v3/videos`;

function apiKey() {
  return String(process.env.HEYGEN_API_KEY || '').trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Minimal fetch wrapper with timeout + clear errors. */
async function request(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = { raw: text.slice(0, 300) };
    }
    if (!res.ok) {
      throw new Error(`HeyGen HTTP ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
    }
    return data;
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error(`Timed out calling ${url}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Build a single-avatar studio payload for a script line. */
function buildPayload(scriptText, avatarId, opts) {
  return {
    type: 'studio',
    format: 'mp4',
    dimension: { width: 1920, height: 1080 },
    scenes: [
      {
        character: { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' },
        voice: { type: 'voice_id', voice_id: opts.voiceId },
        line: { type: 'text', text: String(scriptText || '') },
      },
    ],
  };
}

/**
 * Submit a video generation request (non-blocking).
 * Returns the HeyGen video_id.
 */
async function submitAvatarVideo(scriptText, avatarId, opts = {}) {
  const key = opts.apiKey || apiKey();
  if (!key) throw new Error('HEYGEN_API_KEY is not configured');
  const data = await request(
    HEYGEN_V3_VIDEOS,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
      body: JSON.stringify(buildPayload(scriptText, avatarId, opts)),
    },
    120000
  );
  const videoId = data && (data.data?.video_id || data.video_id || data.data?.id);
  if (!videoId)
    throw new Error(`HeyGen returned no video_id: ${JSON.stringify(data).slice(0, 400)}`);
  return String(videoId);
}

/** Fetch current render status + (when complete) the video URL. */
async function getVideoStatus(videoId, opts = {}) {
  const key = opts.apiKey || apiKey();
  if (!key) throw new Error('HEYGEN_API_KEY is not configured');
  const data = await request(
    `${HEYGEN_V3_VIDEOS}/${encodeURIComponent(videoId)}`,
    { headers: { 'X-Api-Key': key } },
    20000
  );
  const status = String((data && (data.data?.status || data.status)) || '').toLowerCase();
  const videoUrl = (data && (data.data?.video_url || data.data?.url || data.video_url)) || '';
  return { status, videoUrl, raw: data };
}

/**
 * Submit + poll until completed. Returns { videoId, videoUrl }.
 * BLOCKING — use only in scripts/CLI, never inside a Cloud Function request
 * (HeyGen renders take minutes and exceed the function timeout).
 */
async function generateAvatarVideo(scriptText, avatarId, opts = {}) {
  const pollIntervalMs = opts.pollIntervalMs || 15000;
  const timeoutMs = opts.timeoutMs || 2 * 60 * 60 * 1000;
  const videoId = await submitAvatarVideo(scriptText, avatarId, opts);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { status, videoUrl } = await getVideoStatus(videoId, opts);
    if (status === 'completed' || status === 'success') {
      if (!videoUrl) throw new Error(`HeyGen completed but gave no video_url for ${videoId}`);
      return { videoId, videoUrl };
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`HeyGen render failed for ${videoId} (status=${status})`);
    }
    if (Date.now() > deadline) throw new Error(`Timed out waiting for HeyGen video ${videoId}`);
    await sleep(pollIntervalMs);
  }
}

module.exports = {
  HEYGEN_V3_VIDEOS,
  submitAvatarVideo,
  getVideoStatus,
  generateAvatarVideo,
};
