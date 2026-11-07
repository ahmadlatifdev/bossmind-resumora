/**
 * Resumora video catalog + download tracking (Firestore-backed).
 * HeyGen removed — production masters publish via Bilibili / GCS pipeline.
 */

const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const bilibiliPublish = require('./bilibiliPublish');
const { PLAYABLE_DEMOS, INTERVIEW_SERIES_CATALOG, SERIES_ID } = require('./interviewSeriesCatalog');

/** Premium Interview Series catalog (4 × EN/FR/ES) — SSoT for fallback + Firestore seed. */
const FALLBACK_CATALOG = INTERVIEW_SERIES_CATALOG;

function bilibiliConfigured() {
  return bilibiliPublish.cookiesConfigured(bilibiliPublish.readCookieBundle());
}

/** Convert gs://bucket/path → https://storage.googleapis.com/bucket/path */
function toHttpsUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const m = s.match(/^gs:\/\/([^/]+)\/(.+)$/i);
  if (m) return `https://storage.googleapis.com/${m[1]}/${m[2]}`;
  return s;
}

function isPlayableHttp(url) {
  return /^https?:\/\//i.test(String(url || '').trim());
}

function isR2Url(url) {
  return /^r2:\/\//i.test(String(url || '').trim());
}

function demoForIndex(index) {
  return PLAYABLE_DEMOS[Math.abs(Number(index) || 0) % PLAYABLE_DEMOS.length];
}

/** True when URL is a dead Google sample host (403) or otherwise unusable for <video>. */
function isDeadGtvOrMissing(url) {
  const s = String(url || '').trim();
  if (!s) return true;
  return /gtv-videos-bucket|storage\.googleapis\.com\/gtv-videos-bucket|googlevideo\.com/i.test(s);
}

/** Build { en, fr, es } play URLs; missing FR/ES fall back to EN. */
function multilingualUrls(video = {}, index = 0) {
  const nested = video.urls && typeof video.urls === 'object' ? video.urls : null;
  let en = toHttpsUrl(
    (nested && nested.en) ||
      video.url_mp4_en ||
      video.url_en ||
      video.url_mp4 ||
      video.url ||
      video.src ||
      ''
  );
  let fr = toHttpsUrl((nested && nested.fr) || video.url_mp4_fr || video.url_fr || en) || en;
  let es = toHttpsUrl((nested && nested.es) || video.url_mp4_es || video.url_es || en) || en;

  // Dead Google sample hosts / non-resolvable URLs → replace with known-good demos.
  // r2:// references are kept as-is (the frontend resolves them via secureAssetUrl).
  if (isDeadGtvOrMissing(en) || (!isPlayableHttp(en) && !isR2Url(en))) en = demoForIndex(index);
  if (isDeadGtvOrMissing(fr) || (!isPlayableHttp(fr) && !isR2Url(fr))) fr = en;
  if (isDeadGtvOrMissing(es) || (!isPlayableHttp(es) && !isR2Url(es))) es = en;

  return { en, fr, es };
}

function normalizeVideo(video = {}, index = 0) {
  const urls = multilingualUrls(video, index);
  return {
    ...video,
    urls,
    // Always prefer rewritten playable URLs (never keep stale gtv fields).
    url_mp4_en: urls.en,
    url_mp4_fr: urls.fr,
    url_mp4_es: urls.es,
  };
}

/** Upsert Premium Interview Series docs into Firestore `videos` (idempotent). */
async function seedFirestoreInterviewSeries() {
  const db = getFirestore();
  const batch = db.batch();
  let upserted = 0;
  for (const item of INTERVIEW_SERIES_CATALOG) {
    const ref = db.collection('videos').doc(item.video_id);
    batch.set(
      ref,
      {
        ...item,
        urls: {
          en: item.url_mp4_en,
          fr: item.url_mp4_fr,
          es: item.url_mp4_es,
        },
        updated_at: new Date().toISOString(),
        seeded_from: SERIES_ID,
      },
      { merge: true }
    );
    upserted += 1;
  }
  await batch.commit();
  return { upserted, series_id: SERIES_ID };
}

