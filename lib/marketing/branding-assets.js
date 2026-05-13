/**
 * Single source for cache-busted public branding URLs (favicon, PWA, OG/Twitter).
 * Version from config/branding-asset-version.json; override at build with NEXT_PUBLIC_BRANDING_ASSET_VERSION.
 */
const { version } = require("../../config/branding-asset-version.json");

const BRANDING_ASSET_VERSION = (
  process.env.NEXT_PUBLIC_BRANDING_ASSET_VERSION || version || "1"
).trim();

function withBrandingQuery(assetPath) {
  if (!assetPath || typeof assetPath !== "string") return "/";
  if (assetPath.includes("?")) return assetPath;
  const base = assetPath.startsWith("/") ? assetPath : `/${assetPath}`;
  return `${base}?v=${encodeURIComponent(BRANDING_ASSET_VERSION)}`;
}

function brandAbsoluteUrl(siteUrl, assetPath) {
  const site = String(siteUrl || "").replace(/\/$/, "");
  const path = withBrandingQuery(assetPath.startsWith("/") ? assetPath : `/${assetPath}`);
  return `${site}${path}`;
}

function buildWebManifest() {
  const q = (p) => withBrandingQuery(p);
  return {
    name: "Resumora",
    short_name: "Resumora",
    description: "Executive resume studio — ATS-grade documents and white-glove delivery.",
    start_url: q("/"),
    scope: "/",
    display: "standalone",
    background_color: "#040814",
    theme_color: "#080f22",
    lang: "en",
    icons: [
      { src: q("/favicon.svg"), sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: q("/icon.svg"), sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: q("/favicon.ico"), sizes: "48x48", type: "image/x-icon", purpose: "any" },
      { src: q("/favicon-16x16.png"), sizes: "16x16", type: "image/png", purpose: "any" },
      { src: q("/favicon-32x32.png"), sizes: "32x32", type: "image/png", purpose: "any" },
      { src: q("/apple-touch-icon.png"), sizes: "180x180", type: "image/png", purpose: "any" },
      { src: q("/android-chrome-192x192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: q("/android-chrome-512x512.png"), sizes: "512x512", type: "image/png", purpose: "any maskable" },
      { src: q("/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: q("/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
    shortcuts: [
      {
        name: "Resumora",
        short_name: "Home",
        url: q("/"),
        icons: [{ src: q("/icon-192.png"), sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Pricing",
        short_name: "Pricing",
        url: q("/pricing"),
        icons: [{ src: q("/icon-192.png"), sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}

module.exports = {
  BRANDING_ASSET_VERSION,
  withBrandingQuery,
  brandAbsoluteUrl,
  buildWebManifest,
};
