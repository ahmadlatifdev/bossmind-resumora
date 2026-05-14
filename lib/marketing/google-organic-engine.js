/**
 * Google-facing organic marketing asset generator (free-organic-first).
 * Produces structured JSON for SEO articles, keywords, internal links, schema hints, and landing outlines.
 * Does not call Google APIs — wire Search Console / GA4 / Business Profile in workers with OAuth separately.
 *
 * Ecosystem orchestration: `npm run bossmind:organic:growth` (see `config/bossmind-organic-growth-registry.json`
 * and `docs/BOSSMIND_GOOGLE_ORGANIC_GROWTH_ARCHITECTURE.md`).
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { initializeSharedMemory, saveEvent } = require("../shared/neon-memory");
const { getSiteUrl } = require("./seo-config");

const PROJECT_KEY = process.env.BOSSMIND_PROJECT_KEY || "resumora";

function hash(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function isoWeekId(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function loadPolicy() {
  const p = path.join(process.cwd(), "config", "resumora-organic-marketing.json");
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    /* ignore */
  }
  return { googleOrganic: { enabled: true } };
}

const SERVICE_SLUGS = [
  "ats-resume",
  "executive-resume",
  "cover-letter",
  "linkedin-optimization",
  "interview-preparation",
];

function buildArticleOutlines(weekId, lang) {
  const siteUrl = getSiteUrl();
  const seed = hash(`${weekId}|google-organic|${lang}`);
  const topics =
    lang === "fr"
      ? [
          "CV ATS : signaux recruteurs et hiérarchie premium",
          "Parcours bilingue EN/FR pour cadres en mobilité",
          "Lettre de motivation direction : preuve vs promesse",
        ]
      : [
          "ATS resume signals recruiters actually read",
          "Bilingual EN/FR delivery for global leadership roles",
          "Executive cover letters: proof density over buzzwords",
        ];
  return topics.map((title, i) => ({
    slugSuggestion: `insights/${weekId.toLowerCase()}-${lang}-${i + 1}-${seed.slice(0, 6)}`,
    title,
    targetKeywords:
      lang === "fr"
        ? ["CV ATS", "cadres internationaux", "Resumora", "optimisation LinkedIn"]
        : ["ATS resume", "executive resume", "Resumora", "LinkedIn optimization"],
    metaDescription: `${title.slice(0, 120)} — ${siteUrl.replace("https://", "")} luxury studio delivery.`,
    internalLinksTo: [
      `${siteUrl}/pricing`,
      `${siteUrl}/contact`,
      `${siteUrl}/solutions/${SERVICE_SLUGS[i % SERVICE_SLUGS.length]}`,
    ],
    schema: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      inLanguage: lang === "fr" ? "fr-FR" : "en-US",
      publisher: { "@type": "Organization", name: "Resumora", url: siteUrl },
    },
    discover: {
      note: "Strong H1, dated freshness line, E-E-A-T author block, navy/gold restraint; avoid clickbait.",
      featuredSnippet: {
        pattern:
          lang === "fr"
            ? "Question courte en H2 + réponse directe en 2–3 phrases (sans promesse médicale/juridique)."
            : "Concise question-style H2 + direct answer in 2–3 sentences (no medical/legal guarantees).",
        answerLead: title.length > 110 ? `${title.slice(0, 107)}…` : title,
      },
      longTailExpansion:
        lang === "fr"
          ? [
              `${title} · cadres internationaux`,
              `${title} · livraison bilingue EN/FR`,
              `${title} · dossier compatible ATS`,
            ]
          : [
              `${title} · executive hiring committees`,
              `${title} · bilingual EN/FR delivery`,
              `${title} · ATS-safe collateral`,
            ],
      googleDiscoverHygiene:
        "Large credible hero (≥1200px wide source where possible), HTTPS, stable branding, avoid sensational thumbnails.",
      duplicateGuard:
        "Slug keyed by weekId + lang + hash; do not duplicate canonical paths—editorial merge before publishing.",
    },
  }));
}

function buildKeywordClusters(weekId) {
  const seed = hash(`${weekId}|clusters`);
  return [
    { cluster: "executive_resume", phrases: ["executive resume writer", "résumé direction", "board-ready CV"], seed: seed.slice(0, 8) },
    { cluster: "ats", phrases: ["ATS friendly resume", "CV compatible ATS", "keyword scaffolding"], seed: seed.slice(8, 16) },
    { cluster: "linkedin", phrases: ["LinkedIn headline formula", "optimisation profil LinkedIn"], seed: seed.slice(16, 24) },
  ];
}

function buildLandingPageBriefs(weekId) {
  const siteUrl = getSiteUrl();
  return SERVICE_SLUGS.map((slug) => ({
    path: `/solutions/${slug}`,
    heroEyebrow: "Resumora Studio",
    ctaPrimary: `${siteUrl}/pricing`,
    structuredData: ["Service", "BreadcrumbList", "FAQPage"],
    mobile: { singleColumnFirst: true, touchTargetsMinPx: 44 },
    weekId,
  }));
}

