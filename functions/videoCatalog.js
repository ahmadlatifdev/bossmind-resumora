/**
 * Resumora video catalog + download tracking (Firestore-backed).
 * HeyGen removed — production masters publish via Bilibili / GCS pipeline.
 */

const { getFirestore } = require('firebase-admin/firestore');
const bilibiliPublish = require('./bilibiliPublish');

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
    url_mp4_en: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    url_mp4_fr: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    url_mp4_es: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
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
    url_mp4_en: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    url_mp4_fr: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    url_mp4_es: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
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
    url_mp4_en: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    url_mp4_fr: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    url_mp4_es: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
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
    url_mp4_en: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
    url_mp4_fr: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
    url_mp4_es: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
    source: 'fallback',
  },
];

function bilibiliConfigured() {
  return bilibiliPublish.cookiesConfigured(bilibiliPublish.readCookieBundle());
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

exports.getCatalog = async function getCatalog() {
  const fromFs = await loadCatalogFromFirestore();
  const configured = bilibiliConfigured();
  if (fromFs && fromFs.length) {
    return { videos: fromFs, source: 'firestore', bilibiliConfigured: configured };
  }
  return {
    videos: FALLBACK_CATALOG,
    source: 'fallback',
    bilibiliConfigured: configured,
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
