/**
 * Premium Interview Series (Enterprise education library foundation).
 * 4 topics × EN/FR/ES — playable MDN/W3Schools placeholders until masters upload.
 * Full production scripts: content/interview-series/
 */

'use strict';

const PLAYABLE_DEMOS = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://www.w3schools.com/html/mov_bbb.mp4',
  'https://www.w3schools.com/html/movie.mp4',
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
];

/** Target runtime per lesson (8:00). */
const SERIES_DURATION_SEC = 480;

const SERIES_ID = 'premium-interview-series-v1';
const SERIES_TIER = 'enterprise-education';

const INTERVIEW_SERIES_CATALOG = [
  {
    video_id: 'vid-resume-to-interview',
    order: 1,
    series_id: SERIES_ID,
    series_tier: SERIES_TIER,
    topic: 'resume-ats',
    duration: SERIES_DURATION_SEC,
    title_EN: 'Resume-to-Interview Mastery (ATS Optimization)',
    title_FR: 'Du CV à l’entretien (optimisation ATS)',
    title_ES: 'Del CV a la entrevista (optimización ATS)',
    description_EN:
      'Align keywords with the job description, turn ATS gains into interview talking points, and use project-first formats for fresher and senior profiles.',
    description_FR:
      'Alignez les mots-clés sur l’offre, transformez le score ATS en arguments d’entretien, et utilisez un format projet-d’abord pour juniors et seniors.',
    description_ES:
      'Alinee palabras clave con la oferta, convierta mejoras ATS en argumentos de entrevista y use formatos centrados en proyectos para junior y senior.',
    url_mp4_en: PLAYABLE_DEMOS[0],
    url_mp4_fr: PLAYABLE_DEMOS[0],
    url_mp4_es: PLAYABLE_DEMOS[0],
    script_path: 'content/interview-series/01-resume-to-interview.md',
    source: 'interview-series',
    status: 'public-demo',
    white_label_ready: true,
    team_collab_ready: true,
  },
  {
    video_id: 'vid-star-behavioral',
    order: 2,
    series_id: SERIES_ID,
    series_tier: SERIES_TIER,
    topic: 'star-behavioral',
    duration: SERIES_DURATION_SEC,
    title_EN: 'Behavioral & STAR Method Excellence',
    title_FR: 'Excellence comportementale et méthode STAR',
    title_ES: 'Excelencia conductual y método STAR',
    description_EN:
      'Deep-dive into STAR, build 4–5 versatile story blocks, and answer “greatest weakness” with transparent growth framing.',
    description_FR:
      'Approfondissez STAR, préparez 4–5 blocs d’histoires polyvalents, et traitez la « plus grande faiblesse » avec transparence.',
    description_ES:
      'Profundice en STAR, prepare 4–5 bloques de historias versátiles y responda la “mayor debilidad” con transparencia.',
    url_mp4_en: PLAYABLE_DEMOS[1],
    url_mp4_fr: PLAYABLE_DEMOS[1],
    url_mp4_es: PLAYABLE_DEMOS[1],
    script_path: 'content/interview-series/02-star-behavioral.md',
    source: 'interview-series',
    status: 'public-demo',
    white_label_ready: true,
    team_collab_ready: true,
  },
  {
    video_id: 'vid-situational-async',
    order: 3,
    series_id: SERIES_ID,
    series_tier: SERIES_TIER,
    topic: 'situational-async',
    duration: SERIES_DURATION_SEC,
    title_EN: 'Situational & Asynchronous Interview Strategy',
    title_FR: 'Stratégie d’entretiens situationnels et asynchrones',
    title_ES: 'Estrategia de entrevistas situacionales y asíncronas',
    description_EN:
      'Handle situational prompts with critical thinking and EQ, use 2+6 minute timing, and open with a brief, commanding intro.',
    description_FR:
      'Gérez les prompts situationnels (pensée critique, QE), respectez le timing 2+6 minutes, et ouvrez avec une intro concise et forte.',
    description_ES:
      'Gestione prompts situacionales (pensamiento crítico, IE), use timing 2+6 minutos y abra con una intro breve e impactante.',
    url_mp4_en: PLAYABLE_DEMOS[2],
    url_mp4_fr: PLAYABLE_DEMOS[2],
    url_mp4_es: PLAYABLE_DEMOS[2],
    script_path: 'content/interview-series/03-situational-async.md',
    source: 'interview-series',
    status: 'public-demo',
    white_label_ready: true,
    team_collab_ready: true,
  },
  {
    video_id: 'vid-global-career',
    order: 4,
    series_id: SERIES_ID,
    series_tier: SERIES_TIER,
    topic: 'global-multilang',
    duration: SERIES_DURATION_SEC,
    title_EN: 'Multi-Language & Global Career Positioning',
    title_FR: 'Multilingue et positionnement de carrière mondiale',
    title_ES: 'Multilingüe y posicionamiento profesional global',
    description_EN:
      'Navigate India/US/UK/Canada/Australia interview norms, body language for global audiences, and market-tuned AI job search.',
    description_FR:
      'Normes d’entretien Inde/US/UK/Canada/Australie, langage corporel pour audiences globales, et recherche d’emploi IA par marché.',
    description_ES:
      'Normas de entrevista en India/EE. UU./UK/Canadá/Australia, lenguaje corporal global y búsqueda de empleo con IA por mercado.',
    url_mp4_en: PLAYABLE_DEMOS[3],
    url_mp4_fr: PLAYABLE_DEMOS[3],
    url_mp4_es: PLAYABLE_DEMOS[3],
    script_path: 'content/interview-series/04-global-career.md',
    source: 'interview-series',
    status: 'public-demo',
    white_label_ready: true,
    team_collab_ready: true,
  },
];

module.exports = {
  PLAYABLE_DEMOS,
  SERIES_DURATION_SEC,
  SERIES_ID,
  SERIES_TIER,
  INTERVIEW_SERIES_CATALOG,
};
