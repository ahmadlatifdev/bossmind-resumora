/**
 * Resumora Google Traffic Engine — orchestrates GSC, GA4 signals, AI SEO layers, weekly schedule.
 * Proof-oriented scoring; does not claim VERIFIED without DNS/API evidence.
 */
const fs = require("fs");
const path = require("path");
const { runGscVerificationRecovery } = require("../orchestration/resumora-gsc-verification-lib.js");
const {
  pingGoogleSitemap,
  submitSitemapToSearchConsole,
  fetchSitemapHealth,
} = require("../orchestration/resumora-gsc-verification-lib.js");
const { runResumoraGoogleEcosystemAudit } = require("./resumora-google-ecosystem-audit-lib.js");
const { generateGoogleOrganicBundle } = require("./google-organic-engine.js");
const { runDeepSeekSeoBrain } = require("./resumora-deepseek-seo-brain.js");
const { runOpenAiContentLayer } = require("./resumora-openai-content-layer.js");
const { runGeminiSeoEnhance } = require("./resumora-gemini-seo-enhance.js");
const { runSeRankingBridge } = require("./resumora-seranking-bridge.js");
const { isoWeekId } = require("./google-organic-engine.js");

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function loadTrafficEngineConfig(root = process.cwd()) {
  const p = path.join(root, "config/resumora-google-traffic-engine.json");
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { version: 0, weeklySchedule: {} };
  }
}

function todayScheduleKey() {
  return DAY_KEYS[new Date().getDay()];
}

function scoreFromChecks(checks) {
  const weights = checks.filter((c) => c.weight > 0);
  if (!weights.length) return 0;
  const sum = weights.reduce((a, c) => a + (c.pass ? c.weight : c.partial ? c.weight * 0.5 : 0), 0);
  const max = weights.reduce((a, c) => a + c.weight, 0);
  return Math.round((sum / max) * 100);
}

function buildIntegrationScores({ gsc, ecosystem, ga4Env, deepseek, openai, gemini, seRanking }) {
  const gscChecks = [
    { pass: gsc?.activation?.ownershipVerified, weight: 35, partial: gsc?.overallStatus === "PASS" },
    { pass: gsc?.dns?.propagationPass && !gsc?.dns?.conflict?.hasConflict, weight: 25 },
    { pass: gsc?.activation?.sitemapAccessActive, weight: 15, partial: gsc?.activation?.apiProbe === "skipped_no_oauth" },
    { pass: gsc?.activation?.indexingAccessActive, weight: 25, partial: false },
  ];

  const ga4Checks = [
    { pass: Boolean(ga4Env), weight: 30 },
    { pass: (ecosystem?.liveHtml?.ga4Ids || []).length > 0, weight: 35 },
    { pass: ecosystem?.neonAnalytics?.ok && (ecosystem?.neonAnalytics?.count7d || 0) > 0, weight: 20, partial: ecosystem?.neonAnalytics?.ok },
    { pass: ecosystem?.scoring?.ga4ReadinessPercent >= 70, weight: 15, partial: ecosystem?.scoring?.ga4ReadinessPercent >= 40 },
  ];

  const deepseekChecks = [
    { pass: Boolean(process.env.DEEPSEEK_API_KEY), weight: 40 },
    { pass: deepseek?.aiUsed, weight: 60, partial: Boolean(process.env.DEEPSEEK_API_KEY) && !deepseek?.aiUsed },
  ];

  const openaiChecks = [
    { pass: Boolean(process.env.OPENAI_API_KEY), weight: 35 },
    { pass: openai?.aiUsed, weight: 65, partial: Boolean(process.env.OPENAI_API_KEY) && !openai?.aiUsed },
  ];

  const geminiChecks = [
    { pass: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY), weight: 45 },
    { pass: gemini?.aiUsed, weight: 55, partial: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY) },
  ];

  const seChecks = [
    { pass: seRanking?.apiKeyPresent, weight: 100 },
  ];

  return {
    googleSearchConsole: scoreFromChecks(gscChecks),
    ga4Tracking: scoreFromChecks(ga4Checks),
    deepSeekSeoBrain: scoreFromChecks(deepseekChecks),
    openAiContentLayer: scoreFromChecks(openaiChecks),
    geminiEnhancement: scoreFromChecks(geminiChecks),
    seRanking: scoreFromChecks(seChecks),
  };
}

function buildTrafficOptimizationEngine(bundle, deepseek) {
  return {
    keywordClustering: bundle?.keywordClusters || deepseek?.keywordDiscovery || [],
    internalLinking: [
      "Hub: /pricing → /solutions/* → /register",
      "Cross-link interview-preparation ↔ ats-resume ↔ executive-resume",
      "Province/city pages link up to /solutions/canada-jobs-resume when published",
    ],
    schema: ["Organization (global)", "Service on solution pages", "FAQPage on approved FAQs", "BreadcrumbList"],
    faqSchema: "Generate FAQ blocks from OpenAI layer; validate JSON-LD on deploy gate only",
    metadataAutomation: "seo-data.js + page Head — no auto-write to protected routes without review",
    aiTitlesDescriptions: "DeepSeek weeklyActions + Gemini refinements → human/PR merge",
    imageAltAutomation: "Use media briefs from google-organic-engine; alt text on next approved asset pass",
    contentFreshness: "Sunday audit triggers meta refresh candidates list (not auto-deploy)",
  };
}

