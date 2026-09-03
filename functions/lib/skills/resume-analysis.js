/**
 * Skill: resume analysis guidance (no invented credentials).
 */
function runResumeAnalysis({ message, lang }) {
  const code = String(lang || 'en').slice(0, 2);
  const tips = {
    en: [
      'Lead with a role-targeted summary (2–3 lines).',
      'Quantify impact in experience bullets (metrics, scope, outcomes).',
      'Align skills to the job description; keep ATS-friendly section headers.',
      'Do not invent employers, dates, or licenses.',
    ],
    fr: [
      'Commencez par un résumé ciblé (2–3 lignes).',
      'Quantifiez l’impact dans l’expérience (chiffres, portée, résultats).',
      'Alignez les compétences sur l’offre; titres ATS clairs.',
      'N’inventez pas d’employeurs, dates ou licences.',
    ],
    es: [
      'Empiece con un resumen orientado al puesto (2–3 líneas).',
      'Cuantifique el impacto en la experiencia (métricas y resultados).',
      'Alinee habilidades con la oferta; encabezados ATS claros.',
      'No invente empleadores, fechas ni licencias.',
    ],
  };
  const list = tips[code] || tips.en;
  return {
    skill: 'resume-analysis',
    reply: `${list.map((l, i) => `${i + 1}. ${l}`).join('\n')}\n\nFocus: ${String(message || '').slice(0, 200)}`,
  };
}

module.exports = { runResumeAnalysis };
