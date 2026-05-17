/**
 * Browser-safe brand logo constants — import from ResumoraLogo and client bundles.
 */

/** Public URL — transparent official mark (no container). */
const BRAND_LOGO_SRC = "/brand/resumora-logo-official-transparent.png";

/** Repo-relative locked transparent asset. */
const BRAND_LOGO_PUBLIC_FILE = "public/brand/resumora-logo-official-transparent.png";

/** Legacy raster with dark matte — OG / rewrites only, not for inline UI. */
const BRAND_LOGO_LEGACY_MATTE = "/brand/resumora-logo-official.jpg";

const BRAND_LOGO_ALT = "Resumora — official luxury brand mark";

const BRAND_LOGO_LEGACY_ALIASES = [
  "/resumora-logo.png",
  "/resumora-logo.svg",
  "/brand/resumora-logo-original.png",
  "/brand/resumora-logo-official.png",
  BRAND_LOGO_LEGACY_MATTE,
];

const BRAND_LOGO_FORBIDDEN_PATTERNS = [
  "resumora-logo-original.png",
  "logo-draft",
  "logo-mockup",
  "logo-generated",
  "placeholder-logo",
  "fake-logo",
  "temp-logo",
];

/** Transparent mark — enlarged ~75% from prior lock; object-fit contain in CSS. */
const BRAND_LOGO_VARIANTS = {
  sidebar: {
    width: 180,
    height: 180,
    className: "rs-logo rs-logo-sidebar rs-logo--protected rs-logo--transparent",
    sizes: "(max-width: 1024px) 140px, 180px",
  },
  topbar: {
    width: 110,
    height: 110,
    className: "rs-logo rs-logo-topbar rs-logo--protected rs-logo--transparent",
    sizes: "110px",
  },
  minimal: {
    width: 96,
    height: 96,
    className: "rs-logo rs-logo-minimal rs-logo--protected rs-logo--transparent",
    sizes: "96px",
  },
  footer: {
    width: 96,
    height: 96,
    className: "rs-logo rs-logo-footer rs-logo--protected rs-logo--transparent",
    sizes: "96px",
  },
  social: {
    width: 200,
    height: 200,
    className: "rs-logo rs-logo--protected rs-logo--transparent",
    sizes: "200px",
  },
};

module.exports = {
  BRAND_LOGO_SRC,
  BRAND_LOGO_PUBLIC_FILE,
  BRAND_LOGO_LEGACY_MATTE,
  BRAND_LOGO_ALT,
  BRAND_LOGO_LEGACY_ALIASES,
  BRAND_LOGO_FORBIDDEN_PATTERNS,
  BRAND_LOGO_VARIANTS,
};
