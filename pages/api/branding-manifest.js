/**
 * Dynamic Web App Manifest — versioned icon URLs + no-store so Chrome/PWA pick up branding changes.
 * Served at /manifest.webmanifest via next.config rewrites (public static manifest removed).
 */
const { buildWebManifest } = require("../../lib/marketing/branding-assets");

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }
  const body = buildWebManifest();
  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  res.status(200).send(JSON.stringify(body));
}
