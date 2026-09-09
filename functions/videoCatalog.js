/**
 * Resumora video catalog + download tracking (Firestore-backed).
 * HeyGen removed — production masters publish via Bilibili / GCS pipeline.
 */

const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const bilibiliPublish = require('./bilibiliPublish');

/** Public, CORS-friendly demo MP4s (Google sample bucket now returns 403). */
const PLAYABLE_DEMOS = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://www.w3schools.com/html/mov_bbb.mp4',
  'https://www.w3schools.com/html/movie.mp4',
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
];

const FALLBACK_CATALOG = [
  {
    video_id: 'vid-resume-writing',
    title_EN: 'Resume writing that gets interviews',
    title_FR: 'Rédiger un CV qui obtient des entretiens',
    title_ES: 'Redacción de CV que consigue entrevistas',
    description_EN: 'Structure, impact bullets, and role targeting in 5 minutes.',
    description_FR: 'Structure, puces d’impact et ciblage du poste en 5 minutes.',
    description_ES: 'Estructura, logros medibles y enfoque al puesto en 5 minutos.',
    duration: 300,
    order: 1,
    url_mp4_en: PLAYABLE_DEMOS[0],
    url_mp4_fr: PLAYABLE_DEMOS[0],
    url_mp4_es: PLAYABLE_DEMOS[0],
    source: 'fallback',
  },
  {
    video_id: 'vid-ats-optimization',
    title_EN: 'ATS optimization essentials',
    title_FR: 'Essentiels de l’optimisation ATS',
    title_ES: 'Fundamentos de optimización ATS',
    description_EN: 'Keywords, formatting, and parser-safe layouts recruiters rely on.',
    description_FR: 'Mots-clés, mise en forme et structures compatibles parseurs.',
    description_ES: 'Palabras clave, formato y diseños seguros para parsers.',
    duration: 300,
    order: 2,
    url_mp4_en: PLAYABLE_DEMOS[1],
    url_mp4_fr: PLAYABLE_DEMOS[1],
    url_mp4_es: PLAYABLE_DEMOS[1],
    source: 'fallback',
  },
  {
    video_id: 'vid-linkedin-tips',
    title_EN: 'LinkedIn tips that sync with your resume',
    title_FR: 'Astuces LinkedIn alignées sur votre CV',
    title_ES: 'Consejos LinkedIn alineados con su CV',
    description_EN: 'Headline, About, and experience alignment for recruiter search.',
    description_FR: 'Titre, À propos et expériences pour la recherche recruteurs.',
    description_ES: 'Titular, Acerca de y experiencia para búsquedas de reclutadores.',
    duration: 300,
    order: 3,
    url_mp4_en: PLAYABLE_DEMOS[3],
    url_mp4_fr: PLAYABLE_DEMOS[3],
    url_mp4_es: PLAYABLE_DEMOS[3],
    source: 'fallback',
  },
  {
    video_id: 'vid-interview-prep',
    title_EN: 'Interview preparation that closes offers',
    title_FR: 'Préparation d’entretien qui conclut des offres',
    title_ES: 'Preparación de entrevistas que cierra ofertas',
    description_EN: 'STAR answers, closing questions, and calm delivery under pressure.',
    description_FR: 'Réponses STAR, questions de clôture et aisance sous pression.',
    description_ES: 'Respuestas STAR, cierre y dominio bajo presión.',
    duration: 300,
    order: 4,
    url_mp4_en: PLAYABLE_DEMOS[0],
    url_mp4_fr: PLAYABLE_DEMOS[1],
    url_mp4_es: PLAYABLE_DEMOS[3],
    source: 'fallback',
  },
];

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

  // Dead Google sample hosts → replace with known-good demos
  if (isDeadGtvOrMissing(en) || !isPlayableHttp(en)) en = demoForIndex(index);
  if (isDeadGtvOrMissing(fr) || !isPlayableHttp(fr)) fr = en;
  if (isDeadGtvOrMissing(es) || !isPlayableHttp(es)) es = en;

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
exports.isDeadGtvOrMissing = isDeadGtvOrMissing;
exports.migrateFirestoreGtvVideoUrls = migrateFirestoreGtvVideoUrls;
exports.PLAYABLE_DEMOS = PLAYABLE_DEMOS;
exports.FALLBACK_CATALOG = FALLBACK_CATALOG;

exports.getCatalog = async function getCatalog() {
  let migration = null;
  try {
    migration = await migrateFirestoreGtvVideoUrls();
  } catch (_) {
    migration = { scanned: 0, updated: 0, error: true };
  }

  const fromFs = await loadCatalogFromFirestore();
  const configured = bilibiliConfigured();
  // Always hardcode public MDN/W3Schools MP4s for playback.
  // gtv-videos-bucket returns 403; gs://resumora-videos is not publicly readable (org policy).
  const demos = FALLBACK_CATALOG.map((v, i) => normalizeVideo(v, i));
  if (fromFs && fromFs.length) {
    const videos = fromFs.map((doc, i) => {
      const demo = demos[i % demos.length];
      const titleKeep = {
        title_EN: doc.title_EN || doc.title || demo.title_EN,
        title_FR: doc.title_FR || demo.title_FR,
        title_ES: doc.title_ES || demo.title_ES,
        title: doc.title || doc.title_EN || demo.title_EN,
      };
      return {
        ...demo,
        ...titleKeep,
        video_id: String(doc.video_id || doc.id || demo.video_id),
        id: doc.id || demo.video_id,
        order: doc.order != null ? doc.order : demo.order,
        // Force playable public URLs — ignore Firestore gtv / private GCS paths
        urls: { ...demo.urls },
        url_mp4_en: demo.urls.en,
        url_mp4_fr: demo.urls.fr,
        url_mp4_es: demo.urls.es,
        source: 'public-demo',
        status: 'public-demo',
      };
    });
    return {
      videos,
      source: 'public-demo',
      bilibiliConfigured: configured,
      cacheControl: 'no-store',
      migration,
      note: 'Playback forced to public MDN/W3Schools MP4s (gtv-videos-bucket 403; resumora-videos private).',
    };
  }
  return {
    videos: demos,
    source: 'fallback',
    bilibiliConfigured: configured,
    cacheControl: 'no-store',
    migration,
    note: 'Upload masters to gs://resumora-videos/masters/; auto-publish via bilibili-outbox/ when cookies are set.',
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
