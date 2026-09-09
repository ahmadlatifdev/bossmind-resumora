/**
 * Phase 3 — authenticated recommendations API for signed-in clients.
 */
'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { runComputeRecommendationsForUid } = require('./computeRecommendations');

const region = 'us-central1';
const COLLECTION = process.env.VIDEO_REGISTRY_COLLECTION || 'video_registry';

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

async function verifyBearer(req) {
  const header = String(req.get('authorization') || req.get('Authorization') || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  }
  return getAuth().verifyIdToken(match[1]);
}

function publicVideoFields(id, data) {
  return {
    id,
    video_id: data.video_id || id,
    title: data.title || data.title_EN || id,
    summary: data.summary || data.enrichment_summary || data.description || '',
    tags: Array.isArray(data.tags)
      ? data.tags
      : Array.isArray(data.enrichment_tags)
        ? data.enrichment_tags
        : [],
    thumbnail_url: data.thumbnail_url || data.thumbnail || null,
    active_url: data.active_url || '',
    status: data.status || '',
  };
}

async function getRecommendationsHandler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const decoded = await verifyBearer(req);
    const db = getFirestore();
    const userRef = db.collection('user_profiles').doc(decoded.uid);
    let userSnap = await userRef.get();
    let recs = Array.isArray(userSnap.data()?.recommendations)
      ? userSnap.data().recommendations
      : [];

    // Optional on-demand refresh for the caller only.
    if (String(req.query.refresh || '') === '1' || !recs.length) {
      try {
        await runComputeRecommendationsForUid(decoded.uid);
        userSnap = await userRef.get();
        recs = Array.isArray(userSnap.data()?.recommendations)
          ? userSnap.data().recommendations
          : [];
      } catch (err) {
        console.warn('getRecommendations refresh skip:', err.message || err);
      }
    }

    const videos = [];
    for (const vid of recs.slice(0, 20)) {
      const doc = await db.collection(COLLECTION).doc(String(vid)).get();
      if (doc.exists) videos.push(publicVideoFields(doc.id, doc.data() || {}));
    }

    res.status(200).json({
      ok: true,
      uid: decoded.uid,
      count: videos.length,
      videos,
      emptyReason: videos.length ? null : 'Watch more videos (70%+) to unlock personalized picks.',
    });
  } catch (err) {
    const code = err.statusCode || (String(err.code || '').includes('auth/') ? 401 : 500);
    res.status(code).json({ error: err.message || 'Recommendations failed' });
  }
}

function registerGetRecommendations(exportsObj) {
  exportsObj.getRecommendations = onRequest(
    {
      region,
      cors: false,
      timeoutSeconds: 60,
      memory: '256MiB',
    },
    getRecommendationsHandler
  );
}

module.exports = {
  registerGetRecommendations,
  getRecommendationsHandler,
};
