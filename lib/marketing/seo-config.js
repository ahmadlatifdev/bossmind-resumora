/**
 * Central SEO / discovery config for Resumora (policy-safe, no spam routes).
 * Canonical host: env override for staging; production default resumora.net.
 */

const { withBrandingQuery } = require("./branding-assets");

const DEFAULT_SITE_URL = "https://resumora.net";

function normalizeSiteUrl(raw) {
  const s = (raw || DEFAULT_SITE_URL).replace(/\/$/, "");
  if (!/^https:\/\//i.test(s)) return DEFAULT_SITE_URL;
  return s;
}

function getSiteUrl() {
  return normalizeSiteUrl(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_BOSSMIND_PUBLIC_ORIGIN ||
      process.env.BOSSMIND_PUBLIC_ORIGIN
  );
}

/** Public marketing paths only (no auth, no ops, no webhooks). */
const SITEMAP_PATHS = [
  { path: "/", changefreq: "weekly", priority: 1 },
  { path: "/services", changefreq: "weekly", priority: 0.95 },
  { path: "/pricing", changefreq: "weekly", priority: 0.95 },
  { path: "/capabilities", changefreq: "weekly", priority: 0.9 },
  { path: "/delivery-protocols", changefreq: "monthly", priority: 0.85 },
  { path: "/testimonials", changefreq: "monthly", priority: 0.9 },
  { path: "/contact", changefreq: "monthly", priority: 0.88 },
  { path: "/about", changefreq: "monthly", priority: 0.82 },
  { path: "/client-engagement", changefreq: "monthly", priority: 0.8 },
  { path: "/free-test", changefreq: "monthly", priority: 0.85 },
  { path: "/chat", changefreq: "monthly", priority: 0.78 },
  { path: "/support", changefreq: "monthly", priority: 0.75 },
  { path: "/cancel", changefreq: "yearly", priority: 0.35 },
  { path: "/privacy", changefreq: "yearly", priority: 0.45 },
  { path: "/terms", changefreq: "yearly", priority: 0.45 },
  { path: "/refund", changefreq: "yearly", priority: 0.45 },
  { path: "/system-policy", changefreq: "yearly", priority: 0.4 },
];

const SOLUTION_SLUGS = [
  "ats-resume",
  "executive-resume",
  "cover-letter",
  "linkedin-optimization",
  "interview-preparation",
];

function allSitemapEntries() {
  const base = [...SITEMAP_PATHS];
  for (const slug of SOLUTION_SLUGS) {
    base.push({
      path: `/solutions/${slug}`,
      changefreq: "weekly",
      priority: 0.88,
    });
  }
  return base;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSitemapXml() {
  const site = getSiteUrl();
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = allSitemapEntries();
  const body = urls
    .map((u) => {
      const loc = escapeXml(`${site}${u.path}`);
      const pr = Number(u.priority).toFixed(2);
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${pr}</priority>
    <xhtml:link rel="alternate" hreflang="en" href="${loc}" />
    <xhtml:link rel="alternate" hreflang="fr" href="${loc}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}" />
  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${body}
</urlset>`;
}

function buildRobotsTxt() {
  const site = getSiteUrl();
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /dashboard",
    "Disallow: /login",
    "Disallow: /register",
    "Disallow: /success",
    "Disallow: /runtime-sync",
    "",
    `Sitemap: ${site}/sitemap.xml`,
    "",
  ].join("\n");
}

function organizationJsonLd() {
  const site = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${site}/#organization`,
        name: "Resumora",
        alternateName: ["Resumora Premium Career Studio"],
        url: site,
        logo: {
          "@type": "ImageObject",
          "@id": `${site}/#logo`,
          url: `${site}${withBrandingQuery("/resumora-logo.png")}`,
          caption: "Resumora official wordmark — RESUMORA",
        },
        sameAs: [],
        description:
          "Executive resume and career collateral studio — ATS-safe delivery, bilingual EN/FR, concierge cadence.",
      },
      {
        "@type": "WebSite",
        "@id": `${site}/#website`,
        url: site,
        name: "Resumora",
        publisher: { "@id": `${site}/#organization` },
        inLanguage: ["en-US", "fr-FR"],
      },
    ],
  };
}

module.exports = {
  getSiteUrl,
  allSitemapEntries,
  buildSitemapXml,
  buildRobotsTxt,
  organizationJsonLd,
  SOLUTION_SLUGS,
};
