/**
 * Phase 3 — daily personalized recommendations from watch_history embeddings.
 */
'use strict';

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { cosineSimilarity, averageEmbeddings } = require('../lib/recommendationMath');

const region = 'us-central1';
const COLLECTION = process.env.VIDEO_REGISTRY_COLLECTION || 'video_registry';
const WATCH_THRESHOLD = 0.7;
const TOP_N = 10;

async function loadCurrentVideosWithEmbeddings(db) {
  const snap = await db.collection(COLLECTION).where('status', '==', 'Current').limit(300).get();
  const map = new Map();
  snap.docs.forEach((doc) => {
    const data = doc.data() || {};
    if (!Array.isArray(data.embedding) || !data.embedding.length) return;
    map.set(doc.id, {
      id: doc.id,
      embedding: data.embedding,
      video_id: data.video_id || doc.id,
    });
  });
  return map;
}

function watchedIds(history) {
  const out = new Set();
  for (const w of history || []) {
    const pct = Number(w.watchPercentage ?? w.watch_percentage ?? 0);
    const id = String(w.videoId || w.video_id || '').trim();
    if (id && pct >= WATCH_THRESHOLD) out.add(id);
  }
  return out;
}

async function recommendForUser(db, userDoc, videoMap) {
  const data = userDoc.data() || {};
  const history = Array.isArray(data.watch_history) ? data.watch_history : [];
  const watched = watchedIds(history);
  if (!watched.size) {
    return { uid: userDoc.id, skipped: 'no_qualified_watches' };
  }

  const vectors = [];
  for (const vid of watched) {
    const v = videoMap.get(vid);
    if (v?.embedding) vectors.push(v.embedding);
  }
  const pref = averageEmbeddings(vectors);
  if (!pref) return { uid: userDoc.id, skipped: 'no_embeddings_for_watches' };

  const scored = [];
  for (const [vid, video] of videoMap.entries()) {
    if (watched.has(vid)) continue;
    scored.push({ videoId: vid, score: cosineSimilarity(pref, video.embedding) });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, TOP_N);
  const recommendations = top.map((r) => r.videoId);

  await userDoc.ref.set(
    {
      recommendations,
      recommendation_scores: top.map((r) => ({
        videoId: r.videoId,
        score: Math.round(r.score * 10000) / 10000,
      })),
      recommendations_updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { uid: userDoc.id, count: recommendations.length };
}

async function runComputeRecommendations({ maxUsers = 200 } = {}) {
  const db = getFirestore();
  const videoMap = await loadCurrentVideosWithEmbeddings(db);
  if (!videoMap.size) {
    return { ok: true, users: 0, updated: 0, note: 'no_video_embeddings' };
  }

  const since = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  let usersSnap;
  try {
    usersSnap = await db
      .collection('user_profiles')
      .where('lastActive', '>=', since)
      .limit(maxUsers)
      .get();
  } catch {
    usersSnap = await db.collection('user_profiles').limit(maxUsers).get();
  }

  let updated = 0;
  let skipped = 0;
  for (const userDoc of usersSnap.docs) {
    const result = await recommendForUser(db, userDoc, videoMap);
    if (result.count) updated += 1;
    else skipped += 1;
  }

  return {
    ok: true,
    videoEmbeddings: videoMap.size,
    users: usersSnap.size,
    updated,
    skipped,
  };
}

/** Single-user refresh (optional real-time path). */
async function runComputeRecommendationsForUid(uid) {
  const db = getFirestore();
  const userRef = db.collection('user_profiles').doc(String(uid));
  const userDoc = await userRef.get();
  if (!userDoc.exists) {
    return { ok: false, error: 'user_not_found' };
  }
  const videoMap = await loadCurrentVideosWithEmbeddings(db);
  return recommendForUser(db, userDoc, videoMap);
}

function registerComputeRecommendations(exportsObj) {
  const common = {
    region,
    timeoutSeconds: 540,
    memory: '512MiB',
  };

  exportsObj.computeRecommendations = onSchedule(
    {
      ...common,
      schedule: '30 2 * * *',
      timeZone: 'UTC',
    },
    async () => {
      const out = await runComputeRecommendations({});
      console.log('computeRecommendations', JSON.stringify(out));
    }
  );

  exportsObj.computeRecommendationsHttp = onRequest(
    { ...common, cors: false, invoker: 'private' },
    async (req, res) => {
      if (req.method !== 'POST' && req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      try {
        const uid = String(req.query.uid || '').trim();
        const out = uid
          ? await runComputeRecommendationsForUid(uid)
          : await runComputeRecommendations({
              maxUsers: parseInt(String(req.query.limit || '200'), 10),
            });
        res.status(200).json(out);
      } catch (err) {
        res.status(500).json({ error: err.message || 'Recommendations failed' });
      }
    }
  );
}

module.exports = {
  registerComputeRecommendations,
  runComputeRecommendations,
  runComputeRecommendationsForUid,
};
