/**
 * Phase 3 — watch_events → user_profiles.watch_history.
 */
'use strict';

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const region = 'us-central1';
const MAX_HISTORY = 100;

function cors(res, req) {
  const origin = String((req.headers && req.headers.origin) || '');
  if (
    !origin ||
    /localhost|127\.0\.0\.1|resumora\.net|\.web\.app|\.firebaseapp\.com/i.test(origin)
  ) {
    res.set('Access-Control-Allow-Origin', origin || '*');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
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

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(String(req.body));
  } catch {
    return {};
  }
}

async function appendWatchHistory(db, { uid, videoId, watchPercentage }) {
  const userRef = db.collection('user_profiles').doc(uid);
  const entry = {
    videoId: String(videoId),
    timestamp: Timestamp.now(),
    watchPercentage: Math.max(0, Math.min(1, Number(watchPercentage) || 0)),
  };

  await userRef.set(
    {
      watch_history: FieldValue.arrayUnion(entry),
      lastActive: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Trim oversized history (arrayUnion cannot trim atomically).
  const snap = await userRef.get();
  const history = Array.isArray(snap.data()?.watch_history) ? snap.data().watch_history : [];
  if (history.length > MAX_HISTORY) {
    const trimmed = history
      .slice()
      .sort((a, b) => {
        const ta = a.timestamp?.toMillis?.() || Number(a.timestamp) || 0;
        const tb = b.timestamp?.toMillis?.() || Number(b.timestamp) || 0;
        return ta - tb;
      })
      .slice(-MAX_HISTORY);
    await userRef.set({ watch_history: trimmed }, { merge: true });
  }

  return entry;
}

async function onVideoWatchHandler(event) {
  const data = event.data?.data() || {};
  const uid = String(data.uid || data.userId || '').trim();
  const videoId = String(data.videoId || data.video_id || '').trim();
  if (!uid || !videoId) {
    console.warn('onVideoWatch skip: missing uid/videoId');
    return null;
  }
  const db = getFirestore();
  const entry = await appendWatchHistory(db, {
    uid,
    videoId,
    watchPercentage: data.watchPercentage ?? data.watch_percentage ?? 0,
  });
  console.log(`onVideoWatch uid=${uid} videoId=${videoId} pct=${entry.watchPercentage}`);
  return { ok: true };
}

function registerOnVideoWatch(exportsObj) {
  exportsObj.onVideoWatch = onDocumentCreated(
    {
      document: 'watch_events/{eventId}',
      region,
      timeoutSeconds: 60,
      memory: '256MiB',
    },
    onVideoWatchHandler
  );

  /** Authenticated client helper — writes watch_events (triggers onVideoWatch). */
  exportsObj.postVideoWatch = onRequest(
    {
      region,
      cors: false,
      timeoutSeconds: 30,
      memory: '256MiB',
    },
    async (req, res) => {
      cors(res, req);
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      try {
        const decoded = await verifyBearer(req);
        const body = parseBody(req);
        const videoId = String(body.videoId || body.video_id || '').trim();
        const watchPercentage = Number(body.watchPercentage ?? body.watch_percentage ?? 0.8);
        if (!videoId) {
          res.status(400).json({ error: 'Missing videoId' });
          return;
        }
        const db = getFirestore();
        const ref = await db.collection('watch_events').add({
          uid: decoded.uid,
          videoId,
          watchPercentage: Math.max(0, Math.min(1, watchPercentage)),
          timestamp: FieldValue.serverTimestamp(),
          source: 'client',
        });
        res.status(200).json({ ok: true, eventId: ref.id });
      } catch (err) {
        const code = err.statusCode || (err.code === 'auth/id-token-expired' ? 401 : 500);
        res.status(code).json({ error: err.message || 'Watch record failed' });
      }
    }
  );
}

module.exports = {
  registerOnVideoWatch,
  appendWatchHistory,
  onVideoWatchHandler,
};
