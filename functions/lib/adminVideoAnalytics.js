/**
 * Admin video / engagement analytics snapshots (Firestore).
 * Uses existing collections; gracefully skips missing optional sources.
 */
'use strict';

const { FieldValue, Timestamp } = require('firebase-admin/firestore');

const SNAPSHOT_COLLECTION = 'admin_analytics';
const REGISTRY = process.env.VIDEO_REGISTRY_COLLECTION || 'video_registry';

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayKey(d = new Date()) {
  return startOfUtcDay(d).toISOString().slice(0, 10);
}

async function countWhere(db, collection, field, value) {
  try {
    const snap = await db.collection(collection).where(field, '==', value).limit(500).get();
    return snap.size;
  } catch {
    return 0;
  }
}

async function safeCount(db, collection) {
  try {
    const snap = await db.collection(collection).limit(500).get();
    return snap.size;
  } catch {
    return 0;
  }
}

async function topVideosByViews(db, limit = 10) {
  try {
    const snap = await db.collection(REGISTRY).orderBy('viewCount', 'desc').limit(limit).get();
    if (!snap.empty) {
      return snap.docs.map((doc) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          title: String(data.title || data.title_EN || doc.id),
          viewCount: Number(data.viewCount || 0),
          status: String(data.status || ''),
        };
      });
    }
  } catch {
    /* viewCount index may be missing — fall through */
  }

  try {
    const snap = await db.collection(REGISTRY).where('status', '==', 'Current').limit(50).get();
    return snap.docs
      .map((doc) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          title: String(data.title || data.title_EN || doc.id),
          viewCount: Number(data.viewCount || 0),
          status: String(data.status || 'Current'),
        };
      })
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, limit);
  } catch {
    return [];
  }
}

async function countWatchEventsSince(db, since) {
  try {
    const snap = await db
      .collection('watch_events')
      .where('timestamp', '>=', Timestamp.fromDate(since))
      .limit(500)
      .get();
    return snap.size;
  } catch {
    return 0;
  }
}

async function countActiveUsersSince(db, since) {
  try {
    const snap = await db
      .collection('user_profiles')
      .where('lastActive', '>=', Timestamp.fromDate(since))
      .limit(500)
      .get();
    return snap.size;
  } catch {
    return 0;
  }
}

/**
 * Build + persist a daily snapshot document (id = YYYY-MM-DD).
 */
async function computeAndStoreAnalytics(db) {
  const today = startOfUtcDay();
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const key = dayKey();

  const [
    currentVideos,
    archivedVideos,
    metadataDocs,
    enrichmentReady,
    enrichmentProcessing,
    enrichmentFailed,
    activeUsers7d,
    watchCountToday,
    topVideos,
  ] = await Promise.all([
    countWhere(db, REGISTRY, 'status', 'Current'),
    countWhere(db, REGISTRY, 'status', 'Archived'),
    safeCount(db, 'video_metadata'),
    countWhere(db, REGISTRY, 'enrichment_status', 'ready'),
    countWhere(db, REGISTRY, 'enrichment_status', 'processing'),
    countWhere(db, REGISTRY, 'enrichment_status', 'failed'),
    countActiveUsersSince(db, sevenDaysAgo),
    countWatchEventsSince(db, today),
    topVideosByViews(db, 10),
  ]);

  const snapshot = {
    date: key,
    dateAt: Timestamp.fromDate(today),
    activeUsers: activeUsers7d,
    activeUsersWindowDays: 7,
    watchCount: watchCountToday,
    videosCurrent: currentVideos,
    videosArchived: archivedVideos,
    videoMetadataCount: metadataDocs,
    enrichment: {
      ready: enrichmentReady,
      processing: enrichmentProcessing,
      failed: enrichmentFailed,
    },
    topVideos,
    sources: {
      user_profiles: activeUsers7d > 0 || undefined,
      watch_events: watchCountToday > 0 || undefined,
      video_registry: true,
    },
    computedAt: FieldValue.serverTimestamp(),
  };

  await db.collection(SNAPSHOT_COLLECTION).doc(key).set(snapshot, { merge: true });
  return { id: key, ...snapshot, computedAt: new Date().toISOString() };
}

async function listAnalyticsSnapshots(db, { limit = 30 } = {}) {
  const snap = await db
    .collection(SNAPSHOT_COLLECTION)
    .orderBy('date', 'desc')
    .limit(Math.min(Math.max(Number(limit) || 30, 1), 90))
    .get();
  return snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      date: data.date || doc.id,
      activeUsers: Number(data.activeUsers || 0),
      watchCount: Number(data.watchCount || 0),
      videosCurrent: Number(data.videosCurrent || 0),
      videosArchived: Number(data.videosArchived || 0),
      videoMetadataCount: Number(data.videoMetadataCount || 0),
      enrichment: data.enrichment || {},
      topVideos: Array.isArray(data.topVideos) ? data.topVideos : [],
      computedAt: data.computedAt || null,
    };
  });
}

module.exports = {
  SNAPSHOT_COLLECTION,
  computeAndStoreAnalytics,
  listAnalyticsSnapshots,
  dayKey,
};
