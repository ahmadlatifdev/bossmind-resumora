/**
 * Skill: Social-Pipeline — YouTube/TikTok content outline (EN/FR/ES).
 * Does not publish; coordinates with video-script / HeyGen services when wired.
 */
function runSocialPipeline({ message, lang }) {
  const code = String(lang || 'en').slice(0, 2);
  const steps = {
    en: [
      'Social-Pipeline (draft only — no auto-publish).',
      '1. Hook (0–3s) — concrete benefit, no hype fluff.',
      '2. Proof beat — product UI or before/after.',
      '3. Soft CTA — resumora.net (or project PUBLIC_URL).',
      '4. Captions EN/FR/ES via localize pipeline when ready.',
      '5. Hand off to videogenerationagent / HeyGen only after human approve.',
    ],
    fr: [
      'Social-Pipeline (brouillon seulement — pas de publication auto).',
      '1. Accroche (0–3s).',
      '2. Preuve produit.',
      '3. CTA soft — resumora.net.',
      '4. Sous-titres EN/FR/ES via localizer si prêt.',
      '5. Hand-off vidéo seulement après validation humaine.',
    ],
    es: [
      'Social-Pipeline (borrador — sin publicación automática).',
      '1. Gancho (0–3s).',
      '2. Prueba del producto.',
      '3. CTA suave — resumora.net.',
      '4. Subtítulos EN/FR/ES vía localizer si está listo.',
      '5. Entrega a video solo tras aprobación humana.',
    ],
  };
  const list = steps[code] || steps.en;
  return {
    skill: 'social-pipeline',
    reply: `${list.join('\n')}\n\nBrief: ${String(message || '').slice(0, 200)}`,
  };
}

module.exports = { runSocialPipeline };