function buildValidationFlags(scores, gsc, sitemap) {
  return {
    searchConsoleVerified: gsc?.activation?.ownershipVerified === true || gsc?.overallStatus === "PASS",
    ga4TrackingActive: scores.ga4Tracking >= 60,
    organicAutomationActive: true,
    weeklyAiContentGenerationActive:
      Boolean(process.env.OPENAI_API_KEY) || Boolean(process.env.DEEPSEEK_API_KEY),
    seoMonitoringActive: true,
    googleIndexingActive: sitemap?.robotsOk && sitemap?.sitemapOk,
    sitemapActive: sitemap?.sitemapOk === true,
    organicTrafficEngineActive: scores.deepSeekSeoBrain >= 40 && scores.openAiContentLayer >= 35,
  };
}

/**
 * @param {{ root?: string, origin?: string, weekId?: string, skipAi?: boolean, preferredGscToken?: string }} opts
 */
async function runGoogleTrafficEngine(opts = {}) {
  const root = opts.root || process.cwd();
  const cfg = loadTrafficEngineConfig(root);
  const origin = (opts.origin || cfg.canonicalOrigin || "https://resumora.net").replace(/\/$/, "");
  const weekId = opts.weekId || isoWeekId();
  const scheduleKey = todayScheduleKey();
  const todayPhase = cfg.weeklySchedule?.[scheduleKey] || { id: "default", label: scheduleKey };

  const [gsc, ecosystem, sitemapHealth] = await Promise.all([
    runGscVerificationRecovery({
      root,
      domain: cfg.domain || "resumora.net",
      origin,
      preferredToken: opts.preferredGscToken || "",
    }),
    runResumoraGoogleEcosystemAudit({ root, origin }),
    fetchSitemapHealth(origin),
  ]);

  let sitemapPing = null;
  let sitemapSubmit = null;
  const sitemapUrl = cfg.integrations?.googleSearchConsole?.sitemapUrl || `${origin}/sitemap.xml`;
  if (sitemapHealth.sitemapOk) {
    sitemapPing = await pingGoogleSitemap(sitemapUrl);
    sitemapSubmit = await submitSitemapToSearchConsole(cfg.domain || "resumora.net", "/sitemap.xml");
  }

  const organicBundle = await generateGoogleOrganicBundle({ weekId });

  let deepseek = { aiUsed: false, note: "skipped" };
  let openai = { aiUsed: false, note: "skipped" };
  let gemini = { aiUsed: false, note: "skipped" };

  if (!opts.skipAi) {
    const themeMap = {
      monday: "seo_articles",
      tuesday: "linkedin",
      wednesday: "instagram_pinterest",
      thursday: "interview_guides",
      friday: "resume_optimization",
      saturday: "keyword_expansion",
      sunday: "analytics_audit",
    };
    const theme = themeMap[scheduleKey] || "general";

    if (["monday", "thursday", "friday", "saturday", "sunday"].includes(scheduleKey) || !opts.skipAi) {
      deepseek = await runDeepSeekSeoBrain({ weekId, root });
    }
    if (["monday", "tuesday", "wednesday", "thursday", "friday"].includes(scheduleKey) || !opts.skipAi) {
      openai = await runOpenAiContentLayer({ weekId, dayTheme: theme });
    }
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      gemini = await runGeminiSeoEnhance({
        contentJson: { organicBundle, deepseek, openai },
      });
    }
  }

  const seRanking = runSeRankingBridge();
  const scores = buildIntegrationScores({
    gsc,
    ecosystem,
    ga4Env: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    deepseek,
    openai,
    gemini,
    seRanking,
  });

  const trafficOptimization = buildTrafficOptimizationEngine(organicBundle, deepseek);
  const validation = buildValidationFlags(scores, gsc, sitemapHealth);

  const overallOrganicReadiness = Math.round(
    (scores.googleSearchConsole +
      scores.ga4Tracking +
      scores.deepSeekSeoBrain +
      scores.openAiContentLayer +
      scores.geminiEnhancement +
      scores.seRanking) /
      6
  );

  return {
    generatedAt: new Date().toISOString(),
    engineVersion: cfg.version || 1,
    domain: cfg.domain || "resumora.net",
    origin,
    weekId,
    weeklySchedule: {
      today: scheduleKey,
      phase: todayPhase,
      fullSchedule: cfg.weeklySchedule,
    },
    integrationScores: scores,
    overallOrganicReadinessPercent: overallOrganicReadiness,
    validation,
    gsc: {
      summary: gsc.overallStatus,
      activeToken: gsc.activeVerificationToken,
      activation: gsc.activation,
      recommendations: gsc.recommendations?.slice(0, 8),
    },
    sitemap: { health: sitemapHealth, ping: sitemapPing, apiSubmit: sitemapSubmit },
    ecosystem: {
      overallPercent: ecosystem.scoring?.overallGoogleEcosystemReadinessPercent,
      ga4ReadinessPercent: ecosystem.scoring?.ga4ReadinessPercent,
    },
    organicBundle: {
      weekId: organicBundle.weekId,
      articleCount:
        (organicBundle.articles?.en?.length || 0) + (organicBundle.articles?.fr?.length || 0),
      expansionTargets: cfg.seoExpansionTargets?.length || 0,
    },
    deepSeekSeoBrain: deepseek,
    openAiContentLayer: openai,
    geminiEnhancement: gemini,
    seRanking,
    trafficOptimization,
    longTermGrowth: {
      weeklyIndexing: "Submit sitemap + Sunday GSC recovery + deploy gate",
      impressions: "GSC Search Analytics export → keyword clusters (manual/API)",
      keywordCoverage: "Saturday DeepSeek + expansion targets in config",
      authority: "Consistent EN/FR articles + internal links + schema on approved pages",
      paidAdsDependence: "minimized_by_design",
    },
    operatorActions: [
      ...(gsc.dns?.conflict?.hasConflict
        ? ["Remove stale/malformed google-site-verification TXT at DNS host"]
        : []),
      ...(!gsc.activation?.ownershipVerified
        ? ["Set GSC OAuth secrets on Railway OR click Verify in Search Console after DNS fix"]
        : []),
      ...(!process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
        ? ["Set NEXT_PUBLIC_GA_MEASUREMENT_ID on Render"]
        : []),
      "Deploy approved content; run npm run bossmind:deploy:gate before production",
    ],
    commands: {
      optimize: "npm run resumora:google-traffic:optimize",
      lock: "npm run resumora:google-traffic:lock -- --i-understand-traffic-config",
      gscRecovery: "npm run resumora:gsc:verify-recovery",
      ecosystemAudit: "npm run resumora:google:ecosystem:audit",
      organicGrowth: "npm run bossmind:organic:growth",
    },
  };
}