function buildYouTubeOrganicOutline(weekId, lang) {
  const siteUrl = getSiteUrl();
  return {
    series: "Resumora Organic Insights",
    weekId,
    language: lang,
    title: lang === "fr" ? `Semaine ${weekId} · ATS & carrière internationale` : `Week ${weekId} · ATS & global career signal`,
    chapters: ["Hook 0:12", "Framework 0:45", "Proof 1:10", "CTA 1:35"],
    descriptionTemplate: `${siteUrl}/pricing — luxury resume & interview studio.`,
    tags: lang === "fr" ? ["CV", "ATS", "carrière"] : ["resume", "ATS", "career"],
  };
}

function buildSearchConsoleWorkflow(weekId) {
  const origin = getSiteUrl();
  return {
    weekId,
    steps: [
      `Submit sitemap in GSC: ${origin}/sitemap.xml`,
      `Confirm robots.txt: ${origin}/robots.txt`,
      "Export coverage + queries CSV from Search Console (manual or API).",
      "Map queries to SERVICE_SLUGS and /pricing intents.",
      "Patch meta titles/descriptions only on approved routes (protected surface).",
      "Re-run npm run build + deploy gate before production.",
    ],
    apiNote: "Use official googleapis Search Console API with OAuth refresh token stored in Railway secret (not in repo).",
  };
}

function buildGoogleBusinessChecklist() {
  return {
    enabledWhenConnected: Boolean(process.env.GOOGLE_BUSINESS_LOCATION_ID),
    tasks: [
      "Apply attribute targets in `config/resumora-google-business-profile-checklist.json` (v3+): appointments, estimates, virtual, appointment-required, EN/FR, coaching, global online.",
      "Run `npm run resumora:gbp:audit` after site deploy; optional `--persist-neon` for event_log.",
      "Weekly post mirroring social caption (EN or FR variant).",
      "Services list aligned with /pricing tiers and /solutions/*.",
      "UTM on website link: ?utm_source=gmb&utm_medium=organic",
    ],
  };
}

async function generateGoogleOrganicBundle({ weekId = isoWeekId() } = {}) {
  const policy = loadPolicy();
  if (policy.googleOrganic && policy.googleOrganic.enabled === false) {
    return { weekId, enabled: false, generatedAt: new Date().toISOString() };
  }
  const seedHex = hash(`${PROJECT_KEY}|${weekId}|google-organic-v1`);
  const siteUrl = getSiteUrl();
  return {
    projectKey: PROJECT_KEY,
    generatedAt: new Date().toISOString(),
    weekId,
    enabled: true,
    siteUrl,
    seedFingerprint: seedHex.slice(0, 16),
    articles: {
      en: buildArticleOutlines(weekId, "en"),
      fr: buildArticleOutlines(weekId, "fr"),
    },
    keywordClusters: buildKeywordClusters(weekId),
    landingPages: buildLandingPageBriefs(weekId),
    youtube: {
      en: buildYouTubeOrganicOutline(weekId, "en"),
      fr: buildYouTubeOrganicOutline(weekId, "fr"),
    },
    searchConsole: buildSearchConsoleWorkflow(weekId),
    googleBusiness: buildGoogleBusinessChecklist(),
    media: {
      imageBriefs: [
        { ratio: "1.91:1", use: "Open Graph / Discover", palette: "navy-gold", textSafeArea: "center 60%" },
        { ratio: "1:1", use: "Social feed", palette: "navy-gold" },
        { ratio: "9:16", use: "Shorts preview", palette: "navy-gold" },
      ],
      videoBriefs: [
        { durationSec: 45, format: "vertical", captions: true, ctaEndCard: `${siteUrl}/pricing` },
      ],
    },
    policy: {
      duplicatePrevention: "Content keyed by weekId + lang + slug hash; rotate pillars weekly.",
      compliance: "No medical/legal guarantees; service marketing only; align with Stripe product truth.",
    },
  };
}

async function persistGoogleOrganicBundle(bundle) {
  const init = await initializeSharedMemory();
  if (!init.enabled) return { persisted: false, reason: init.reason };
  await saveEvent({
    projectKey: PROJECT_KEY,
    eventType: "google_organic.bundle_generated",
    severity: "info",
    source: "google-organic-engine",
    eventKey: bundle.weekId,
    payload: {
      weekId: bundle.weekId,
      articleCount: (bundle.articles?.en?.length || 0) + (bundle.articles?.fr?.length || 0),
    },
  });
  return { persisted: true };
}

module.exports = {
  isoWeekId,
  generateGoogleOrganicBundle,
  persistGoogleOrganicBundle,
};