/**
 * Persist MDN/W3Schools replacements for any Firestore `videos` docs still on gtv-videos-bucket.
 * Idempotent — skips docs that already use public demos.
 */
async function migrateFirestoreGtvVideoUrls() {
  const db = getFirestore();
  const snap = await db.collection('videos').get();
  if (snap.empty) return { scanned: 0, updated: 0 };
  let updated = 0;
  const batch = db.batch();
  let batchCount = 0;
  snap.docs.forEach((doc, i) => {
    const data = doc.data() || {};
    const demo = demoForIndex(i);
    const urls = multilingualUrls(data, i);
    const patch = {
      urls: { en: urls.en, fr: urls.fr, es: urls.es },
      url_mp4_en: urls.en,
      url_mp4_fr: urls.fr,
      url_mp4_es: urls.es,
      url: urls.en,
      playback_source: 'public-demo',
      gtv_migrated_at: new Date().toISOString(),
    };
    const fields = [
      data.url_mp4_en,
      data.url_mp4_fr,
      data.url_mp4_es,
      data.url_mp4,
      data.url,
      data.src,
      data.url_en,
      data.url_fr,
      data.url_es,
      data.urls && data.urls.en,
      data.urls && data.urls.fr,
      data.urls && data.urls.es,
    ];
    // Only rewrite docs that still store gtv-videos-bucket (ignore empty optional fields).
    const needs = fields.some((u) => {
      const s = String(u || '').trim();
      return s && /gtv-videos-bucket|googlevideo\.com/i.test(s);
    });
    if (!needs) return;
    // Ensure every lang has a concrete public demo (not empty).
    if (!patch.url_mp4_en) patch.url_mp4_en = demo;
    batch.set(doc.ref, patch, { merge: true });
    batchCount += 1;
    updated += 1;
  });
  if (batchCount > 0) await batch.commit();
  return { scanned: snap.size, updated };
}

/**
 * Sign private GCS objects under resumora-videos so the browser can play them.
 * Org policy blocks allUsers — signed URLs are required.
 */
async function signIfPrivateGcs(url) {
  const href = String(url || '').trim();
  if (!href) return href;
  let bucket = '';
  let filePath = '';
  const gs = href.match(/^gs:\/\/([^/]+)\/(.+)$/i);
  const https = href.match(/^https?:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/i);
  if (gs) {
    bucket = gs[1];
    filePath = gs[2];
  } else if (https) {
    bucket = https[1];
    filePath = decodeURIComponent(https[2].split('?')[0]);
  } else {
    return href;
  }
  if (bucket !== 'resumora-videos') return href;
  try {
    const file = getStorage().bucket(bucket).file(filePath);
    const [signed] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    });
    return signed;
  } catch (_) {
    return href;
  }
}

async function withSignedPlayUrls(video, index = 0) {
  const normalized = normalizeVideo(video, index);
  const urls = normalized.urls || {};
  const [en, fr, es] = await Promise.all([
    signIfPrivateGcs(urls.en),
    signIfPrivateGcs(urls.fr),
    signIfPrivateGcs(urls.es),
  ]);
  return {
    ...normalized,
    urls: { en, fr: fr || en, es: es || en },
    url_mp4_en: en,
    url_mp4_fr: fr || en,
    url_mp4_es: es || en,
  };
}

