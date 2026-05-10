/**
 * Organic social draft JSON for cron / platform APIs (secrets in CI only).
 * Static messaging aligned with the enterprise homepage — no rotating weekly bundle.
 *
 * Usage: node scripts/marketing/generate-social-drafts.mjs [--lang=en|fr]
 */

const langArg = process.argv.find((a) => a.startsWith("--lang="));
const lang = langArg?.split("=")[1] === "fr" ? "fr" : "en";

const bundles = {
  en: {
    weekId: "static",
    siteUrl: "https://resumora.net",
    theme: {
      headline: "Institutional-grade career collateral for leaders operating under scrutiny.",
      kicker: "Executive resume studio",
      lead: "ATS-safe dossiers, bilingual EN/FR delivery, and concierge pacing.",
    },
    hashtags: ["#Resumora", "#ExecutiveResume", "#ATS", "#Career"],
  },
  fr: {
    weekId: "static",
    siteUrl: "https://resumora.net",
    theme: {
      headline: "Dossiers carrière de niveau institutionnel pour cadres sous contrainte.",
      kicker: "Studio CV direction",
      lead: "Livrables compatibles ATS, livraison bilingue EN/FR et cadence concierge.",
    },
    hashtags: ["#Resumora", "#CVExecutif", "#ATS", "#Carrière"],
  },
};

const bundle = bundles[lang];
const url = bundle.siteUrl;
const variation = `${bundle.weekId}-${lang}`;

const platforms = ["facebook", "instagram", "tiktok", "youtube_shorts", "linkedin", "pinterest", "twitter"];

const primaryLine =
  lang === "fr"
    ? `${bundle.theme.headline} — cadence concierge, livrables EN/FR. ${url}`
    : `${bundle.theme.headline} — concierge cadence, EN/FR delivery. ${url}`;

const posts = platforms.map((platform, i) => ({
  platform,
  variationKey: `${variation}-${platform}-${i}`,
  caption: `${primaryLine}\n\n${bundle.theme.lead}\n\nCTA: ${lang === "fr" ? "Réservez sur" : "Book at"} ${url}/pricing`,
  hashtags: bundle.hashtags,
  link: `${url}/pricing`,
  videoBrief:
    lang === "fr"
      ? `Plan vertical 15–30s : logo Resumora, texte « ${bundle.theme.kicker} », CTA tarifs, fin ${url}`
      : `Vertical 15–30s: Resumora logo, title "${bundle.theme.kicker}", pricing CTA, end card ${url}`,
}));

process.stdout.write(JSON.stringify({ generatedAt: new Date().toISOString(), weekId: bundle.weekId, lang, posts }, null, 2));
process.stdout.write("\n");
