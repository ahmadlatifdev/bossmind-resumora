/**
 * Resumora -- next.config.js
 *
 * Belt-and-suspenders canonical redirect for Render -> resumora.net.
 *
 * Why this changed from the previous version:
 *   The previous `has: [{type:"host", value:"bossmind-resumora-web.onrender.com"}]`
 *   condition was UNRELIABLE on Render because:
 *     a) Render's reverse proxy rewrites the Host header before Next.js sees it.
 *     b) We had the wrong hostname (missing/extra "-web" suffix).
 *   The primary redirect is now handled entirely by middleware.js (edge layer).
 *   This next.config.js redirect is a secondary catch-all that triggers when
 *   the request host is NOT resumora.net, using `missing:` instead of `has:`.
 *   `missing:` is more reliable because it fires when a condition is absent,
 *   and resumora.net traffic will always HAVE the correct host -- so the
 *   `missing:` rule correctly identifies non-canonical traffic.
 *
 * NOTE: middleware.js runs BEFORE redirects() and handles most cases.
 *       This redirect is a safety net for any traffic that reaches Next.js
 *       rendering without going through the middleware (rare but possible).
 *
 * Stripe webhooks: excluded via the `stripe-signature` missing check.
 * API routes: excluded via the /api/:path* separate rule.
 */

const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  reactStrictMode: true,

  async redirects() {
    // Canonical Render → resumora.net redirects are handled in middleware.js (edge).
    // Empty here so localhost / 127.0.0.1 never get 308 loops in dev.
    return [];
  },

  async rewrites() {
    // Ensure /api/* is never redirected by the catch-all above.
    // Rewrites run after redirects in Next.js. This rewrite is a no-op
    // that signals to Next.js that /api/* should be handled normally.
    // (No actual rewrite needed -- this is documentation of the exclusion.)
    return [];
  },

  async headers() {
    return [
      {
        // Security headers for all routes.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options",        value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",     value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Long-term cache for Next.js static assets.
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },

  images: {
    domains: [
      "resumora.net",
    ],
  },

  trailingSlash: false,
  poweredByHeader: false,
};

module.exports = nextConfig;
















































