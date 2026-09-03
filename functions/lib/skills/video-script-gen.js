/**
 * Skill: short video script outline (EN/FR/ES). Avoid "AI" wording in client copy.
 */
function runVideoScriptGen({ message, lang }) {
  const code = String(lang || 'en').slice(0, 2);
  const frames = {
    en: ['Hook (0–3s)', 'Problem (3–10s)', 'Product proof (10–20s)', 'CTA to resumora.net'],
    fr: ['Accroche (0–3s)', 'Problème (3–10s)', 'Preuve produit (10–20s)', 'CTA vers resumora.net'],
    es: ['Gancho (0–3s)', 'Problema (3–10s)', 'Prueba del producto (10–20s)', 'CTA a resumora.net'],
  };
  const list = frames[code] || frames.en;
  return {
    skill: 'video-script-gen',
    reply:
      list.map((l, i) => `${i + 1}. ${l}`).join('\n') +
      `\n\nBrief: ${String(message || '').slice(0, 200)}`,
  };
}

module.exports = { runVideoScriptGen };
