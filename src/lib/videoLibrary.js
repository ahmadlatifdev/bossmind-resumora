/**
 * Videos Library — 4 professional training videos × ~5:00, EN/FR/ES voice.
 * Prefer Firestore catalog via /api/video/catalog (GCS masters).
 * Local sources point at Hosting /videos/ when masters are deployed there.
 */

export const MAX_VIDEO_DOWNLOADS = 5;
export const VIDEO_DURATION_SEC = 300;

function masterUrl(id, lang = 'en') {
  return `/videos/${id}-${lang}.mp4`;
}

function captionUrl(id, lang = 'en') {
  return `/subtitles/${id}.${lang}.vtt`;
}

export const VIDEO_LIBRARY = Object.freeze([
  {
    id: 'vid-resume-writing',
    order: 1,
    topic: 'resume',
    durationSec: VIDEO_DURATION_SEC,
    hasVoice: true,
    title: {
      en: 'Resume writing that gets interviews',
      fr: 'Rédiger un CV qui obtient des entretiens',
      es: 'Redacción de CV que consigue entrevistas',
    },
    description: {
      en: 'Structure, impact bullets, and role targeting in 5 minutes.',
      fr: 'Structure, puces d’impact et ciblage du poste en 5 minutes.',
      es: 'Estructura, logros medibles y enfoque al puesto en 5 minutos.',
    },
    voiceover: {
      en: 'Welcome to Resumora. In this lesson, structure your resume for impact: lead with a clear headline, write achievement bullets with metrics, and target every line to the role you want. Strong resumes get interviews.',
      fr: 'Bienvenue sur Resumora. Dans cette leçon, structurez votre CV pour l’impact: un titre clair, des puces de réalisations avec des chiffres, et chaque ligne alignée sur le poste visé. Un CV fort obtient des entretiens.',
      es: 'Bienvenido a Resumora. En esta lección, estructure su CV con impacto: un titular claro, logros medibles y cada línea alineada al puesto deseado. Un CV sólido consigue entrevistas.',
    },
    thumbnail: masterUrl('vid-resume-writing', 'en'),
    captions: {
      en: captionUrl('vid-resume-writing', 'en'),
      fr: captionUrl('vid-resume-writing', 'fr'),
      es: captionUrl('vid-resume-writing', 'es'),
    },
    sources: {
      en: masterUrl('vid-resume-writing', 'en'),
      fr: masterUrl('vid-resume-writing', 'fr'),
      es: masterUrl('vid-resume-writing', 'es'),
    },
    downloadName: {
      en: 'resumora-resume-writing-en.mp4',
      fr: 'resumora-redaction-cv-fr.mp4',
      es: 'resumora-redaccion-cv-es.mp4',
    },
  },
  {
    id: 'vid-ats-optimization',
    order: 2,
    topic: 'ats',
    durationSec: VIDEO_DURATION_SEC,
    hasVoice: true,
    title: {
      en: 'ATS optimization essentials',
      fr: 'Essentiels de l’optimisation ATS',
      es: 'Fundamentos de optimización ATS',
    },
    description: {
      en: 'Keywords, formatting, and parser-safe layouts recruiters rely on.',
      fr: 'Mots-clés, mise en forme et structures compatibles parseurs.',
      es: 'Palabras clave, formato y diseños seguros para parsers.',
    },
    voiceover: {
      en: 'Applicant tracking systems scan for keywords and clean structure. Mirror the job description language, avoid text boxes that break parsers, and keep headings standard so recruiters see you first.',
      fr: 'Les ATS analysent les mots-clés et une structure propre. Reprenez le langage de l’offre, évitez les zones de texte fragiles, et utilisez des titres standards pour être visible.',
      es: 'Los ATS buscan palabras clave y una estructura limpia. Refleje el lenguaje de la oferta, evite cajas de texto frágiles y use títulos estándar para que lo vean primero.',
    },
    thumbnail: masterUrl('vid-ats-optimization', 'en'),
    captions: {
      en: captionUrl('vid-ats-optimization', 'en'),
      fr: captionUrl('vid-ats-optimization', 'fr'),
      es: captionUrl('vid-ats-optimization', 'es'),
    },
    sources: {
      en: masterUrl('vid-ats-optimization', 'en'),
      fr: masterUrl('vid-ats-optimization', 'fr'),
      es: masterUrl('vid-ats-optimization', 'es'),
    },
    downloadName: {
      en: 'resumora-ats-optimization-en.mp4',
      fr: 'resumora-optimisation-ats-fr.mp4',
      es: 'resumora-optimizacion-ats-es.mp4',
    },
  },
  {
    id: 'vid-linkedin-tips',
    order: 3,
    topic: 'linkedin',
    durationSec: VIDEO_DURATION_SEC,
    hasVoice: true,
    title: {
      en: 'LinkedIn tips that sync with your resume',
      fr: 'Astuces LinkedIn alignées sur votre CV',
      es: 'Consejos LinkedIn alineados con su CV',
    },
    description: {
      en: 'Headline, About, and experience alignment for recruiter search.',
      fr: 'Titre, À propos et expériences pour la recherche recruteurs.',
      es: 'Titular, Acerca de y experiencia para búsquedas de reclutadores.',
    },
    voiceover: {
      en: 'Align LinkedIn with your resume. Craft a searchable headline, write an About section that proves value, and keep experience dates and titles consistent so recruiters trust your story.',
      fr: 'Alignez LinkedIn sur votre CV. Créez un titre searchable, un À propos qui prouve votre valeur, et des expériences cohérentes pour gagner la confiance des recruteurs.',
      es: 'Alinee LinkedIn con su CV. Cree un titular buscable, un Acerca de que demuestre valor, y mantenga títulos y fechas coherentes para generar confianza.',
    },
    thumbnail: masterUrl('vid-linkedin-tips', 'en'),
    captions: {
      en: captionUrl('vid-linkedin-tips', 'en'),
      fr: captionUrl('vid-linkedin-tips', 'fr'),
      es: captionUrl('vid-linkedin-tips', 'es'),
    },
    sources: {
      en: masterUrl('vid-linkedin-tips', 'en'),
      fr: masterUrl('vid-linkedin-tips', 'fr'),
      es: masterUrl('vid-linkedin-tips', 'es'),
    },
    downloadName: {
      en: 'resumora-linkedin-tips-en.mp4',
      fr: 'resumora-linkedin-conseils-fr.mp4',
      es: 'resumora-linkedin-consejos-es.mp4',
    },
  },
  {
    id: 'vid-interview-prep',
    order: 4,
    topic: 'interview',
    durationSec: VIDEO_DURATION_SEC,
    hasVoice: true,
    title: {
      en: 'Interview preparation that closes offers',
      fr: 'Préparation d’entretien qui conclut des offres',
      es: 'Preparación de entrevistas que cierra ofertas',
    },
    description: {
      en: 'STAR answers, closing questions, and calm delivery under pressure.',
      fr: 'Réponses STAR, questions de clôture et aisance sous pression.',
      es: 'Respuestas STAR, cierre y dominio bajo presión.',
    },
    voiceover: {
      en: 'Prepare STAR stories, ask strong closing questions, and practice calm delivery under pressure. Clear answers and confident presence help you close the offer.',
      fr: 'Préparez des récits STAR, posez de bonnes questions de clôture, et travaillez une aisance calme sous pression. Des réponses claires aident à conclure l’offre.',
      es: 'Prepare historias STAR, haga buenas preguntas de cierre y practique una entrega calmada bajo presión. Respuestas claras ayudan a cerrar la oferta.',
    },
    thumbnail: masterUrl('vid-interview-prep', 'en'),
    captions: {
      en: captionUrl('vid-interview-prep', 'en'),
      fr: captionUrl('vid-interview-prep', 'fr'),
      es: captionUrl('vid-interview-prep', 'es'),
    },
    sources: {
      en: masterUrl('vid-interview-prep', 'en'),
      fr: masterUrl('vid-interview-prep', 'fr'),
      es: masterUrl('vid-interview-prep', 'es'),
    },
    downloadName: {
      en: 'resumora-interview-prep-en.mp4',
      fr: 'resumora-preparation-entretien-fr.mp4',
      es: 'resumora-preparacion-entrevista-es.mp4',
    },
  },
]);

