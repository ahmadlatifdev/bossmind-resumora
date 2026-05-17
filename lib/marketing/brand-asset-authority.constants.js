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
    width: 108,
    height: 108,
    className: "rs-logo rs-logo-sidebar rs-logo--protected",
    sizes: "(max-width: 1024px) 96px, 108px",
  },
  topbar: {
    width: 69,
    height: 69,
    className: "rs-logo rs-logo-topbar rs-logo--protected",
    sizes: "69px",
  },
  minimal: {
    width: 72,
    height: 72,
    className: "rs-logo rs-logo-minimal rs-logo--protected",
    sizes: "72px",
  },
  footer: {
    width: 72,
    height: 72,
    className: "rs-logo rs-logo-footer rs-logo--protected",
    sizes: "72px",
  },
  social: {
    width: 180,
    height: 180,
    className: "rs-logo rs-logo--protected",
    sizes: "180px",
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