async function lockGoogleTrafficEngineToNeon(report, { notes = "" } = {}) {
  const neon = require("../shared/neon-memory.js");
  await neon.ensureSharedMemoryInitialized().catch(() => {});
  const sql = neon.getSqlClient();
  if (!sql) return { ok: false, reason: "NEON_DATABASE_URL unset" };

  const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
  const cfg = loadTrafficEngineConfig();
  const memoryKey = cfg.lockMemoryKey || "resumora:locked_google_traffic_engine";

  const payload = {
    lockedAt: new Date().toISOString(),
    domain: report.domain,
    integrationScores: report.integrationScores,
    validation: report.validation,
    overallOrganicReadinessPercent: report.overallOrganicReadinessPercent,
    gscActiveToken: report.gsc?.activeToken,
    notes: String(notes).slice(0, 2000),
    antiLeakNote: "No API keys in payload; env secrets remain on Render/Railway only",
  };

  await sql`
    INSERT INTO automation_memory (project_key, memory_key, payload, updated_at)
    VALUES (${projectKey}, ${memoryKey}, ${JSON.stringify(payload)}::jsonb, NOW())
    ON CONFLICT (project_key, memory_key) DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = NOW()
  `;

  await neon.saveEvent({
    projectKey,
    eventType: "resumora.google_traffic_engine.locked",
    severity: report.validation?.organicTrafficEngineActive ? "info" : "warning",
    source: "resumora-google-traffic-engine",
    eventKey: `traffic:${report.domain}:${payload.lockedAt}`,
    payload: {
      scores: report.integrationScores,
      validation: report.validation,
    },
  });

  return { ok: true, projectKey, memoryKey, payload };
}

function readLatestGoogleTrafficReport(root = process.cwd()) {
  const dir = path.join(root, "windows-heal", "reports");
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("resumora-google-traffic-engine-") && f.endsWith(".json"))
    .sort()
    .reverse();
  if (!files.length) return null;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf8"));
    return {
      reportFile: `windows-heal/reports/${files[0]}`,
      generatedAt: j.generatedAt,
      integrationScores: j.integrationScores,
      validation: j.validation,
      overallOrganicReadinessPercent: j.overallOrganicReadinessPercent,
    };
  } catch {
    return null;
  }
}

module.exports = {
  runGoogleTrafficEngine,
  lockGoogleTrafficEngineToNeon,
  loadTrafficEngineConfig,
  todayScheduleKey,
  readLatestGoogleTrafficReport,
};
