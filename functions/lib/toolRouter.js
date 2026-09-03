/**
 * Lightweight tool router for BossMind harness tasks.
 * Selects skill / hermes / gemini without printing secrets.
 */
const { runResumeAnalysis } = require('./skills/resume-analysis');
const { runMarketSentiment } = require('./skills/market-sentiment');
const { runVideoScriptGen } = require('./skills/video-script-gen');

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * @returns {'skill:resume-analysis'|'skill:market-sentiment'|'skill:video-script-gen'|'hermes'|'gemini'|'policy'}
 */
function routeTool({ message, projectId, taskType }) {
  const hay = normalize(message);
  const hinted = String(taskType || '').toLowerCase();
  const pid = String(projectId || 'resumora').toLowerCase();

  if (hinted === 'resume' || /resume|cv|cover letter|lettre|carta/.test(hay)) {
    return 'skill:resume-analysis';
  }
  if (
    hinted === 'market' ||
    pid === 'global-stock' ||
    /stock|ticker|sentiment|market|bourse|mercado/.test(hay)
  ) {
    return 'skill:market-sentiment';
  }
  if (
    hinted === 'video' ||
    pid === 'ai-video' ||
    pid === 'tiktok-ai' ||
    /video|script|tiktok|reel|short/.test(hay)
  ) {
    return 'skill:video-script-gen';
  }
  if (hinted === 'gemini') return 'gemini';
  if (hinted === 'policy') return 'policy';
  return 'hermes';
}

function runSkill(route, opts) {
  if (route === 'skill:resume-analysis') return runResumeAnalysis(opts);
  if (route === 'skill:market-sentiment') return runMarketSentiment(opts);
  if (route === 'skill:video-script-gen') return runVideoScriptGen(opts);
  return null;
}

module.exports = { routeTool, runSkill };
