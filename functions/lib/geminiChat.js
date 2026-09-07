/**
 * Gemini / Vertex AI chat — Google-only.
 * Prefer Vertex AI (us-central1) via ADC when VERTEX_AI / GOOGLE_GENAI_USE_VERTEXAI is true.
 * Fallback: Gemini Developer API with GEMINI_API_KEY from Secret Manager.
 * No new npm packages — uses google-auth-library (firebase-admin transitive) + fetch.
 * Never logs API key values. Do not mention model names in user-facing text.
 */
'use strict';

const { resolveSecret } = require('./gcpSecrets');

const LANG_LABEL = { en: 'English', fr: 'French', es: 'Spanish' };

function useVertexAi() {
  const v = String(
    process.env.VERTEX_AI || process.env.GOOGLE_GENAI_USE_VERTEXAI || ''
  ).toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function geminiApiKey() {
  return resolveSecret('GEMINI_API_KEY', ['GOOGLE_AI_API_KEY', 'GOOGLE_API_KEY']);
}

function projectId() {
  return String(
    process.env.GCLOUD_PROJECT ||
      process.env.GCP_PROJECT ||
      process.env.GCP_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      ''
  ).trim();
}

function vertexLocation() {
  return String(process.env.VERTEX_LOCATION || 'us-central1').trim() || 'us-central1';
}

function modelName() {
  return (
    process.env.GEMINI_CHAT_MODEL ||
    process.env.GEMINI_MODEL ||
    process.env.VERTEX_GEMINI_MODEL ||
    'gemini-2.0-flash'
  );
}

async function getAccessToken() {
  // eslint-disable-next-line import/no-extraneous-dependencies
  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token =
    typeof tokenResponse === 'string' ? tokenResponse : tokenResponse && tokenResponse.token;
  if (!token)
    throw Object.assign(new Error('ADC access token unavailable'), { code: 'vertex_no_token' });
  return token;
}

function buildPrompt({ prompt, lang, context }) {
  const code = LANG_LABEL[String(lang || 'en').slice(0, 2)] ? String(lang).slice(0, 2) : 'en';
  return [
    'You are the Resumora support assistant for resumora.net (plans $29 / $49 / $79 / $110).',
    `Reply only in ${LANG_LABEL[code]}. Do not name models or vendors.`,
    'Do not ask for passwords, full card numbers, or secret keys.',
    context ? `Context:\n${String(context).slice(0, 3000)}` : '',
    `User:\n${String(prompt || '').slice(0, 4000)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function callVertexGenerateContent({ textPrompt, timeoutMs }) {
  const project = projectId();
  if (!project) {
    throw Object.assign(new Error('GCP project id missing for Vertex AI'), {
      code: 'vertex_no_project',
    });
  }
  const location = vertexLocation();
  const model = modelName();
  const token = await getAccessToken();
  const url =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}` +
    `/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 20000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: textPrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
    });
    if (!res.ok) {
      throw Object.assign(new Error(`Vertex HTTP ${res.status}`), {
        code: `vertex_http_${res.status}`,
      });
    }
    const json = await res.json();
    const text = String(json?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    if (!text) {
      throw Object.assign(new Error('Vertex returned an empty reply'), { code: 'vertex_empty' });
    }
    return { text, provider: 'vertex-ai' };
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiDeveloperApi({ textPrompt, timeoutMs }) {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    throw Object.assign(new Error('Gemini API key is not configured'), {
      code: 'gemini_not_configured',
    });
  }
  const model = modelName();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 20000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: textPrompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        }),
      }
    );
    if (!res.ok) {
      throw Object.assign(new Error(`Gemini HTTP ${res.status}`), {
        code: `gemini_http_${res.status}`,
      });
    }
    const json = await res.json();
    const text = String(json?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    if (!text) {
      throw Object.assign(new Error('Gemini returned an empty reply'), { code: 'gemini_empty' });
    }
    return { text, provider: 'gemini-api' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{ prompt: string, lang?: string, context?: string, timeoutMs?: number }} opts
 */
async function callGeminiChat(opts) {
  const textPrompt = buildPrompt(opts || {});
  try {
    if (useVertexAi()) {
      return await callVertexGenerateContent({
        textPrompt,
        timeoutMs: opts && opts.timeoutMs,
      });
    }
  } catch (err) {
    if (err && err.name === 'AbortError') {
      err.code = 'gemini_timeout';
      throw err;
    }
    // Fall through to API key path when Vertex fails and key exists
    if (!geminiApiKey()) throw err;
  }

  try {
    return await callGeminiDeveloperApi({
      textPrompt,
      timeoutMs: opts && opts.timeoutMs,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      err.code = 'gemini_timeout';
    }
    throw err;
  }
}

module.exports = {
  geminiApiKeyConfigured: () => Boolean(geminiApiKey()) || useVertexAi(),
  useVertexAi,
  callGeminiChat,
};
