/**
 * Weekly rotating organic marketing bundle for BossMind + Resumora.
 * Deterministic variation per ISO week id — avoids duplicate templates without AI.
 * Optional DeepSeek V3 enrichment via enrichWeeklyBundleWithDeepSeek().
 */

const crypto = require("crypto");
const { chatCompletions, MODELS } = require("../ai/deepseek");
const { initializeSharedMemory, saveEvent } = require("../shared/neon-memory");

const SITE = "https://resumora.net";
const STRIPE_CTA = `${SITE}/pricing`;

const THEME_ROTATION = [
  {
    en: {
      kicker: "Executive mandate clarity",
      headline: "Institutional résumés that survive ATS and committee scrutiny.",
      lead: "Concierge cadence, bilingual EN/FR artefacts, Stripe-secured tiers.",
    },
    fr: {
      kicker: "Clarté de mandat direction",
      headline: "CV institutionnels qui survivent ATS et lecture comité.",
      lead: "Cadence concierge, livrables EN/FR, paliers sécurisés Stripe.",
    },
  },
  {
    en: {
      kicker: "Outcome density",
      headline: "Proof stacks calibrated for hyperscale and regulated hiring desks.",
      lead: "ATS-safe exports, revision SLAs, direct escalation when velocity matters.",
    },
    fr: {
      kicker: "Densité de résultats",
      headline: "Preuves calibrées pour viviers tech et secteurs réglementés.",
      lead: "Exports ATS-safe, SLA de révision, escalade quand la vélocité compte.",
    },
  },
  {
    en: {
      kicker: "Bilingual boards",
      headline: "One coherent storyline across EN and FR search corridors.",
      lead: "TLS pairs, LinkedIn relaunch, interview rehearsal aligned to your dossier.",
    },
    fr: {
      kicker: "Comités bilingues",
      headline: "Une narration cohérente sur les corridors EN et FR.",
      lead: "Paires TLS, relance LinkedIn, préparation entretien alignée au dossier.",
    },
  },
];