async function loadCatalogFromFirestore() {
  try {
    const db = getFirestore();
    const snap = await db.collection('videos').orderBy('order', 'asc').get();
    if (snap.empty) return null;
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (_) {
    return null;
  }
}

exports.multilingualUrls = multilingualUrls;
exports.normalizeVideo = normalizeVideo;
exports.toHttpsUrl = toHttpsUrl;
exports.withSignedPlayUrls = withSignedPlayUrls;
exports.seedFirestoreInterviewSeries = seedFirestoreInterviewSeries;
exports.PLAYABLE_DEMOS = PLAYABLE_DEMOS;
exports.FALLBACK_CATALOG = FALLBACK_CATALOG;

exports.getCatalog = async function getCatalog() {
  const seed = null;

  const fromFs = await loadCatalogFromFirestore();
  const configured = bilibiliConfigured();
  const demos = FALLBACK_CATALOG.map((v, i) => normalizeVideo(v, i));

  if (fromFs && fromFs.length) {
    // Return the real Firestore docs (r2:// and public R2 URLs) instead of forced demos.
    const videos = fromFs
      .map((doc, i) => {
        const id = String(doc.video_id || doc.id || '');
        const normalized = normalizeVideo(doc, i);
        const en = normalized.urls.en || '';
        const isDemo = /mdn\.mozilla\.net|w3schools\.com|gtv-videos-bucket|googlevideo\.com/i.test(
          en
        );
        return {
          ...doc,
          video_id: id || doc.id,
          id: doc.id || id,
          title: doc.title || doc.title_EN || id || 'untitled',
          title_EN: doc.title_EN || doc.title || id,
          title_FR: doc.title_FR || doc.title || id,
          title_ES: doc.title_ES || doc.title || id,
          urls: { ...normalized.urls },
          url_mp4_en: en,
          url_mp4_fr: normalized.urls.fr,
          url_mp4_es: normalized.urls.es,
          order: doc.order != null ? Number(doc.order) : 0,
          status: doc.status || (isDemo ? 'public-demo' : 'available'),
          source: doc.source || 'firestore',
        };
      })
      .filter((v) => {
        const u = String(v.url_mp4_en || '');
        return (
          !/\.pdf($|\?)/i.test(u) &&
          !/mdn\.mozilla\.net|w3schools\.com|gtv-videos-bucket|googlevideo\.com/i.test(u)
        );
      });
    videos.sort((a, b) => (a.order || 0) - (b.order || 0));

    return {
      videos: videos.length ? videos : demos,
      source: videos.length ? 'firestore' : 'interview-series',
      series_id: SERIES_ID,
      seed,
      bilibiliConfigured: configured,
      cacheControl: 'no-store',
      note: 'Firestore-backed catalog (real R2 URLs).',
    };
  }
  return {
    videos: demos,
    source: 'interview-series',
    series_id: SERIES_ID,
    seed,
    bilibiliConfigured: configured,
    cacheControl: 'no-store',
    note: 'Premium Interview Series v1 fallback. Upload masters to gs://resumora-videos/masters/interview-series-v1/.',
  };
};

/** Track a download attempt in Firestore `user_downloads` (server-side). */
exports.recordDownload = async function recordDownload(body = {}) {
  const userId = String(body.userId || body.user_id || 'anon').trim();
  const videoId = String(body.videoId || body.video_id || '').trim();
  const language = String(body.language || 'en')
    .trim()
    .toLowerCase();
  if (!videoId) {
    throw Object.assign(new Error('videoId is required'), { code: 'BAD_REQUEST' });
  }

  const db = getFirestore();
  const MAX = 5;
  const existing = await db
    .collection('user_downloads')
    .where('user_id', '==', userId)
    .limit(20)
    .get();

  const reused = existing.docs.some(
    (d) => d.data().video_id === videoId && d.data().language === language
  );
  if (reused) {
    return { ok: true, remaining: Math.max(0, MAX - existing.size), reused: true };
  }
  if (existing.size >= MAX) {
    return { ok: false, remaining: 0, reason: 'limit' };
  }

  await db.collection('user_downloads').add({
    user_id: userId,
    video_id: videoId,
    language,
    created_at: new Date().toISOString(),
    source: 'api',
  });
  return { ok: true, remaining: Math.max(0, MAX - existing.size - 1), reused: false };
};
