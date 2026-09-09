/**
 * Videos Library — Premium Interview Series v1 (4 × ≤8:00, EN/FR/ES).
 * Playable MDN/W3Schools placeholders until 1080p masters upload.
 * Full scripts: content/interview-series/
 */

export const MAX_VIDEO_DOWNLOADS = 5;
export const VIDEO_DURATION_SEC = 480;
export const SERIES_ID = 'premium-interview-series-v1';

/** Public sample MP4s (gtv-videos-bucket returns 403). */
const AUDIO_MP4_A = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
const AUDIO_MP4_B = 'https://www.w3schools.com/html/mov_bbb.mp4';
const AUDIO_MP4_C = 'https://www.w3schools.com/html/movie.mp4';
const AUDIO_MP4_D = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

export const VIDEO_LIBRARY = Object.freeze([
  {
    id: 'vid-resume-to-interview',
    order: 1,
    topic: 'resume-ats',
    seriesId: SERIES_ID,
    durationSec: VIDEO_DURATION_SEC,
    hasVoice: true,
    title: {
      en: 'Resume-to-Interview Mastery (ATS Optimization)',
      fr: 'Du CV à l’entretien (optimisation ATS)',
      es: 'Del CV a la entrevista (optimización ATS)',
    },
    description: {
      en: 'Align keywords with the JD, turn ATS gains into talking points, project-first formats.',
      fr: 'Alignez les mots-clés, transformez le score ATS en arguments, format projet-d’abord.',
      es: 'Alinee palabras clave, convierta mejoras ATS en argumentos, formato proyecto-primero.',
    },
    voiceover: {
      en: 'Resume and interview are one system. Use Resumora’s AI Keyword Tool to mirror the job description honestly, convert ATS score lifts into STAR talking points, and open with a project-first story for fresher or senior profiles. Claim, proof, relevance, ask.',
      fr: 'CV et entretien forment un seul système. Utilisez l’outil AI Keyword de Resumora, convertissez le score ATS en arguments STAR, et ouvrez par un récit projet-d’abord. Affirmation, preuve, pertinence, invitation.',
      es: 'CV y entrevista son un solo sistema. Use la herramienta AI Keyword de Resumora, convierta el score ATS en argumentos STAR y abra con una historia proyecto-primero. Afirmación, prueba, relevancia, invitación.',
    },
    thumbnail: AUDIO_MP4_A,
    sources: { en: AUDIO_MP4_A, fr: AUDIO_MP4_A, es: AUDIO_MP4_A },
    downloadName: {
      en: 'resumora-vid-resume-to-interview-en.mp4',
      fr: 'resumora-vid-resume-to-interview-fr.mp4',
      es: 'resumora-vid-resume-to-interview-es.mp4',
    },
  },
  {
    id: 'vid-star-behavioral',
    order: 2,
    topic: 'star-behavioral',
    seriesId: SERIES_ID,
    durationSec: VIDEO_DURATION_SEC,
    hasVoice: true,
    title: {
      en: 'Behavioral & STAR Method Excellence',
      fr: 'Excellence comportementale et méthode STAR',
      es: 'Excelencia conductual y método STAR',
    },
    description: {
      en: 'Deep STAR, 4–5 versatile story blocks, transparent greatest-weakness answers.',
      fr: 'STAR en profondeur, 4–5 blocs d’histoires, faiblesse traitée avec transparence.',
      es: 'STAR a fondo, 4–5 bloques de historias, debilidad con transparencia.',
    },
    voiceover: {
      en: 'Prepare four to five STAR story blocks: conflict, ambiguity, failure recovery, leadership without authority, and a quality save. Keep Action longest and Result crisp. For greatest weakness, name a real gap, show your detection system, and your improvement status.',
      fr: 'Préparez quatre à cinq blocs STAR : conflit, ambiguïté, reprise après échec, leadership sans titre, sauvetage qualité. Action détaillée, résultat net. Pour la faiblesse : écart réel, système de détection, progrès actuel.',
      es: 'Prepare cuatro o cinco bloques STAR: conflicto, ambigüedad, recuperación, liderazgo sin título y rescate de calidad. Acción detallada, resultado claro. Para la debilidad: brecha real, sistema de detección y progreso.',
    },
    thumbnail: AUDIO_MP4_B,
    sources: { en: AUDIO_MP4_B, fr: AUDIO_MP4_B, es: AUDIO_MP4_B },
    downloadName: {
      en: 'resumora-vid-star-behavioral-en.mp4',
      fr: 'resumora-vid-star-behavioral-fr.mp4',
      es: 'resumora-vid-star-behavioral-es.mp4',
    },
  },
  {
    id: 'vid-situational-async',
    order: 3,
    topic: 'situational-async',
    seriesId: SERIES_ID,
    durationSec: VIDEO_DURATION_SEC,
    hasVoice: true,
    title: {
      en: 'Situational & Asynchronous Interview Strategy',
      fr: 'Stratégie d’entretiens situationnels et asynchrones',
      es: 'Estrategia de entrevistas situacionales y asíncronas',
    },
    description: {
      en: 'Situational EQ prompts, 2+6 minute timing, brief commanding introductions.',
      fr: 'Prompts situationnels, timing 2+6 minutes, intros brèves et impactantes.',
      es: 'Prompts situacionales, timing 2+6 minutos, intros breves e impactantes.',
    },
    voiceover: {
      en: 'For situational prompts, clarify goals and constraints, choose a principle, then walk Action to Result. In async rounds, use two minutes to read and outline, six minutes to speak. Open with a thirty-second intro: name, target role, one proof line, and agenda.',
      fr: 'Pour les prompts situationnels, clarifiez but et contraintes, choisissez un principe, puis Action vers Résultat. En asynchrone : deux minutes pour lire et planifier, six pour parler. Intro de trente secondes : nom, cible, preuve, agenda.',
      es: 'En prompts situacionales, aclare meta y restricciones, elija un principio y pase de Acción a Resultado. En asíncrono: dos minutos para leer y planear, seis para hablar. Intro de treinta segundos: nombre, objetivo, prueba y agenda.',
    },
    thumbnail: AUDIO_MP4_C,
    sources: { en: AUDIO_MP4_C, fr: AUDIO_MP4_C, es: AUDIO_MP4_C },
    downloadName: {
      en: 'resumora-vid-situational-async-en.mp4',
      fr: 'resumora-vid-situational-async-fr.mp4',
      es: 'resumora-vid-situational-async-es.mp4',
    },
  },
  {
    id: 'vid-global-career',
    order: 4,
    topic: 'global-multilang',
    seriesId: SERIES_ID,
    durationSec: VIDEO_DURATION_SEC,
    hasVoice: true,
    title: {
      en: 'Multi-Language & Global Career Positioning',
      fr: 'Multilingue et positionnement de carrière mondiale',
      es: 'Multilingüe y posicionamiento profesional global',
    },
    description: {
      en: 'India/US/UK/Canada/Australia norms, global body language, geo-tuned AI job search.',
      fr: 'Normes Inde/US/UK/Canada/Australie, présence globale, recherche IA par marché.',
      es: 'Normas India/EE. UU./UK/Canadá/Australia, presencia global, búsqueda IA por mercado.',
    },
    voiceover: {
      en: 'Tune stories to market nuance: India ownership and learning path, US impact metrics, UK understated confidence, Canada collaboration, Australia practical outcomes. Record separate EN, FR, and ES masters. Point Resumora’s AI Job Search Assistant at the right geography and title synonyms.',
      fr: 'Adaptez vos récits : Inde ownership et parcours, US métriques d’impact, UK confiance mesurée, Canada collaboration, Australie résultats concrets. Enregistrez des masters EN, FR et ES séparés. Réglez l’assistant IA de Resumora sur le bon marché.',
      es: 'Adapte historias: India ownership y aprendizaje, EE. UU. métricas, UK confianza mesurada, Canadá colaboración, Australia resultados prácticos. Grabe masters EN, FR y ES por separado. Apunte el asistente IA de Resumora al mercado correcto.',
    },
    thumbnail: AUDIO_MP4_D,
    sources: { en: AUDIO_MP4_D, fr: AUDIO_MP4_D, es: AUDIO_MP4_D },
    downloadName: {
      en: 'resumora-vid-global-career-en.mp4',
      fr: 'resumora-vid-global-career-fr.mp4',
      es: 'resumora-vid-global-career-es.mp4',
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
