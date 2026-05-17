/**
 * Global Brand Asset Authority — single locked Resumora logo source.
 * All UI must import ResumoraLogo from @/components/brand/ResumoraLogo.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/** Public URL — only approved original asset. */
const BRAND_LOGO_SRC = "/brand/resumora-logo-original.png";

/** Repo-relative locked file (never replace without approval + re-seal). */
const BRAND_LOGO_PUBLIC_FILE = "public/brand/resumora-logo-original.png";

const BRAND_LOGO_ALT = "Resumora — RESUMORA wordmark";

const BRAND_LOGO_LEGACY_ALIASES = ["/resumora-logo.png", "/resumora-logo.svg"];

const BRAND_LOGO_FORBIDDEN_PATTERNS = [
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

function readLockedLogoHash(cwd = process.cwd()) {
  const filePath = path.join(cwd, BRAND_LOGO_PUBLIC_FILE);
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

module.exports = {
  BRAND_LOGO_SRC,
  BRAND_LOGO_PUBLIC_FILE,
  BRAND_LOGO_ALT,
  BRAND_LOGO_LEGACY_ALIASES,
  BRAND_LOGO_FORBIDDEN_PATTERNS,
  BRAND_LOGO_VARIANTS,
  readLockedLogoHash,
};
