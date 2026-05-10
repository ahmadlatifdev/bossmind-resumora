const crypto = require("crypto");
const {
  getSqlClient,
  initializeSharedMemory,
  saveEvent,
  upsertErrorMemory,
  upsertTaskState,
} = require("../shared/neon-memory");

const PROJECT_KEY = process.env.BOSSMIND_PROJECT_KEY || "resumora";
const SITE_URL = "https://resumora.net";

const PLATFORM_CONFIG = {
  facebook: { objective: "community_growth", format: "feed+reels", baseWindowsUtc: ["Mon 13:00", "Thu 18:00"] },
  instagram: { objective: "luxury_branding", format: "reels+stories", baseWindowsUtc: ["Tue 16:00", "Fri 14:00"] },
  tiktok: { objective: "viral_reach", format: "short_vertical", baseWindowsUtc: ["Tue 17:30", "Sat 15:00"] },
  youtube: { objective: "long_form_authority", format: "long+shorts", baseWindowsUtc: ["Wed 17:00", "Sun 14:00"] },
  linkedin: { objective: "lead_generation", format: "carousel+thought_leadership", baseWindowsUtc: ["Tue 12:00", "Thu 12:00"] },
  pinterest: { objective: "evergreen_seo", format: "pins+idea_pins", baseWindowsUtc: ["Mon 15:00", "Sat 11:00"] },
  x: { objective: "trending_visibility", format: "thread+short_posts", baseWindowsUtc: ["Wed 13:00", "Fri 19:00"] },
  threads: { objective: "organic_interaction", format: "conversational_threads", baseWindowsUtc: ["Tue 15:00", "Thu 16:30"] },
};

const CONTENT_PILLARS = [
  "resume_optimization_tips",
  "ats_resume_content",
  "linkedin_optimization",
  "career_coaching_reels",
  "interview_preparation_videos",
  "hr_recruiter_insights",
  "before_after_transformations",
  "motivational_career_content",
  "professional_success_tips",
  "employment_market_updates",
];

const CTA_LIBRARY = {
  en: ["Book Resume Review", "Upgrade Resume", "Contact Resumora", "Apply Now", "Start Your Career Upgrade"],
  fr: [
    "Réserver une revue de CV",
    "Améliorer votre CV",
    "Contacter Resumora",
    "Postuler maintenant",
    "Démarrer votre upgrade carrière",
  ],
};

