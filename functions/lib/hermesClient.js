/**
 * Hermes Agent HTTP client (OpenAI-compatible API).
 *
 * Production Cloud Functions cannot spawn the local `hermes` CLI.
 * They call HERMES_API_URL (Bearer HERMES_API_SERVER_KEY / API_SERVER_KEY).
 * Never log secret values.
 *
 * Performance:
 * - Default 30s timeout (HERMES_CHAT_TIMEOUT_MS)
 * - Instance concurrency gate (HERMES_MAX_INFLIGHT)
 * - Streaming SSE aggregation (faster first-token metric; full text still returned)
 * - In-flight coalesce for identical prompt hashes (mini-batching)
 */
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const crypto = require('crypto');

const SETTINGS_PATH = ['admin_settings', 'hermes'];
const LANG_LABEL = { en: 'English', fr: 'French', es: 'Spanish' };

let inflight = 0;
const coalesceMap = new Map();

function hermesApiUrl() {
  return String(process.env.HERMES_API_URL || '')
    .trim()
    .replace(/\/$/, '');
}

function hermesApiKey() {
  return String(process.env.HERMES_API_SERVER_KEY || process.env.API_SERVER_KEY || '').trim();
}

function envChatEnabled() {
  const raw = String(process.env.HERMES_CHAT_ENABLED || 'true').toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

function chatTimeoutMs() {
  const n = Number(process.env.HERMES_CHAT_TIMEOUT_MS || 30000);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 90000) : 30000;
}

function maxInflight() {
  const n = Number(process.env.HERMES_MAX_INFLIGHT || 6);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 32) : 6;
}

