/**
 * Skill: project-health — summarize harness registry (async; needs db).
 */
async function runProjectHealth({ db, snapshot, lang }) {
  const { listMasterProjects } = require('../projectRegistry');
  const out = await listMasterProjects(db, snapshot);
  const code = String(lang || 'en').slice(0, 2);
  const header = {
    en: 'BossMind project health (harness registry)',
    fr: 'Santé des projets BossMind (registre)',
    es: 'Salud de proyectos BossMind (registro)',
  };
  const lines = (out.projects || []).map((p) => {
    const hs = p.healthScore != null ? `${Math.round(p.healthScore)}%` : 'n/a';
    const live = p.live ? 'live' : 'catalog';
    return `- ${p.name} (${p.projectId}): status=${p.status}, health=${hs}, mode=${live}`;
  });
  const avg =
    out.averageHealth != null
      ? `Average health: ${out.averageHealth}`
      : 'Average health: n/a (Resumora score drives live metric)';
  return {
    skill: 'project-health',
    reply: `${header[code] || header.en}\n${avg}\nGenerated: ${out.generatedAt}\n${lines.join('\n')}`,
  };
}

/**
 * Boolean readiness of AI providers from env (never returns secret values).
 */
function runToolInventory({ lang }) {
  const code = String(lang || 'en').slice(0, 2);
  const present = (name) => Boolean(String(process.env[name] || '').trim());
  const rows = [
    ['Gemini', present('GEMINI_API_KEY')],
    ['DeepSeek', present('DEEPSEEK_API_KEY')],
    ['Hermes gateway (HERMES_API_URL)', present('HERMES_API_URL')],
    ['Hermes server key', present('HERMES_API_SERVER_KEY') || present('API_SERVER_KEY')],
    ['Stripe', present('STRIPE_SECRET_KEY') || present('STRIPE_API_KEY')],
    ['Resend email', present('RESEND_API_KEY')],
    ['OpenAI', present('OPENAI_API_KEY')],
    ['ElevenLabs', present('ELEVENLABS_API_KEY')],
    ['Alpha Vantage', present('ALPHA_VANTAGE_KEY')],
    ['Veo / Google video SA', present('VEO_SERVICE_ACCOUNT_KEY')],
  ];
  const title = {
    en: 'AI / tool readiness (key names only — present/absent)',
    fr: 'Disponibilité outils IA (noms de clés seulement)',
    es: 'Disponibilidad de herramientas IA (solo nombres de claves)',
  };
  const lines = rows.map(([label, ok]) => `- ${label}: ${ok ? 'ready' : 'missing'}`);
  return {
    skill: 'tool-inventory',
    reply: `${title[code] || title.en}\n${lines.join('\n')}`,
  };
}

module.exports = { runProjectHealth, runToolInventory };
