/**
 * VEED API adapter — lip-sync / audio processing for the cinematic pipeline.
 *
 * IMPORTANT: VEED's public/Enterprise REST contract should be verified against
 * https://docs.veed.io before relying on it. This adapter uses the documented
 * create-render → poll-status shape and reads VEED_API_KEY / VEED_API_BASE from
 * env so the endpoint is trivially correctable without a code change.
 */
'use strict';

const VEED_API_BASE = process.env.VEED_API_BASE || 'https://api.veed.io';

function apiKey() {
  return String(process.env.VEED_API_KEY || '').trim();
}

async function request(path, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${VEED_API_BASE}${path}`, { ...options, signal: controller.signal });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = { raw: text.slice(0, 300) };
    }
    if (!res.ok) {
      throw new Error(`VEED HTTP ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
    }
    return data;
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error(`Timed out calling ${path}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Submit a render. Returns a render id.
 * (Adjust body fields to match VEED's actual schema.)
 */
async function submitRender(opts = {}) {
  const key = apiKey();
  if (!key) throw new Error('VEED_API_KEY is not configured');
  const data = await request(
    '/v1/render',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        script: String(opts.script || ''),
        audio_url: opts.audioUrl || null,
        avatar_url: opts.avatarUrl || null,
        broll_urls: Array.isArray(opts.brollUrls) ? opts.brollUrls : [],
        width: 1920,
        height: 1080,
      }),
    },
    120000
  );
  const id = data && (data.id || data.render_id || (data.data && data.data.id));
  if (!id) throw new Error(`VEED returned no render id: ${JSON.stringify(data).slice(0, 400)}`);
  return String(id);
}

async function getRenderStatus(renderId) {
  const key = apiKey();
  if (!key) throw new Error('VEED_API_KEY is not configured');
  const data = await request(`/v1/render/${encodeURIComponent(renderId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  return {
    status: String((data && (data.status || data.data?.status)) || '').toLowerCase(),
    url: (data && (data.url || data.video_url || data.data?.url)) || '',
  };
}

module.exports = { submitRender, getRenderStatus, apiKey };