function useStreaming() {
  const raw = String(process.env.HERMES_STREAM || 'true').toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

function authHeaders() {
  const key = hermesApiKey();
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

async function readSettings(db) {
  const store = db || getFirestore();
  const snap = await store.doc(SETTINGS_PATH.join('/')).get();
  return snap.exists ? snap.data() || {} : {};
}

async function isChatEnabled(db) {
  if (!envChatEnabled()) return false;
  const data = await readSettings(db);
  if (data.chatEnabled === false) return false;
  return true;
}

async function setChatEnabled(db, enabled) {
  const store = db || getFirestore();
  await store.doc(SETTINGS_PATH.join('/')).set(
    {
      chatEnabled: Boolean(enabled),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function recordMetric(db, patch) {
  const store = db || getFirestore();
  await store.doc(SETTINGS_PATH.join('/')).set(
    {
      ...patch,
      lastAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function pingHermes(timeoutMs = 5000) {
  const base = hermesApiUrl();
  if (!base) {
    return { configured: false, active: false, latencyMs: null, error: 'not_configured' };
  }
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/v1/models`, {
      method: 'GET',
      headers: authHeaders(),
      signal: ctrl.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        configured: true,
        active: false,
        latencyMs,
        error: `http_${res.status}`,
      };
    }
    return { configured: true, active: true, latencyMs, error: null };
  } catch (err) {
    return {
      configured: true,
      active: false,
      latencyMs: Date.now() - started,
      error: err && err.name === 'AbortError' ? 'timeout' : 'unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

function languageInstruction(lang) {
  const code = LANG_LABEL[String(lang || 'en').slice(0, 2)] ? String(lang).slice(0, 2) : 'en';
  const name = LANG_LABEL[code];
  return `Reply only in ${name}. Do not name models, vendors, or internal tools. Do not ask for passwords, full card numbers, or secret keys.`;
}

function requestHash({ prompt, context, lang, projectId }) {
  return crypto
    .createHash('sha256')
    .update(
      `${projectId || 'resumora'}|${lang || 'en'}|${String(context || '').slice(0, 500)}|${String(prompt || '')}`
    )
    .digest('hex');
}

async function parseSseCompletion(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let ttftMs = null;
  let toolEvents = 0;
  const started = Date.now();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n');
    buffer = chunks.pop() || '';
    for (const line of chunks) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      if (json?.event === 'hermes.tool.progress' || json?.type === 'hermes.tool.progress') {
        toolEvents += 1;
        continue;
      }
      const delta =
        json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || '';
      if (delta) {
        if (ttftMs == null) ttftMs = Date.now() - started;
        text += delta;
      }
    }
  }
  return { text: text.trim(), ttftMs, toolEvents };
}

async function callHermesOnce({ prompt, context, lang, timeoutMs, db, projectId }) {
  const base = hermesApiUrl();
  if (!base) {
    const err = new Error('Hermes API URL is not configured');
    err.code = 'not_configured';
    throw err;
  }

  if (inflight >= maxInflight()) {
    const err = new Error('Hermes rate limited (too many concurrent requests)');
    err.code = 'rate_limited';
    throw err;
  }

  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || chatTimeoutMs());
  const projectLabel = String(projectId || 'resumora').slice(0, 40);
  const system = [
    'You are the BossMind harness assistant for resumora.net operations.',
    `Active project context: ${projectLabel}. Stay within that project's scope; do not mix other BossMind projects unless asked.`,
    languageInstruction(lang),
    context ? `Context:\n${String(context).slice(0, 4000)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const stream = useStreaming();
  inflight += 1;
  try {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: authHeaders(),
      signal: ctrl.signal,
      body: JSON.stringify({
        model: process.env.HERMES_MODEL_NAME || 'hermes-agent',
        stream,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: String(prompt || '').slice(0, 4000) },
        ],
      }),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      await recordMetric(db, {
        lastLatencyMs: latencyMs,
        lastOk: false,
        lastErrorCode: `http_${res.status}`,
        errorCount: FieldValue.increment(1),
      }).catch(() => {});
      const err = new Error(`Hermes HTTP ${res.status}`);
      err.code = `http_${res.status}`;
      throw err;
    }

    let text = '';
    let ttftMs = latencyMs;
    let toolEvents = 0;
    const cacheHeader = String(
      res.headers.get('x-cache') || res.headers.get('cf-cache-status') || ''
    )
      .toLowerCase()
      .trim();
    const cacheHit = cacheHeader === 'hit' || cacheHeader === 'HIT'.toLowerCase();

    if (stream && res.body && typeof res.body.getReader === 'function') {
      const parsed = await parseSseCompletion(res);
      text = parsed.text;
      ttftMs = parsed.ttftMs != null ? parsed.ttftMs : latencyMs;
      toolEvents = parsed.toolEvents || 0;
    } else {
      const body = await res.json();
      text = String(body?.choices?.[0]?.message?.content || '').trim();
    }

    const finalLatency = Date.now() - started;
    await recordMetric(db, {
      lastLatencyMs: finalLatency,
      lastTtftMs: ttftMs,
      lastOk: true,
      lastErrorCode: null,
      lastToolEvents: toolEvents,
      okCount: FieldValue.increment(1),
      cacheHitCount: FieldValue.increment(cacheHit ? 1 : 0),
      cacheMissCount: FieldValue.increment(cacheHit ? 0 : 1),
      toolEventCount: FieldValue.increment(toolEvents),
    }).catch(() => {});

    if (!text) {
      const err = new Error('Hermes returned an empty reply');
      err.code = 'empty';
      throw err;
    }
    return { text, latencyMs: finalLatency, ttftMs, toolEvents, cacheHit };
  } catch (err) {
    if (err && err.code && String(err.code).startsWith('http_')) throw err;
    const latencyMs = Date.now() - started;
    const code = err && err.name === 'AbortError' ? 'timeout' : err.code || 'unreachable';
    await recordMetric(db, {
      lastLatencyMs: latencyMs,
      lastOk: false,
      lastErrorCode: code,
      errorCount: FieldValue.increment(1),
    }).catch(() => {});
    err.code = code;
    throw err;
  } finally {
    inflight = Math.max(0, inflight - 1);
    clearTimeout(timer);
  }
}

/**
 * @param {{ prompt: string, context?: string, lang?: string, timeoutMs?: number, db?: FirebaseFirestore.Firestore }} opts
 */
async function callHermes(opts) {
  const key = requestHash(opts);
  if (coalesceMap.has(key)) {
    return coalesceMap.get(key);
  }
  const pending = callHermesOnce(opts).finally(() => {
    coalesceMap.delete(key);
  });
  coalesceMap.set(key, pending);
  return pending;
}

async function getHermesAdminStatus(db) {
  const settings = await readSettings(db);
  const ping = await pingHermes();
  const chatEnabled = envChatEnabled() && settings.chatEnabled !== false;
  const ok = Number(settings.okCount || 0);
  const err = Number(settings.errorCount || 0);
  const total = ok + err;
  const cacheHits = Number(settings.cacheHitCount || 0);
  const cacheMiss = Number(settings.cacheMissCount || 0);
  const cacheTotal = cacheHits + cacheMiss;
  return {
    configured: ping.configured,
    active: ping.active,
    chatEnabled,
    latencyMs: ping.latencyMs != null ? ping.latencyMs : settings.lastLatencyMs || null,
    ttftMs: settings.lastTtftMs != null ? settings.lastTtftMs : null,
    lastErrorCode: ping.error || settings.lastErrorCode || null,
    errorRate: total ? Math.round((err / total) * 1000) / 10 : 0,
    okCount: ok,
    errorCount: err,
    cacheHitRate: cacheTotal ? Math.round((cacheHits / cacheTotal) * 1000) / 10 : null,
    toolEventCount: Number(settings.toolEventCount || 0),
    lastToolEvents: Number(settings.lastToolEvents || 0),
    inflight,
    maxInflight: maxInflight(),
    timeoutMs: chatTimeoutMs(),
  };
}

module.exports = {
  hermesApiUrl,
  hermesApiKeyConfigured: () => Boolean(hermesApiKey()),
  isChatEnabled,
  setChatEnabled,
  pingHermes,
  callHermes,
  getHermesAdminStatus,
  languageInstruction,
  chatTimeoutMs,
};
