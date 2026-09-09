/**
 * Vertex AI Search (Discovery Engine) — video_registry search.
 * Uses REST + google-auth-library (no heavy client required at runtime for deploy size),
 * with optional @google-cloud/discoveryengine if present.
 *
 * Serving: Hosting rewrite /api/video/search → searchVideos (Firebase Hosting invoker).
 * Do not deploy with --allow-unauthenticated (org policy).
 */
'use strict';

const { onRequest } = require('firebase-functions/v2/https');

const region = 'us-central1';
const PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  'resumora-live';
const LOCATION = process.env.DISCOVERY_LOCATION || 'global';
const ENGINE_ID = process.env.DISCOVERY_ENGINE_ID || 'resumora-video-search-v2';
const DATA_STORE_ID = process.env.DISCOVERY_DATA_STORE_ID || 'resumora-video-search-v2';

function cors(res, req) {
  const origin = String((req.headers && req.headers.origin) || '');
  if (
    !origin ||
    /localhost|127\.0\.0\.1|resumora\.net|\.web\.app|\.firebaseapp\.com/i.test(origin)
  ) {
    res.set('Access-Control-Allow-Origin', origin || '*');
  }
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Cache-Control', 'no-store');
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
    throw Object.assign(new Error('ADC access token unavailable'), { statusCode: 503 });
  }
  return token;
}

function servingConfigPath() {
  return `projects/${PROJECT}/locations/${LOCATION}/collections/default_collection/engines/${ENGINE_ID}/servingConfigs/default_search`;
}

function mapHit(result) {
  const doc = result.document || {};
  const struct = doc.structData || {};
  const derived = doc.derivedStructData || {};
  const data = { ...derived, ...struct };
  const tagsRaw = data.tags;
  let tags = [];
  if (Array.isArray(tagsRaw)) tags = tagsRaw.map((t) => String(t));
  else if (tagsRaw && Array.isArray(tagsRaw.values)) {
    tags = tagsRaw.values.map((v) => String(v.stringValue || v || '')).filter(Boolean);
  }
  return {
    id: String(data.video_id || doc.id || ''),
    title: String(data.title || data.title_EN || ''),
    summary: String(data.summary || data.enrichment_summary || data.description || ''),
    tags,
    active_url: String(data.active_url || ''),
    status: String(data.status || ''),
    score: typeof result.relevanceScore === 'number' ? result.relevanceScore : undefined,
  };
}

async function searchViaRest({ query, pageSize }) {
  const token = await getAccessToken();
  const url = `https://discoveryengine.googleapis.com/v1/${servingConfigPath()}:search`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Goog-User-Project': PROJECT,
    },
    body: JSON.stringify({
      query,
      pageSize,
      queryExpansionSpec: { condition: 'AUTO' },
      spellCorrectionSpec: { mode: 'AUTO' },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json.error && json.error.message) || `Discovery search HTTP ${res.status}`;
    const err = new Error(msg);
    err.statusCode = res.status >= 400 && res.status < 500 ? res.status : 502;
    throw err;
  }
  return {
    results: (json.results || []).map(mapHit),
    total: Number(json.totalSize || 0),
    attributionToken: json.attributionToken || null,
    engine: ENGINE_ID,
    dataStore: DATA_STORE_ID,
  };
}

async function searchVideosHandler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const query = String(req.query.q || req.query.query || '').trim();
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '10'), 10) || 10, 1), 50);

  if (!query) {
    res.status(400).json({ error: 'Missing query parameter "q"' });
    return;
  }

  try {
    const out = await searchViaRest({ query, pageSize: limit });
    res.status(200).json({ ok: true, ...out });
  } catch (err) {
    console.error('searchVideos error:', err.message || err);
    const code = err.statusCode || 500;
    res.status(code).json({
      error: code >= 500 ? 'Search failed' : String(err.message || 'Search failed'),
    });
  }
}

function registerSearchVideos(exportsObj) {
  exportsObj.searchVideos = onRequest(
    {
      region,
      cors: false,
      timeoutSeconds: 60,
      memory: '256MiB',
    },
    searchVideosHandler
  );
}

module.exports = {
  registerSearchVideos,
  searchVideosHandler,
  servingConfigPath,
};
