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
    videos: FALLBACK_CATALOG,
    source: 'fallback',
    heygenConfigured: Boolean(heygenKey()),
    note: 'Pre-generate EN masters in HeyGen, upload MP4s to Storage, write Firestore videos docs.',
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
  try {
    const { recordServiceEvent } = require('./lib/serviceDelivery');
    await recordServiceEvent({
      customerId: body.customerId || body.userId || 'anon',
      subscriptionId: body.subscriptionId || '',
      eventType: 'video_generated',
      metadata: { video_id: videoId, mode: 'avatar_v2' },
      userId: body.userId || null,
    });
  } catch (_) {
    /* non-blocking */
  }
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
  return { ok: true, remaining: Math.max(0, MAX - existing.size - 1), reused: false };
};

exports.heygenKeyPresent = () => Boolean(heygenKey());
