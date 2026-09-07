/**
 * Lightweight tool router for BossMind harness tasks.
 * Selects skill / hermes / gemini without printing secrets.
 */
const { runResumeAnalysis } = require('./skills/resume-analysis');
const { runMarketSentiment } = require('./skills/market-sentiment');
const { runVideoScriptGen } = require('./skills/video-script-gen');
const { runRetrieveVideoAssets } = require('./skills/retrieve-video-assets');
const { runStockRiskGuard } = require('./skills/stock-risk-guard');
const { runSocialPipeline } = require('./skills/social-pipeline');
const { runEcommerceSync } = require('./skills/ecommerce-sync');
const { runToolInventory } = require('./skills/project-health');

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * @returns {string} route id
 */
function routeTool({ message, projectId, taskType }) {
  const hay = normalize(message);
  const hinted = String(taskType || '').toLowerCase();
  const pid = String(projectId || 'resumora').toLowerCase();

  if (
    hinted === 'tools' ||
    hinted === 'tool-inventory' ||
    /what ai tools|outils? (ia|ai)|herramientas|available to you|providers? configured/.test(hay)
  ) {
    return 'skill:tool-inventory';
  }

  if (
    hinted === 'health' ||
    hinted === 'project-health' ||
    /health status of all projects|sante (des )?projets|salud de (todos )?los proyectos|all projects.? health|show me the health/.test(
      hay
    )
  ) {
    return 'skill:project-health';
  }

  if (
    hinted === 'resume' ||
    hinted === 'resume-audit' ||
    /resume-?audit|resume|cv|cover letter|lettre|carta/.test(hay)
  ) {
    return 'skill:resume-analysis';
  }

  if (
    hinted === 'stock-risk' ||
    hinted === 'stock-risk-guard' ||
    /stop-?loss|risk guard|stock-risk/.test(hay)
  ) {
    return 'skill:stock-risk-guard';
  }

  if (
    hinted === 'market' ||
    pid === 'global-stock' ||
    /stock|ticker|sentiment|market|bourse|mercado/.test(hay)
  ) {
    return 'skill:market-sentiment';
  }

  if (
    hinted === 'social' ||
    hinted === 'social-pipeline' ||
    /social pipeline|youtube|tiktok|reel|short/.test(hay)
  ) {
    return 'skill:social-pipeline';
  }

  if (
    hinted === 'ecommerce' ||
    hinted === 'ecommerce-sync' ||
    pid === 'elegancyart' ||
    /e-?commerce|inventory|pricing analysis|create a test product|stripe checkout url/.test(hay)
  ) {
    return 'skill:ecommerce-sync';
  }

  // Video library / asset manager — MUST win over video-script-gen.
  if (
    hinted === 'video-assets' ||
    hinted === 'retrieve-video-assets' ||
    hinted === 'video-library' ||
    /video\s*library|manage\s+videos?|list\s+videos?|video\s+assets?|retrieve[- ]video|bucket\s+path|\blibrary\b/.test(
      hay
    )
  ) {
    return 'skill:retrieve-video-assets';
  }

  if (
    hinted === 'video' ||
    hinted === 'video-script' ||
    hinted === 'video-script-gen' ||
    pid === 'ai-video' ||
    pid === 'tiktok-ai' ||
    /video\s*script|script\s+(for\s+)?(a\s+)?video|outline.*(video|reel)/.test(hay) ||
    (/video/.test(hay) && /script|outline|hook|storyboard/.test(hay)) ||
    (/video/.test(hay) && !/library|manage|asset|catalog|bucket/.test(hay))
  ) {
    return 'skill:video-script-gen';
  }

  if (hinted === 'gemini') return 'gemini';
  if (hinted === 'policy') return 'policy';
  return 'hermes';
}

async function runSkill(route, opts) {
  if (route === 'skill:resume-analysis') return runResumeAnalysis(opts);
  if (route === 'skill:market-sentiment') return runMarketSentiment(opts);
  if (route === 'skill:retrieve-video-assets') return runRetrieveVideoAssets(opts);
  if (route === 'skill:video-script-gen') return runVideoScriptGen(opts);
  if (route === 'skill:stock-risk-guard') return runStockRiskGuard(opts);
  if (route === 'skill:social-pipeline') return runSocialPipeline(opts);
  if (route === 'skill:ecommerce-sync') return runEcommerceSync(opts);
  if (route === 'skill:tool-inventory') return runToolInventory(opts);
  return null;
}

module.exports = { routeTool, runSkill };
