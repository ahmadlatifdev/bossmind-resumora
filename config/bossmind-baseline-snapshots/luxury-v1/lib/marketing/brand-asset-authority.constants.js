/**
 * Browser-safe brand logo constants — import from ResumoraLogo and client bundles.
 */

/** Public URL — only approved official social wordmark (JPG). */
const BRAND_LOGO_SRC = "/brand/resumora-logo-official.jpg";

/** Repo-relative locked file (never replace without approval + re-seal). */
const BRAND_LOGO_PUBLIC_FILE = "public/brand/resumora-logo-official.jpg";

const BRAND_LOGO_ALT = "Resumora — official luxury brand mark";

const BRAND_LOGO_LEGACY_ALIASES = [
  "/resumora-logo.png",
  "/resumora-logo.svg",
  "/brand/resumora-logo-original.png",
  "/brand/resumora-logo-official.png",
];

const BRAND_LOGO_FORBIDDEN_PATTERNS = [
  "resumora-logo-original.png",
  "resumora-logo-official.png",
  "resumora-logo.svg",
  "logo-draft",
  "logo-mockup",
  "logo-generated",
  "placeholder-logo",
  "fake-logo",
  "temp-logo",
];

/** Square official mark (1024×1024) — preserve aspect via object-fit: contain in CSS. */
const BRAND_LOGO_VARIANTS = {
  sidebar: {
    width: 72,
    height: 72,
    className: "rs-logo rs-logo-sidebar rs-logo--protected",
    sizes: "(max-width: 1024px) 64px, 72px",
  },
  topbar: {
    width: 46,
    height: 46,
    className: "rs-logo rs-logo-topbar rs-logo--protected",
    sizes: "46px",
  },
  minimal: {
    width: 48,
    height: 48,
    className: "rs-logo rs-logo-minimal rs-logo--protected",
    sizes: "48px",
  },
  footer: {
    width: 48,
    height: 48,
    className: "rs-logo rs-logo-footer rs-logo--protected",
    sizes: "48px",
  },
  social: {
    width: 120,
    height: 120,
    className: "rs-logo rs-logo--protected",
    sizes: "120px",
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