function hashSeed(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function pickIdx(len, seedHex) {
  return parseInt(seedHex.slice(0, 8), 16) % len;
}

function isoWeekId(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  const y = date.getUTCFullYear();
  return `${y}-W${String(weekNo).padStart(2, "0")}`;
}

function buildSocialPosts(themeEn, themeFr, weekId, _seed) {
  const hookEn = `${themeEn.headline} ${STRIPE_CTA}`;
  const hookFr = `${themeFr.headline} ${STRIPE_CTA}`;
  const common = {
    link: SITE,
    stripeCta: STRIPE_CTA,
    utm: `utm_source=organic&utm_medium=social&utm_campaign=${weekId}`,
  };
  return {
    facebook: { en: { primary: hookEn, cta: "Book on resumora.net" }, fr: { primary: hookFr, cta: "Réserver sur resumora.net" }, ...common },
    instagram: {
      en: { caption: `${themeEn.kicker}\n${themeEn.lead}\n${STRIPE_CTA}`, hashtags: ["#Resumora", "#ExecutiveResume", "#ATS", `#${weekId}`] },
      fr: { caption: `${themeFr.kicker}\n${themeFr.lead}\n${STRIPE_CTA}`, hashtags: ["#Resumora", "#CVExecutif", "#ATS", `#${weekId}`] },
      ...common,
    },
    tiktok: {
      en: { hook: themeEn.kicker, scriptBeat: `Vertical 15–30s · logo · KPI title · ${STRIPE_CTA}`, soundPrompt: "minimal orchestral sting" },
      fr: { hook: themeFr.kicker, scriptBeat: `Vertical 15–30s · logo · titre KPI · ${STRIPE_CTA}`, soundPrompt: "sting orchestral minimal" },
      ...common,
    },
    youtube: {
      en: { title: `Resumora · ${themeEn.kicker} · ${weekId}`, description: `${themeEn.lead}\n${SITE}\n${STRIPE_CTA}`, shortsOutline: ["cold open", "proof", "stripe CTA"] },
      fr: { title: `Resumora · ${themeFr.kicker} · ${weekId}`, description: `${themeFr.lead}\n${SITE}\n${STRIPE_CTA}`, shortsOutline: ["accroche", "preuve", "CTA Stripe"] },
      ...common,
    },
    linkedin: {
      en: { longFormLead: themeEn.lead, authorityLine: `${SITE} · Enterprise resume studio`, cta: STRIPE_CTA },
      fr: { longFormLead: themeFr.lead, authorityLine: `${SITE} · Studio CV entreprise`, cta: STRIPE_CTA },
      ...common,
    },
    pinterest: {
      en: { pinTitle: `${themeEn.kicker} — ATS-grade dossiers`, pinCopy: themeEn.headline, landing: SITE },
      fr: { pinTitle: `${themeFr.kicker} — dossiers ATS`, pinCopy: themeFr.headline, landing: SITE },
      ...common,
    },
    x: {
      en: { tweet: `${themeEn.headline.slice(0, 200)} ${STRIPE_CTA}`.trim() },
      fr: { tweet: `${themeFr.headline.slice(0, 200)} ${STRIPE_CTA}`.trim() },
      ...common,
    },
  };
}

function buildLuxuryPhotoBriefs(themeEn, themeFr, seed) {
  const idx = pickIdx(3, seed);
  const moods = [
    { moodEn: "Graphite marble, soft gold rim light", moodFr: "Marbre graphite, liseré or doux" },
    { moodEn: "Navy velvet, brushed brass letterforms", moodFr: "Velours marine, lettrage laiton brossé" },
    { moodEn: "Glass desk, dawn gradient, serif restraint", moodFr: "Bureau verre, aube en dégradé, serif sobre" },
  ];
  const m = moods[idx];
  return [
    {
      id: "hero_lux_01",
      promptEn: `Luxury editorial photograph: executive workspace, ${m.moodEn}, Resumora wordmark subtle, no clutter, 8k`,
      promptFr: `Photo éditoriale luxe : espace de travail cadre, ${m.moodFr}, logo Resumora discret`,
      usage: "Paid social / Pinterest hero",
    },
    {
      id: "stripe_cta_card",
      promptEn: `Minimal card UI mock: Stripe checkout path to ${STRIPE_CTA}, gold on navy`,
      promptFr: `Mock carte UI minimal : parcours Stripe vers ${STRIPE_CTA}, or sur marine`,
      usage: "Remarketing static",
    },
  ];
}

function buildVideoBriefs(themeEn, themeFr, _weekId) {
  return [
    {
      id: "short_vertical_primary",
      aspect: "9:16",
      durationSec: 22,
      en: { beats: [`Hook: ${themeEn.kicker}`, "Logo resolve", `Body: ${themeEn.lead.slice(0, 80)}...`, `End: ${STRIPE_CTA}`] },
      fr: { beats: [`Accroche : ${themeFr.kicker}`, "Logo", `Corps : ${themeFr.lead.slice(0, 80)}...`, `Fin : ${STRIPE_CTA}`] },
    },
    {
      id: "youtube_shorts_proof",
      aspect: "9:16",
      durationSec: 35,
      en: { beats: ["Problem: invisible accomplishments", "Solve: ATS stack + storyline", `CTA ${STRIPE_CTA}`] },
      fr: { beats: ["Problème : réalisations invisibles", "Solution : ATS + storyline", `CTA ${STRIPE_CTA}`] },
    },
  ];
}

function buildGoogleMarketing(themeEn, themeFr, weekId, seed) {
  const kw = [
    "executive career optimization",
    "ATS resume optimization",
    "bilingual resume EN FR",
    "stripe resume pricing",
    "institutional career dossier",
  ];
  const kwFr = [
    "service CV cadre",
    "optimisation CV ATS",
    "CV bilingue anglais français",
    "tarifs CV Stripe",
    "dossier carrière institutionnel",
  ];
  const variant = pickIdx(5, seed.slice(8));
  return {
    indexing: {
      canonicalHome: SITE,
      sitemapNote: "Expose /solutions/* and /pricing with hreflang en-fr pairs in metadata.",
      structuredData: ["Organization", "Service", "WebSite"],
    },
    landingPageIdeas: [
      {
        slugSuggestion: `weekly-${weekId.toLowerCase()}`,
        en: { title: `${themeEn.kicker} | Resumora`, meta: themeEn.headline, h1: themeEn.headline },
        fr: { title: `${themeFr.kicker} | Resumora`, meta: themeFr.headline, h1: themeFr.headline },
      },
    ],
    keywordTargets: { en: kw, fr: kwFr, primaryThisWeek: { en: kw[variant], fr: kwFr[variant] } },
    rsaAdCopy: {
      en: {
        headlines: [themeEn.kicker, "ATS-grade dossiers", "EN/FR delivery", "Stripe checkout"],
        descriptions: [themeEn.lead, `Book at ${STRIPE_CTA}`],
      },
      fr: {
        headlines: [themeFr.kicker, "Dossiers ATS", "Livraison EN/FR", "Paiement Stripe"],
        descriptions: [themeFr.lead, `Réserver : ${STRIPE_CTA}`],
      },
    },
  };
}

function buildWeeklyOrganicBundle(weekId = isoWeekId()) {
  const seed = hashSeed(`${weekId}|resumora|v2`);
  const ti = pickIdx(THEME_ROTATION.length, seed);
  const themeEn = THEME_ROTATION[ti].en;
  const themeFr = THEME_ROTATION[ti].fr;

  const bundle = {
    brand: "Resumora",
    siteUrl: SITE,
    weekId,
    generatedAt: new Date().toISOString(),
    bundleHash: seed.slice(0, 16),
    languages: ["en", "fr"],
    themes: { en: themeEn, fr: themeFr },
    marketingCore: {
      en: { ...themeEn, primaryCtaUrl: STRIPE_CTA, secondaryCtaUrl: `${SITE}/contact` },
      fr: { ...themeFr, primaryCtaUrl: STRIPE_CTA, secondaryCtaUrl: `${SITE}/contact` },
    },
    socialPosts: buildSocialPosts(themeEn, themeFr, weekId, seed),
    luxuryPhotoBriefs: buildLuxuryPhotoBriefs(themeEn, themeFr, seed),
    videoBriefs: buildVideoBriefs(themeEn, themeFr, weekId),
    seoMarketingText: {
      en: {
        title: `${themeEn.kicker} · Executive resume studio · Resumora`,
        metaDescription: `${themeEn.headline} ${themeEn.lead}`.slice(0, 158),
        h1: themeEn.headline,
        body: [themeEn.lead, `Secure tiers: ${STRIPE_CTA}`],
      },
      fr: {
        title: `${themeFr.kicker} · Studio CV · Resumora`,
        metaDescription: `${themeFr.headline} ${themeFr.lead}`.slice(0, 158),
        h1: themeFr.headline,
        body: [themeFr.lead, `Paliers sécurisés : ${STRIPE_CTA}`],
      },
    },
    ctaCampaigns: {
      stripeCheckout: STRIPE_CTA,
      conciergeChat: `${SITE}/chat`,
      register: `${SITE}/register`,
      login: `${SITE}/login`,
    },
    googleMarketing: buildGoogleMarketing(themeEn, themeFr, weekId, seed),
    publishingNotes: {
      scheduleUtc: ["Mon 12:30", "Wed 15:00", "Fri 09:15"],
      rotationRule: "Never repeat identical caption twice — vary hook using weekId + theme index.",
    },
  };

  return bundle;
}

async function enrichWeeklyBundleWithDeepSeek(bundle) {
  if (!process.env.DEEPSEEK_API_KEY) return { ...bundle, aiEnrichment: null };
  const prompt = [
    "You are Resumora luxury marketing AI.",
    "Given JSON themes, write TWO alternate EN hooks (single sentences) and TWO FR hooks.",
    "Must include resumora.net and Stripe path /pricing once.",
    "Return JSON only: {\"en\":[\"\",\"\"],\"fr\":[\"\",\"\"]}",
    JSON.stringify(bundle.themes),
  ].join("\n");

  const r = await chatCompletions({
    model: MODELS.v3,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 400,
    temperature: 0.85,
  });
  if (!r.ok) return { ...bundle, aiEnrichment: { ok: false, error: r.error } };
  let parsed = null;
  try {
    parsed = JSON.parse(r.text.replace(/^```json\s*/i, "").replace(/```$/m, ""));
  } catch {
    parsed = { raw: r.text };
  }
  return { ...bundle, aiEnrichment: { ok: true, alternateHooks: parsed } };
}

async function persistWeeklyBundleEvent(bundle) {
  await initializeSharedMemory();
  await saveEvent({
    projectKey: "resumora",
    eventType: "marketing.weekly_bundle.generated",
    severity: "info",
    source: "weekly-organic-pipeline",
    eventKey: bundle.weekId,
    payload: {
      weekId: bundle.weekId,
      bundleHash: bundle.bundleHash,
      siteUrl: bundle.siteUrl,
      languages: bundle.languages,
    },
  });
}

module.exports = {
  buildWeeklyOrganicBundle,
  enrichWeeklyBundleWithDeepSeek,
  isoWeekId,
  persistWeeklyBundleEvent,
};
