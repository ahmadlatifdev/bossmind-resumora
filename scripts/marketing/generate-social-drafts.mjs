/**
 * Daily organic social drafts from the same weekly bundle as the homepage.
 * Outputs JSON to stdout — wire to cron + platform APIs with secrets in CI only.
 *
 * Usage: node scripts/marketing/generate-social-drafts.mjs [--lang=en|fr]
 */
import { getWeeklyBundle } from "../../lib/marketing/weekly-content.js";

const langArg = process.argv.find((a) => a.startsWith("--lang="));
const lang = langArg?.split("=")[1] === "fr" ? "fr" : "en";

const bundle = getWeeklyBundle(lang);
const url = bundle.siteUrl || "https://resumora.net";
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