function isoWeekId(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function hash(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function pick(arr, seedHex, offset = 0) {
  if (!arr.length) return null;
  const n = parseInt(seedHex.slice(offset, offset + 8), 16);
  return arr[n % arr.length];
}

function buildHook({ platform, pillar, lang, trendKeywords, seedHex }) {
  const prefix =
    lang === "fr"
      ? "Cadres en transition: "
      : "Career leaders under review: ";
  const trend = trendKeywords.length ? ` ${trendKeywords[0]}` : "";
  const pillarLabel = pillar.replaceAll("_", " ");
  const hook =
    lang === "fr"
      ? `${prefix}${pillarLabel} orienté résultat.${trend}`
      : `${prefix}${pillarLabel} engineered for recruiter signal.${trend}`;
  return hook.slice(0, 190 + (seedHex.charCodeAt(0) % 30));
}

function buildCaption({ platform, pillar, lang, cta, hook, weekId }) {
  const bodyCoreEn =
    "Luxury ATS-safe strategy, EN/FR ready, optimized for conversions and executive positioning.";
  const bodyCoreFr =
    "Stratégie ATS premium, livrables EN/FR, optimisée pour conversion et positionnement direction.";
  const body = lang === "fr" ? bodyCoreFr : bodyCoreEn;
  const ctaLine = lang === "fr" ? `${cta} → ${SITE_URL}/pricing` : `${cta} → ${SITE_URL}/pricing`;
  const platformHint = {
    facebook: lang === "fr" ? "Question du jour en commentaire." : "Comment your biggest CV blocker.",
    instagram: lang === "fr" ? "Sauvegardez ce reel pour votre prochain update." : "Save this reel for your next resume sprint.",
    tiktok: lang === "fr" ? "Répondez en duo avec votre objectif carrière." : "Reply with your current target role.",
    youtube: lang === "fr" ? "Version complète + checklist en description." : "Full breakdown + checklist in description.",
    linkedin: lang === "fr" ? "DM 'AUDIT' pour une revue de profil." : "DM 'AUDIT' for profile review workflow.",
    pinterest: lang === "fr" ? "Épinglez pour votre prochaine refonte CV." : "Pin for your next resume refresh.",
    x: lang === "fr" ? "Thread ci-dessous avec étapes actionnables." : "Thread below with actionable checkpoints.",
    threads: lang === "fr" ? "Dites votre étape actuelle, je vous réponds." : "Drop your stage and I'll map the next step.",
  }[platform];
  return `${hook}\n\n${body}\n${platformHint}\n\n${ctaLine}\n#Resumora #ATS #CareerUpgrade #${weekId.replace("-", "")}`;
}

function buildAssetBrief({ platform, pillar, lang, weekId }) {
  const overlay = lang === "fr" ? "Resumora • Upgrade carrière" : "Resumora • Career Upgrade";
  return {
    aspect: platform === "youtube" ? ["16:9", "9:16"] : ["9:16", "1:1"],
    subtitles: true,
    watermark: "/public/resumora-logo.png",
    mobileFirst: true,
    overlayText: overlay,
    productionNote: `Generate ${platform} asset for ${pillar} (${weekId}) with premium navy-gold visual restraint.`,
  };
}

function buildHashtags({ platform, lang, pillar }) {
  const base = lang === "fr" ? ["#Resumora", "#CV", "#ATS", "#Carriere"] : ["#Resumora", "#Resume", "#ATS", "#Career"];
  const byPillar = {
    resume_optimization_tips: ["#ResumeTips", "#CareerGrowth"],
    ats_resume_content: ["#ATSResume", "#Hiring"],
    linkedin_optimization: ["#LinkedIn", "#PersonalBrand"],
    career_coaching_reels: ["#CareerCoaching", "#Leadership"],
    interview_preparation_videos: ["#InterviewPrep", "#JobSearch"],
    hr_recruiter_insights: ["#RecruiterTips", "#HiringManager"],
    before_after_transformations: ["#BeforeAfter", "#ResumeMakeover"],
    motivational_career_content: ["#CareerMotivation", "#GrowthMindset"],
    professional_success_tips: ["#ProfessionalDevelopment", "#CareerSuccess"],
    employment_market_updates: ["#JobMarket", "#WorkTrends"],
  };
  const platformTag = {
    facebook: "#Facebook",
    instagram: "#InstagramReels",
    tiktok: "#TikTokCareers",
    youtube: "#YouTubeShorts",
    linkedin: "#LinkedInTips",
    pinterest: "#PinterestSEO",
    x: "#CareerX",
    threads: "#ThreadsCommunity",
  }[platform];
  return [...base, ...(byPillar[pillar] || []), platformTag];
}

function engagementPredictionScore({ platform, pillar, trendStrength }) {
  const platformWeight = {
    tiktok: 1.25,
    instagram: 1.18,
    youtube: 1.15,
    linkedin: 1.1,
    x: 1.08,
    threads: 1.05,
    facebook: 1.02,
    pinterest: 0.98,
  }[platform];
  const pillarWeight = {
    before_after_transformations: 1.2,
    interview_preparation_videos: 1.15,
    ats_resume_content: 1.12,
    linkedin_optimization: 1.1,
    resume_optimization_tips: 1.08,
    hr_recruiter_insights: 1.07,
    career_coaching_reels: 1.05,
    professional_success_tips: 1.03,
    motivational_career_content: 1.01,
    employment_market_updates: 0.99,
  }[pillar];
  const raw = 62 * platformWeight * pillarWeight + trendStrength * 15;
  return Math.max(1, Math.min(99, Math.round(raw)));
}

async function inferOptimalWindows(defaultWindows, platform) {
  const sql = getSqlClient();
  if (!sql) return defaultWindows;
  try {
    const rows = await sql(
      `SELECT
         EXTRACT(DOW FROM created_at)::int AS dow,
         EXTRACT(HOUR FROM created_at)::int AS hour,
         AVG(COALESCE((payload->>'engagementRate')::numeric, 0)) AS avg_rate
       FROM event_log
       WHERE project_key = $1
         AND event_type = 'social_channel_metric'
         AND source = $2
       GROUP BY 1,2
       ORDER BY avg_rate DESC
       LIMIT 2`,
      [PROJECT_KEY, platform]
    );
    if (!rows.length) return defaultWindows;
    const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return rows.map((r) => `${dow[r.dow] || "Tue"} ${String(r.hour).padStart(2, "0")}:00`);
  } catch {
    return defaultWindows;
  }
}

function normalizeTrendSignals(trendSignals = []) {
  if (!Array.isArray(trendSignals)) return { keywords: [], strength: 0 };
  const keywords = trendSignals
    .map((t) => String(t?.keyword || t || "").trim())
    .filter(Boolean)
    .slice(0, 8);
  const strength = Math.max(
    0,
    Math.min(
      1,
      trendSignals.reduce((s, t) => s + Number(t?.score || 0), 0) / Math.max(1, trendSignals.length * 100)
    )
  );
  return { keywords, strength };
}

async function generateUnifiedGrowthBundle({ weekId = isoWeekId(), trendSignals = [] } = {}) {
  const seedHex = hash(`${PROJECT_KEY}|${weekId}|social-growth-v1`);
  const trend = normalizeTrendSignals(trendSignals);
  const queue = [];
  for (const platform of Object.keys(PLATFORM_CONFIG)) {
    const cfg = PLATFORM_CONFIG[platform];
    const windows = await inferOptimalWindows(cfg.baseWindowsUtc, platform);
    const pillar = pick(CONTENT_PILLARS, seedHex, platform.length);
    for (const lang of ["en", "fr"]) {
      const cta = pick(CTA_LIBRARY[lang], seedHex, lang === "fr" ? 12 : 4);
      const hook = buildHook({ platform, pillar, lang, trendKeywords: trend.keywords, seedHex });
      queue.push({
        id: hash(`${weekId}|${platform}|${lang}|${pillar}`).slice(0, 18),
        weekId,
        platform,
        language: lang,
        objective: cfg.objective,
        pillar,
        hook,
        caption: buildCaption({ platform, pillar, lang, cta, hook, weekId }),
        hashtags: buildHashtags({ platform, lang, pillar }),
        cta,
        urls: {
          pricing: `${SITE_URL}/pricing`,
          contact: `${SITE_URL}/contact`,
          register: `${SITE_URL}/register`,
        },
        assetBrief: buildAssetBrief({ platform, pillar, lang, weekId }),
        publishWindowsUtc: windows,
        predictionScore: engagementPredictionScore({
          platform,
          pillar,
          trendStrength: trend.strength,
        }),
      });
    }
  }
  return {
    projectKey: PROJECT_KEY,
    generatedAt: new Date().toISOString(),
    weekId,
    trendSignals: trend,
    queue,
    notes: {
      antiLeak: "No UI mutation. Automation-only bundle.",
      bilingual: true,
      monetizationReadiness: "CTA paths include /pricing, /contact, /register",
      safety: "Publishing requires platform webhooks + token configuration.",
    },
  };
}

async function persistGrowthBundle(bundle) {
  const init = await initializeSharedMemory();
  if (!init.enabled) return { persisted: false, reason: init.reason };
  await upsertTaskState({
    projectKey: PROJECT_KEY,
    taskKey: `social:growth:${bundle.weekId}`,
    status: "completed",
    assignedAgent: "social-growth-engine",
    payload: {
      queueSize: bundle.queue.length,
      generatedAt: bundle.generatedAt,
    },
  });
  await saveEvent({
    projectKey: PROJECT_KEY,
    eventType: "social_growth.bundle_generated",
    severity: "info",
    source: "social-growth-engine",
    eventKey: bundle.weekId,
    payload: {
      weekId: bundle.weekId,
      queueSize: bundle.queue.length,
      topPredictions: bundle.queue
        .slice()
        .sort((a, b) => b.predictionScore - a.predictionScore)
        .slice(0, 6)
        .map((q) => ({ platform: q.platform, language: q.language, score: q.predictionScore })),
    },
  });
  return { persisted: true };
}

async function dispatchToPlatform(item, { dryRun = false } = {}) {
  const webhook = process.env[`SOCIAL_WEBHOOK_${item.platform.toUpperCase()}`];
  const token = process.env.SOCIAL_AUTOMATION_TOKEN || "";
  if (!webhook) {
    return { ok: false, skipped: true, reason: "missing_webhook" };
  }
  if (dryRun) {
    return { ok: true, dryRun: true };
  }
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(item),
    });
    if (!res.ok) {
      return { ok: false, skipped: false, reason: `http_${res.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, skipped: false, reason: error.message || "dispatch_failed" };
  }
}

async function runAutopublish(bundle, { dryRun = false } = {}) {
  const publishResults = [];
  for (const item of bundle.queue) {
    const result = await dispatchToPlatform(item, { dryRun });
    publishResults.push({
      id: item.id,
      platform: item.platform,
      language: item.language,
      ...result,
    });
    await saveEvent({
      projectKey: PROJECT_KEY,
      eventType: "social_growth.publish_attempt",
      severity: result.ok ? "info" : "warning",
      source: `publisher.${item.platform}`,
      eventKey: item.id,
      payload: {
        platform: item.platform,
        language: item.language,
        dryRun,
        result,
      },
    }).catch(() => {});
  }
  const failures = publishResults.filter((r) => !r.ok && !r.skipped);
  if (failures.length) {
    await upsertErrorMemory({
      projectKey: PROJECT_KEY,
      errorType: "social_publish_failure",
      errorMessage: failures.map((f) => `${f.platform}:${f.reason}`).join(" | ").slice(0, 900),
      rootCause: "Platform dispatcher returned non-ok response.",
      fixPattern: "Validate SOCIAL_WEBHOOK_<PLATFORM> and SOCIAL_AUTOMATION_TOKEN, then replay queue.",
    }).catch(() => {});
  }
  return publishResults;
}

module.exports = {
  CONTENT_PILLARS,
  PLATFORM_CONFIG,
  generateUnifiedGrowthBundle,
  isoWeekId,
  persistGrowthBundle,
  runAutopublish,
};
