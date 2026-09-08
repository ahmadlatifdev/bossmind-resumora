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

function demoForIndex(index) {
  return PLAYABLE_DEMOS[Math.abs(Number(index) || 0) % PLAYABLE_DEMOS.length];
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

  // Dead Google sample hosts → replace with known-good demos
  const deadHost = /gtv-videos-bucket|storage\.googleapis\.com\/gtv-videos-bucket/i;
  if (!en || deadHost.test(en)) en = demoForIndex(index);
  if (!fr || deadHost.test(fr)) fr = en;
  if (!es || deadHost.test(es)) es = en;

  if (!isPlayableHttp(en)) en = demoForIndex(index);
  if (!isPlayableHttp(fr)) fr = en;
  if (!isPlayableHttp(es)) es = en;

  return { en, fr, es };
}

function normalizeVideo(video = {}, index = 0) {
  const urls = multilingualUrls(video, index);
  return {
    ...video,
    urls,
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
  let seed = null;
  try {
    seed = await seedFirestoreInterviewSeries();
  } catch (_) {
    seed = { upserted: 0, error: true };
  }

  const fromFs = await loadCatalogFromFirestore();
  const configured = bilibiliConfigured();
  // Series catalog is canonical; force public MDN/W3Schools until masters are public.
  const demos = FALLBACK_CATALOG.map((v, i) => normalizeVideo(v, i));
  const byId = new Map(demos.map((v) => [v.video_id, v]));

  if (fromFs && fromFs.length) {
    const seriesDocs = fromFs.filter((d) => byId.has(String(d.video_id || d.id || '')));
    const useDocs = seriesDocs.length ? seriesDocs : fromFs;
    const videos = useDocs.map((doc, i) => {
      const id = String(doc.video_id || doc.id || '');
      const demo = byId.get(id) || demos[i % demos.length];
      const titleKeep = {
        title_EN: doc.title_EN || doc.title || demo.title_EN,
        title_FR: doc.title_FR || demo.title_FR,
        title_ES: doc.title_ES || demo.title_ES,
        title: doc.title || doc.title_EN || demo.title_EN,
      };
      return {
        ...demo,
        ...titleKeep,
        video_id: id || demo.video_id,
        id: doc.id || demo.video_id,
        order: doc.order != null ? doc.order : demo.order,
        duration: demo.duration || doc.duration || 480,
        series_id: demo.series_id || SERIES_ID,
        script_path: demo.script_path || doc.script_path || '',
        urls: { ...demo.urls },
        url_mp4_en: demo.urls.en,
        url_mp4_fr: demo.urls.fr,
        url_mp4_es: demo.urls.es,
        source: 'interview-series',
        status: 'public-demo',
      };
    });
    // Prefer exactly the 4 series lessons (sorted by order).
    const ordered = demos.map((demo) => {
      const hit = videos.find((v) => v.video_id === demo.video_id);
      return hit || demo;
    });
    return {
      videos: ordered,
      source: 'interview-series',
      series_id: SERIES_ID,
      seed,
      bilibiliConfigured: configured,
      cacheControl: 'no-store',
      note: 'Premium Interview Series v1 — MDN/W3Schools placeholders until 1080p masters upload.',
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
