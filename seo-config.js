/**
 * Resumora SEO Configuration
 * Single source of truth for production canonical domain.
 *
 * CANONICAL AUTHORITY: https://resumora.net
 *
 * All metadata, OG tags, canonical links, sitemaps, and social
 * cards must resolve through getSiteUrl() — never reference
 * onrender.com or localhost in production output.
 *
 * Usage:
 *   import { getSiteUrl } from "@/lib/marketing/seo-config";
 *   const siteUrl = getSiteUrl(); // always "https://resumora.net" in production
 */

/** The one true production domain. Never changes. */
const CANONICAL_DOMAIN = "https://resumora.net";

/**
 * Domains that are infrastructure internals and must never appear
 * in canonical tags, OG URLs, or sitemap entries.
 */
const INTERNAL_DOMAINS = [
  "onrender.com",
  "localhost",
  "127.0.0.1",
  "render.com",
];

/**
 * Returns the canonical site URL for use in metadata, OG tags,
 * canonical links, and sitemaps.
 *
 * Priority:
 *   1. NEXT_PUBLIC_SITE_URL env var (must be "https://resumora.net" in Render)
 *   2. CANONICAL_DOMAIN constant ("https://resumora.net")
 *
 * If NEXT_PUBLIC_SITE_URL is set but contains an internal domain
 * (e.g. onrender.com, localhost), it is ignored and the canonical
 * domain is used instead. This prevents misconfigured env vars from
 * leaking infrastructure URLs into public metadata.
 */
export function getSiteUrl() {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (envUrl) {
    const trimmed = envUrl.trim().replace(/\/$/, "");
    const isInternal = INTERNAL_DOMAINS.some((d) => trimmed.includes(d));
    if (!isInternal && trimmed.startsWith("https://")) {
      return trimmed;
    }
    // env var is set but unsafe — fall through to canonical constant
  }

  return CANONICAL_DOMAIN;
}

/**
 * Returns the full canonical URL for a given path.
 * Always uses resumora.net. Path should start with "/".
 *
 * @example
 *   canonicalUrl("/pricing") // "https://resumora.net/pricing"
 *   canonicalUrl("/")        // "https://resumora.net/"
 */
export function canonicalUrl(path = "/") {
  const base = getSiteUrl();
  const normalPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalPath}`;
}

/**
 * Returns an absolute URL for a brand asset (OG image, logo, etc).
 * Ensures the asset URL uses the canonical domain, not Render internals.
 *
 * @param {string} _unusedBase  - Ignored. Kept for backwards-compat with
 *                                existing callers: brandAbsoluteUrl(siteUrl, path)
 * @param {string} assetPath    - e.g. "/og-resumora-brand.png"
 */
export function brandAbsoluteUrl(_unusedBase, assetPath) {
  const base = getSiteUrl();
  const normalPath = assetPath.startsWith("/") ? assetPath : `/${assetPath}`;
  return `${base}${normalPath}`;
}

/**
 * Returns canonical hreflang alternate links for EN/FR pages.
 * Used in <Head> for multilingual SEO.
 *
 * @param {string} path  - e.g. "/" or "/pricing"
 */
export function hreflangLinks(path = "/") {
  const base = getSiteUrl();
  const normalPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${base}${normalPath}`;
  return [
    { hrefLang: "en",        href: url },
    { hrefLang: "fr",        href: url },
    { hrefLang: "x-default", href: url },
  ];
}

/** Structured data (JSON-LD) base for the organization. */
export const ORGANIZATION_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Resumora",
  url: CANONICAL_DOMAIN,
  logo: `${CANONICAL_DOMAIN}/og-resumora-brand.png`,
  contactPoint: {
    "@type": "ContactPoint",
    email: "support@resumora.net",
    contactType: "customer support",
    availableLanguage: ["English", "French"],
  },
};
