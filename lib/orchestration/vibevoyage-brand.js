/**
 * VibeVoyage brand kit — single source for dashboard API, DeepSeek context, publish manifest.
 * Override tagline/mission via env without editing JSON when needed.
 */
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "../../config/vibevoyage-brand.json");

const FALLBACK = {
  project: { name: "VibeVoyage", slug: "vibevoyage", bossmindProjectKey: "ai-video-generator" },
  brand: {
    tagline: "Cinematic Adventures Around the World",
    mission:
      "Global cinematic adventure media: organic distribution, indexing, and growth — no paid ads.",
    voice: "cinematic, adventurous, premium",
    visualTheme: "dark cinematic luxury",
  },
  channel: {
    primaryIdentity: "AI-powered cinematic adventures and global stories.",
    primaryContent: ["cinematic adventures", "reels and shorts", "multilingual content"],
  },
  multilingual: {
    languages: [
      { code: "en", label: "English" },
      { code: "ar", label: "Arabic" },
      { code: "fr", label: "French" },
      { code: "es", label: "Spanish" },
      { code: "de", label: "German" },
      { code: "ru", label: "Russian" },
      { code: "sq", label: "Albanian" },
    ],
    autoFields: ["titles", "descriptions", "subtitles", "hashtags", "tags", "pinned_comments", "ctas"],
  },
  distribution: {
    organicOnly: true,
    organicPlatforms: [
      "youtube",
      "youtube_shorts",
      "tiktok",
      "instagram_reels",
      "facebook_reels",
      "pinterest",
      "linkedin",
      "x",
      "threads",
      "vimeo",
      "dailymotion",
    ],
  },
  google: { marketingServices: ["Search Console", "video sitemap", "VideoObject schema", "RSS"] },
  automation: { stack: ["BossMind", "DeepSeek", "n8n", "Neon", "FFmpeg", "Railway", "Render", "Sentry"] },
  dashboard: { title: "VibeVoyage Master Dashboard", path: "/bossmind-ai-video" },
};

let cached;

function loadBrand() {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    cached = JSON.parse(raw);
    return cached;
  } catch {
    cached = FALLBACK;
    return cached;
  }
}

function tagline() {
  return (process.env.BOSSMIND_AI_VIDEO_TAGLINE || loadBrand().brand?.tagline || FALLBACK.brand.tagline).trim();
}

function mission() {
  return (process.env.BOSSMIND_AI_VIDEO_MISSION || loadBrand().brand?.mission || FALLBACK.brand.mission).trim();
}

/** Compact object for dashboard + health JSON. */
function getBrandSummary() {
  const b = loadBrand();
  return {
    projectName: b.project?.name || "VibeVoyage",
    slug: b.project?.slug || "vibevoyage",
    tagline: tagline(),
    mission: mission(),
    voice: b.brand?.voice || FALLBACK.brand.voice,
    visualTheme: b.brand?.visualTheme || FALLBACK.brand.visualTheme,
    primaryIdentity: b.channel?.primaryIdentity || FALLBACK.channel.primaryIdentity,
    primaryContent: Array.isArray(b.channel?.primaryContent) ? b.channel.primaryContent : FALLBACK.channel.primaryContent,
    languages: b.multilingual?.languages || FALLBACK.multilingual.languages,
    multilingualFields: b.multilingual?.autoFields || FALLBACK.multilingual.autoFields,
    organicPlatforms: b.distribution?.organicPlatforms || FALLBACK.distribution.organicPlatforms,
    organicOnly: Boolean(b.distribution?.organicOnly),
    googleMarketing: b.google?.marketingServices || FALLBACK.google.marketingServices,
    automationStack: b.automation?.stack || FALLBACK.automation.stack,
    dashboardTitle: b.dashboard?.title || FALLBACK.dashboard.title,
    configPath: "config/vibevoyage-brand.json",
  };
}

/** Short paragraph for LLM scenario generation (kept bounded). */
function getScenarioBrandContext(channelLabel) {
  const b = loadBrand();
  const content = (b.channel?.primaryContent || []).slice(0, 6).join("; ");
  return [
    `Brand: ${channelLabel}.`,
    `Tagline: ${tagline()}.`,
    `Mission (summary): ${mission().slice(0, 400)}`,
    `Identity: ${(b.channel?.primaryIdentity || "").slice(0, 350)}`,
    `Content pillars: ${content}.`,
    `Visual direction: ${b.brand?.visualTheme || ""}.`,
    "Every scene should feel cinematic, globally adventurous, and platform-safe (no shock spam, no deceptive hooks).",
  ].join(" ");
}

/** Payload merged into publish webhook manifest for n8n (titles, descriptions, hashtags per platform). */
function getPublishBrandBundle(channelLabel) {
  const s = getBrandSummary();
  return {
    projectName: s.projectName,
    channelName: channelLabel,
    tagline: s.tagline,
    mission: s.mission,
    voice: s.voice,
    organicOnly: s.organicOnly,
    targetLanguages: (s.languages || []).map((l) => l.code),
    organicPlatforms: s.organicPlatforms,
    googleMarketing: s.googleMarketing,
  };
}

module.exports = {
  loadBrand,
  getBrandSummary,
  getScenarioBrandContext,
  getPublishBrandBundle,
  tagline,
  mission,
};
