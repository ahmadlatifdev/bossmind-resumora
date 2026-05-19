/**
 * Essential Advanced premium content integrity (EN/FR) — no secrets.
 */
const {
  getInterviewPrepCatalog,
  QA_BANK,
  SUCCESS_TIPS,
  VIDEO_MODULES,
  SIMULATION_SESSIONS,
  DOWNLOADS,
} = require("./interview-prep-content");
const { validateVideoManifest, listVideoModules } = require("./video-delivery");

const PLACEHOLDER_RE = /\b(TODO|lorem ipsum|placeholder|FIXME|xxx)\b/i;

function hasBilingualPair(obj, key = "text") {
  if (obj[key]) return Boolean(obj[key].en && obj[key].fr);
  return Boolean(obj.en && obj.fr);
}

function validateQaBank() {
  const issues = [];
  if (QA_BANK.length < 50) issues.push(`qa_count_low_${QA_BANK.length}`);
  const ids = new Set();
  for (const q of QA_BANK) {
    if (ids.has(q.id)) issues.push(`qa_duplicate_${q.id}`);
    ids.add(q.id);
    if (!hasBilingualPair(q, "q") || !hasBilingualPair(q, "a")) {
      issues.push(`qa_missing_bilingual_${q.id}`);
    }
    if (PLACEHOLDER_RE.test(q.q.en + q.q.fr + q.a.en + q.a.fr)) {
      issues.push(`qa_placeholder_${q.id}`);
    }
    if (!q.category) issues.push(`qa_no_category_${q.id}`);
  }
  return { ok: issues.length === 0, count: QA_BANK.length, issues };
}

function validateTips() {
  const issues = [];
  if (SUCCESS_TIPS.length < 20) issues.push(`tips_count_low_${SUCCESS_TIPS.length}`);
  for (const tip of SUCCESS_TIPS) {
    if (!hasBilingualPair(tip, "text")) issues.push(`tip_missing_bilingual_${tip.id}`);
    if (PLACEHOLDER_RE.test(tip.text.en + tip.text.fr)) issues.push(`tip_placeholder_${tip.id}`);
  }
  return { ok: issues.length === 0, count: SUCCESS_TIPS.length, issues };
}

function validateVideosManifest() {
  const manifest = validateVideoManifest();
  const modules = listVideoModules();
  const issues = [...(manifest.errors || [])];
  for (const v of modules) {
    if (!v.title?.en || !v.title?.fr) issues.push(`video_title_bilingual_${v.id}`);
    if (!v.summary?.en || !v.summary?.fr) issues.push(`video_summary_bilingual_${v.id}`);
  }
  return {
    ok: manifest.ok && issues.length === 0,
    count: modules.length,
    manifestHash: manifest.manifestHash,
    issues,
  };
}

function validateCatalogLang(lang) {
  const catalog = getInterviewPrepCatalog(lang);
  const issues = [];
  if (catalog.videos.length !== 3) issues.push(`videos_render_${lang}`);
  if (catalog.qaBank.length < 50) issues.push(`qa_render_${lang}`);
  if (catalog.tips.length < 20) issues.push(`tips_render_${lang}`);
  if (catalog.downloads.length < 4) issues.push(`downloads_render_${lang}`);
  return { ok: issues.length === 0, counts: catalog.counts, issues };
}

function runFullIntegrityAudit() {
  const qa = validateQaBank();
  const tips = validateTips();
  const videos = validateVideosManifest();
  const en = validateCatalogLang("en");
  const fr = validateCatalogLang("fr");
  const simulations = { ok: SIMULATION_SESSIONS.length === 3, count: SIMULATION_SESSIONS.length };
  const downloads = { ok: DOWNLOADS.length >= 4, count: DOWNLOADS.length };

  const dimensions = {
    videos: videos.ok ? 100 : 0,
    qa: qa.ok && qa.count >= 60 ? 100 : Math.round((qa.count / 60) * 100),
    tips: tips.ok && tips.count >= 20 ? 100 : Math.round((tips.count / 20) * 100),
    enCatalog: en.ok ? 100 : 0,
    frCatalog: fr.ok ? 100 : 0,
    simulations: simulations.ok ? 100 : 0,
    downloads: downloads.ok ? 100 : 0,
  };

  const overall = Math.round(Object.values(dimensions).reduce((a, b) => a + b, 0) / Object.keys(dimensions).length);

  return {
    ok: qa.ok && tips.ok && videos.ok && en.ok && fr.ok && simulations.ok && downloads.ok,
    overallPercent: overall,
    dimensions,
    qa,
    tips,
    videos,
    en,
    fr,
    simulations,
    downloads,
    assetKeys: getInterviewPrepCatalog("en").assetKeys.length,
  };
}

module.exports = {
  runFullIntegrityAudit,
  validateQaBank,
  validateTips,
  validateVideosManifest,
  validateCatalogLang,
};
