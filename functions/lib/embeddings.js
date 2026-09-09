/**
 * Text embeddings via Vertex AI (ADC) or Gemini Developer API key.
 * No new npm packages — google-auth-library + fetch.
 */
'use strict';

const { resolveSecret } = require('./gcpSecrets');

function projectId() {
  return String(
    process.env.GCLOUD_PROJECT ||
      process.env.GCP_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      'resumora-live'
  ).trim();
}

function vertexLocation() {
  return String(process.env.VERTEX_LOCATION || 'us-central1').trim() || 'us-central1';
}

function embeddingModel() {
  return (
    process.env.VERTEX_EMBEDDING_MODEL || process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004'
  );
}

function geminiApiKey() {
  return resolveSecret('GEMINI_API_KEY', ['GOOGLE_AI_API_KEY', 'GOOGLE_API_KEY']);
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
  if (!token) {
    throw Object.assign(new Error('ADC access token unavailable'), { code: 'vertex_no_token' });
  }
  return token;
}

/**
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embedTextVertex(text) {
  const project = projectId();
  const location = vertexLocation();
  const model = embeddingModel();
  const token = await getAccessToken();
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${encodeURIComponent(model)}:predict`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Goog-User-Project': project,
    },
    body: JSON.stringify({
      instances: [{ content: String(text || '').slice(0, 8000) }],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(
      new Error((json.error && json.error.message) || `Vertex embed HTTP ${res.status}`),
      {
        code: `vertex_embed_${res.status}`,
      }
    );
  }
  const values =
    json?.predictions?.[0]?.embeddings?.values || json?.predictions?.[0]?.values || null;
  if (!Array.isArray(values) || !values.length) {
    throw Object.assign(new Error('Vertex embed returned empty vector'), {
      code: 'vertex_embed_empty',
    });
  }
  return values.map((n) => Number(n));
}

/**
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embedTextGeminiApi(text) {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    throw Object.assign(new Error('Gemini API key not configured for embeddings'), {
      code: 'gemini_not_configured',
    });
  }
  const model = embeddingModel();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: String(text || '').slice(0, 8000) }] },
      }),
    }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(
      new Error((json.error && json.error.message) || `Gemini embed HTTP ${res.status}`),
      {
        code: `gemini_embed_${res.status}`,
      }
    );
  }
  const values = json?.embedding?.values;
  if (!Array.isArray(values) || !values.length) {
    throw Object.assign(new Error('Gemini embed returned empty vector'), {
      code: 'gemini_embed_empty',
    });
  }
  return values.map((n) => Number(n));
}

/**
 * @param {string} text
 * @returns {Promise<{ values: number[], provider: string, dims: number }>}
 */
async function embedText(text) {
  const input = String(text || '').trim();
  if (!input) {
    throw Object.assign(new Error('Empty text for embedding'), { code: 'embed_empty_input' });
  }
  try {
    const values = await embedTextVertex(input);
    return { values, provider: 'vertex-ai', dims: values.length };
  } catch (err) {
    if (!geminiApiKey()) throw err;
    const values = await embedTextGeminiApi(input);
    return { values, provider: 'gemini-api', dims: values.length };
  }
}

function buildVideoEmbedText(data = {}) {
  const tags = Array.isArray(data.tags)
    ? data.tags.join(' ')
    : Array.isArray(data.enrichment_tags)
      ? data.enrichment_tags.join(' ')
      : '';
  return [
    data.title || data.title_EN || '',
    data.summary || data.enrichment_summary || data.description || data.description_EN || '',
    tags,
    String(data.transcript || '').slice(0, 2000),
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
}

module.exports = {
  embedText,
  buildVideoEmbedText,
  embeddingModel,
  projectId,
};
