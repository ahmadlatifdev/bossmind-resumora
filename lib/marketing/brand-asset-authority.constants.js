/**
 * Browser-safe brand logo constants — import from ResumoraLogo and client bundles.
 */

/** Public URL — only approved official social wordmark. */
const BRAND_LOGO_SRC = "/brand/resumora-logo-official.png";

/** Repo-relative locked file (never replace without approval + re-seal). */
const BRAND_LOGO_PUBLIC_FILE = "public/brand/resumora-logo-official.png";

const BRAND_LOGO_ALT = "Resumora — RESUMORA wordmark";

const BRAND_LOGO_LEGACY_ALIASES = [
  "/resumora-logo.png",
  "/resumora-logo.svg",
  "/brand/resumora-logo-original.png",
];

const BRAND_LOGO_FORBIDDEN_PATTERNS = [
  "resumora-logo-original.png",
  "resumora-logo.svg",
  "logo-draft",
  "logo-mockup",
  "logo-generated",
  "placeholder-logo",
  "fake-logo",
  "temp-logo",
];

const BRAND_LOGO_VARIANTS = {
  sidebar: {
    width: 315,
    height: 72,
    className: "rs-logo rs-logo-sidebar rs-logo--protected",
    sizes: "(max-width: 1024px) 240px, 315px",
  },
  topbar: {
    width: 200,
    height: 46,
    className: "rs-logo rs-logo-topbar rs-logo--protected",
    sizes: "200px",
  },
  minimal: {
    width: 160,
    height: 37,
    className: "rs-logo rs-logo-minimal rs-logo--protected",
    sizes: "160px",
  },
  footer: {
    width: 140,
    height: 32,
    className: "rs-logo rs-logo-footer rs-logo--protected",
    sizes: "140px",
  },
  social: {
    width: 200,
    height: 46,
    className: "rs-logo rs-logo--protected",
    sizes: "200px",
  },
};

module.exports = {
  BRAND_LOGO_SRC,
  BRAND_LOGO_PUBLIC_FILE,
  BRAND_LOGO_ALT,
  BRAND_LOGO_LEGACY_ALIASES,
  BRAND_LOGO_FORBIDDEN_PATTERNS,
  BRAND_LOGO_VARIANTS,
};
