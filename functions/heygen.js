/**
 * HeyGen REST proxy for resumora.net
 * Uses HEYGEN_API_KEY from Functions env / Secret Manager — never exposed to the client.
 * Prefers pre-generated catalog in Firestore `videos` over on-demand generation.
 */

const { getFirestore } = require('firebase-admin/firestore');

const HEYGEN_BASE = 'https://api.heygen.com';

function heygenKey() {
  return String(process.env.HEYGEN_API_KEY || process.env.HEYGEN_API_TOKEN || '').trim();
}

async function heygenFetch(path, { method = 'GET', body } = {}) {
  const key = heygenKey();
  if (!key) {
    const err = new Error('HEYGEN_API_KEY is not configured on the server.');
    err.code = 'MISSING_KEY';
    throw err;
  }
  const res = await fetch(`${HEYGEN_BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Api-Key': key,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.message || `HeyGen ${res.status}`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

/** Last-resort catalog metadata only — no Google sample bucket URLs. */
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
    url_mp4_en: '',
    url_mp4_fr: '',
    url_mp4_es: '',
    captions_en: '/subtitles/vid-resume-writing.en.vtt',
    captions_fr: '/subtitles/vid-resume-writing.fr.vtt',
    captions_es: '/subtitles/vid-resume-writing.es.vtt',
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
    url_mp4_en: '',
    url_mp4_fr: '',
    url_mp4_es: '',
    captions_en: '/subtitles/vid-ats-optimization.en.vtt',
    captions_fr: '/subtitles/vid-ats-optimization.fr.vtt',
    captions_es: '/subtitles/vid-ats-optimization.es.vtt',
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
    url_mp4_en: '',
    url_mp4_fr: '',
    url_mp4_es: '',
    captions_en: '/subtitles/vid-linkedin-tips.en.vtt',
    captions_fr: '/subtitles/vid-linkedin-tips.fr.vtt',
    captions_es: '/subtitles/vid-linkedin-tips.es.vtt',
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
    url_mp4_en: '',
    url_mp4_fr: '',
    url_mp4_es: '',
    captions_en: '/subtitles/vid-interview-prep.en.vtt',
    captions_fr: '/subtitles/vid-interview-prep.fr.vtt',
    captions_es: '/subtitles/vid-interview-prep.es.vtt',
    source: 'fallback',
  },
];

function pickStr(data, ...keys) {
  for (const k of keys) {
    const v = data?.[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

/** Normalize Firestore / seed field aliases for the Video Library UI. */
function normalizeVideoDoc(id, data = {}) {
  const titleEn = pickStr(data, 'title_EN', 'title_en', 'titleEn');
  const titleFr = pickStr(data, 'title_FR', 'title_fr', 'titleFr') || titleEn;
  const titleEs = pickStr(data, 'title_ES', 'title_es', 'titleEs') || titleEn;
  const descEn = pickStr(data, 'description_EN', 'description_en', 'descriptionEn');
  const descFr = pickStr(data, 'description_FR', 'description_fr', 'descriptionFr') || descEn;
  const descEs = pickStr(data, 'description_ES', 'description_es', 'descriptionEs') || descEn;
  const urlEn = pickStr(data, 'url_mp4_en', 'url_mp4');
  const urlFr = pickStr(data, 'url_mp4_fr') || urlEn;
  const urlEs = pickStr(data, 'url_mp4_es') || urlEn;
  return {
    id,
    video_id: id,
    ...data,
    order: Number(data.order) || 0,
    duration: Number(data.duration) || 300,
    title_EN: titleEn,
    title_FR: titleFr,
    title_ES: titleEs,
    title_en: titleEn,
    title_fr: titleFr,
    title_es: titleEs,
    description_EN: descEn,
    description_FR: descFr,
    description_ES: descEs,
    description_en: descEn,
    description_fr: descFr,
    description_es: descEs,
    url_mp4_en: urlEn,
    url_mp4_fr: urlFr,
    url_mp4_es: urlEs,
    captions_en: pickStr(data, 'captions_en', 'captions.en') || `/subtitles/${id}.en.vtt`,
    captions_fr: pickStr(data, 'captions_fr', 'captions.fr') || `/subtitles/${id}.fr.vtt`,
    captions_es: pickStr(data, 'captions_es', 'captions.es') || `/subtitles/${id}.es.vtt`,
    voiceover_en: pickStr(data, 'voiceover_en', 'voiceover.en') || descEn,
    voiceover_fr: pickStr(data, 'voiceover_fr', 'voiceover.fr') || descFr,
    voiceover_es: pickStr(data, 'voiceover_es', 'voiceover.es') || descEs,
    source: pickStr(data, 'source') || 'firestore',
  };
}

async function loadCatalogFromFirestore() {
  try {
    const db = getFirestore();
    let snap;
    try {
      snap = await db.collection('videos').orderBy('order', 'asc').get();
    } catch (_) {
      // Missing composite index / order field — still prefer any docs over sample fallback
      snap = await db.collection('videos').get();
    }
    if (!snap || snap.empty) return null;
    const videos = snap.docs.map((doc) => normalizeVideoDoc(doc.id, doc.data() || {}));
    videos.sort((a, b) => (a.order || 0) - (b.order || 0));
    // Require at least one playable EN URL to treat catalog as production
    const playable = videos.filter((v) => /^https?:\/\//i.test(v.url_mp4_en || ''));
    if (!playable.length) return null;
    return playable.length === videos.length ? videos : playable;
  } catch (_) {
    return null;
  }
}

async function cacheGeneration(doc) {
  try {
    const db = getFirestore();
    await db
      .collection('heygen_jobs')
      .doc(String(doc.video_id || doc.id))
      .set(
        {
          ...doc,
          updated_at: new Date().toISOString(),
        },
        { merge: true }
      );
  } catch (_) {
    /* optional */
  }
}

exports.getCatalog = async function getCatalog() {
  const fromFs = await loadCatalogFromFirestore();
  if (fromFs && fromFs.length) {
    return { videos: fromFs, source: 'firestore', heygenConfigured: Boolean(heygenKey()) };
  }
  return {
    videos: FALLBACK_CATALOG.map((v) => normalizeVideoDoc(v.video_id, v)),
    source: 'fallback',
    heygenConfigured: Boolean(heygenKey()),
    note: 'Firestore videos empty or missing url_mp4_en. Place masters in public/videos/ and run scripts/seed-video-library.ps1',
  };
};

/**
 * Start async generation via Video Agent or v2 avatar video.
 * Body: { prompt?, templateId?, avatarId?, voiceId?, videoKey?, language? }
 */
exports.generateVideo = async function generateVideo(body = {}) {
  const prompt = String(body.prompt || '').trim();
  const templateId = String(body.templateId || '').trim();
  const videoKey = String(body.videoKey || body.video_id || '').trim();

  if (templateId) {
    let data;
    try {
      data = await heygenFetch('/v3/videos', {
        method: 'POST',
        body: {
          template_id: templateId,
          ...((body.variables && { variables: body.variables }) || {}),
        },
      });
    } catch (_) {
      data = await heygenFetch('/v2/template/generate', {
        method: 'POST',
        body: {
          template_id: templateId,
          ...((body.variables && { variables: body.variables }) || {}),
        },
      });
    }
    const videoId = data.data?.video_id || data.video_id;
    await cacheGeneration({
      video_id: videoId,
      videoKey,
      status: 'processing',
      mode: 'template',
    });
    return { video_id: videoId, status: 'processing', mode: 'template' };
  }

  if (!prompt) {
    throw Object.assign(new Error('prompt or templateId is required'), { code: 'BAD_REQUEST' });
  }

  // Prefer Video Agent (v3 sessions → legacy generate), then classic v2 avatar video.
  const agentAttempts = [
    {
      path: '/v3/video_agent/sessions',
      body: {
        prompt,
        ...(body.aspect_ratio ? { aspect_ratio: body.aspect_ratio } : {}),
      },
      mode: 'video_agent_v3',
    },
    {
      path: '/v1/video_agent/generate',
      body: {
        prompt,
        ...(body.aspect_ratio ? { aspect_ratio: body.aspect_ratio } : {}),
      },
      mode: 'video_agent',
    },
  ];

  let lastAgentErr = null;
  for (const attempt of agentAttempts) {
    try {
      const agent = await heygenFetch(attempt.path, { method: 'POST', body: attempt.body });
      const videoId =
        agent.data?.video_id || agent.video_id || agent.data?.session_id || agent.session_id;
      await cacheGeneration({
        video_id: videoId,
        videoKey,
        status: 'processing',
        mode: attempt.mode,
        prompt,
      });
      return { video_id: videoId, status: 'processing', mode: attempt.mode };
    } catch (err) {
      lastAgentErr = err;
    }
  }

  // Fallback: avatar video (explicit control)
  const avatarId = body.avatarId || process.env.HEYGEN_DEFAULT_AVATAR_ID;
  const voiceId = body.voiceId || process.env.HEYGEN_DEFAULT_VOICE_ID;
  if (!avatarId || !voiceId) {
    throw Object.assign(
      new Error(
        `HeyGen agent unavailable (${lastAgentErr?.message || 'unknown'}). Set HEYGEN_DEFAULT_AVATAR_ID and HEYGEN_DEFAULT_VOICE_ID for v2 fallback.`
      ),
      { code: 'CONFIG' }
    );
  }
  const data = await heygenFetch('/v2/video/generate', {
    method: 'POST',
    body: {
      video_inputs: [
        {
          character: { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' },
          voice: { type: 'text', input_text: prompt.slice(0, 4500), voice_id: voiceId },
        },
      ],
      dimension: { width: 1280, height: 720 },
    },
  });
  const videoId = data.data?.video_id || data.video_id;
  await cacheGeneration({
    video_id: videoId,
    videoKey,
    status: 'processing',
    mode: 'avatar_v2',
    prompt,
  });
  return { video_id: videoId, status: 'processing', mode: 'avatar_v2' };
};

exports.getVideoStatus = async function getVideoStatus(videoId) {
  const id = String(videoId || '').trim();
  if (!id) {
    throw Object.assign(new Error('videoId is required'), { code: 'BAD_REQUEST' });
  }

  let data;
  try {
    data = await heygenFetch(`/v3/videos/${encodeURIComponent(id)}`, { method: 'GET' });
  } catch (_) {
    data = await heygenFetch(`/v1/video_status.get?video_id=${encodeURIComponent(id)}`, {
      method: 'GET',
    });
  }
  const status = data.data?.status || data.status;
  const videoUrl = data.data?.video_url || data.video_url || null;
  if (videoUrl) {
    await cacheGeneration({
      video_id: id,
      status: 'completed',
      video_url: videoUrl,
    });
  }
  return {
    video_id: id,
    status,
    video_url: videoUrl,
    duration: data.data?.duration,
    raw: data.data || data,
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

  const notifyEmail = String(body.email || '').trim();
  if (notifyEmail.includes('@')) {
    try {
      const notifications = require('./notifications');
      await notifications.sendNotificationEmail({
        to: notifyEmail,
        templateKey: 'download.completed',
        locale: language.slice(0, 2) || 'en',
      });
    } catch (_) {
      /* non-fatal */
    }
  }

  return { ok: true, remaining: Math.max(0, MAX - existing.size - 1), reused: false };
};

exports.heygenKeyPresent = () => Boolean(heygenKey());
