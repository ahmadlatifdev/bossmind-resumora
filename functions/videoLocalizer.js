/**
 * Proxy to Cloud Run video-localizer (Whisper + EdgeTTS pipeline).
 * Secrets: LOCALIZER_SHARED_SECRET, VIDEO_LOCALIZER_URL — never logged.
 */

const LOCALIZER_URL = () => String(process.env.VIDEO_LOCALIZER_URL || '').replace(/\/$/, '');
const SHARED = () => String(process.env.LOCALIZER_SHARED_SECRET || '').trim();

async function callLocalizer(path, { method = 'GET', body } = {}) {
  const base = LOCALIZER_URL();
  if (!base) {
    const err = new Error('VIDEO_LOCALIZER_URL is not configured');
    err.code = 'CONFIG';
    throw err;
  }
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  const secret = SHARED();
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
    headers['X-Localizer-Secret'] = secret;
  }
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.detail || data.error || `Localizer HTTP ${res.status}`);
    err.status = res.status;
    err.code = 'UPSTREAM';
    throw err;
  }
  return data;
}

async function startLocalize({ videoId, targetLanguage, sourceUrl }) {
  return callLocalizer('/v1/localize', {
    method: 'POST',
    body: {
      video_id: videoId,
      target_language: targetLanguage,
      source_url: sourceUrl,
      update_firestore: true,
    },
  });
}

async function getJob(jobId) {
  return callLocalizer(`/v1/jobs/${encodeURIComponent(jobId)}`, { method: 'GET' });
}

module.exports = { startLocalize, getJob, LOCALIZER_URL };
