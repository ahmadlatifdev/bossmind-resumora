/**
 * Policy-safe discovery checklist + URL inventory (no external API calls).
 * Live indexing, rankings, and social visibility require platform credentials and dashboards.
 */

const { getSiteUrl, allSitemapEntries, organizationJsonLd } = require("./seo-config");

function buildTrafficDiscoveryHints() {
  const siteUrl = getSiteUrl();
  const entries = allSitemapEntries();
  return {
    siteUrl,
    sitemapUrl: `${siteUrl}/sitemap.xml`,
    robotsUrl: `${siteUrl}/robots.txt`,
    publicUrlCount: entries.length,
    hreflangNote:
      "Sitemap emits en/fr/x-default alternates on the same public URLs; UI locale toggle does not fork canonical paths.",
    orchestration:
      "Weekly organic bundle: npm run bossmind:organic:growth (registry + Neon event_log). Global confirm: npm run bossmind:global:production-confirm.",
    schemaSummary: organizationJsonLd(),
    cannotAutoConfirmFromRepo: [
      "Search Console coverage and query performance",
      "GA4 property receiving production traffic",
      "Per-platform post visibility (Meta, LinkedIn, Pinterest, TikTok, YouTube)",
      "Actual SERP positions by region",
    ],
  };
}

module.exports = { buildTrafficDiscoveryHints };