export function formatDuration(sec = VIDEO_DURATION_SEC) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function getVoiceoverScript(video, lang = 'en') {
  if (!video?.voiceover) return '';
  return video.voiceover[lang] || video.voiceover.en || '';
}

/** Format seconds as WebVTT timestamp HH:MM:SS.mmm */
function toVttTime(sec) {
  const total = Math.max(0, Number(sec) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const whole = Math.floor(s);
  const ms = Math.round((s - whole) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * Build a simple WebVTT document from narration text.
 * Used when dedicated .vtt assets are not yet published.
 */
export function buildVoiceoverVtt(text, durationSec = VIDEO_DURATION_SEC) {
  const cue = String(text || '')
    .replace(/\r/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  if (!cue) return '';
  const end = toVttTime(Math.max(5, durationSec || VIDEO_DURATION_SEC));
  return `WEBVTT\n\n00:00:00.000 --> ${end}\n${cue}\n`;
}

/**
 * Resolve caption sources for EN/FR/ES with English fallback.
 * Prefers video.captions[lang] URL, else generates a Blob VTT from voiceover.
 * Returns { en?, fr?, es? } where missing langs are omitted (player falls back to en).
 */
export function resolveCaptionTracks(video, durationSec = VIDEO_DURATION_SEC) {
  const captions = video?.captions || {};
  const duration = video?.durationSec || durationSec;
  const out = {};
  for (const code of ['en', 'fr', 'es']) {
    const url = captions[code] || captions[code.toUpperCase()];
    if (url && typeof url === 'string' && (/^https?:\/\//i.test(url) || url.startsWith('/'))) {
      out[code] = { kind: 'url', src: url, label: code.toUpperCase(), srclang: code };
      continue;
    }
    const script = getVoiceoverScript(video, code);
    if (!script) continue;
    out[code] = {
      kind: 'vtt-text',
      text: buildVoiceoverVtt(script, duration),
      label: code.toUpperCase(),
      srclang: code,
    };
  }
  // Guarantee at least English when any voiceover exists
  if (!out.en) {
    const enScript = getVoiceoverScript(video, 'en');
    if (enScript) {
      out.en = {
        kind: 'vtt-text',
        text: buildVoiceoverVtt(enScript, duration),
        label: 'EN',
        srclang: 'en',
      };
    }
  }
  return out;
}

/** Pick active caption track code: prefer requested, else EN, else first available. */
export function pickCaptionLang(tracks, requested = 'en') {
  if (!tracks || typeof tracks !== 'object') return null;
  const code = String(requested || 'en')
    .slice(0, 2)
    .toLowerCase();
  if (tracks[code]) return code;
  if (tracks.en) return 'en';
  const first = Object.keys(tracks)[0];
  return first || null;
}
