/**
 * Resumora — next.config.js
 *
 * CANONICAL ENFORCEMENT: bossmind-resumora-web.onrender.com → resumora.net
 *
 * Safety rules applied:
 *   - Stripe webhook endpoint (/api/stripe/*) is EXCLUDED from redirect
 *     to preserve Stripe's ability to call the Render URL directly.
 *   - Upload API (/api/client/*) is EXCLUDED — only public-facing pages redirect.
 *   - All other traffic from the Render domain gets a 308 permanent redirect
 *     to the canonical resumora.net domain, preserving path and query string.
 *   - No routing structure changes. No API contract changes.
 *   - No auth/session mutation.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ── Canonical domain redirect ─────────────────────────────
  // Redirects traffic arriving on the Render internal URL to
  // the canonical resumora.net domain. Permanent (308) so search
  // engines and social crawlers update their indexes.
  async redirects() {
    return [
      {
        // All public pages on the Render internal domain
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "bossmind-resumora-web.onrender.com",
          },
        ],
        // Stripe webhook and internal API calls are excluded via
        // missing: pattern — if path starts with /api/stripe or
        // /api/webhooks, the redirect does NOT apply.
        missing: [
          { type: "header", key: "stripe-signature" },
        ],
        destination: "https://resumora.net/:path*",
        permanent: true,   // 308 — preserves POST method if needed
      },
    ];
  },

  // ── Security + canonical headers ─────────────────────────
  async headers() {
    return [
      {
        // Apply to all routes
        source: "/:path*",
        headers: [
          // Prevent clickjacking
          { key: "X-Frame-Options",           value: "SAMEORIGIN" },
          // Stop MIME sniffing
          { key: "X-Content-Type-Options",    value: "nosniff" },
          // Referrer policy: send full URL within same origin,
          // origin only cross-origin (safe for Stripe redirects)
          { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
          // Permissions policy
          { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Cache-control for static assets
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },

    ];
  },

  // ── Image domains (preserve existing) ────────────────────
  images: {
    domains: [
      "resumora.net",
      // Add other image domains your project uses here
      // e.g. "res.cloudinary.com", "cdn.resumora.net"
    ],
  },

  // ── Trailing slash: off (canonical URLs without trailing slash) ──
  trailingSlash: false,

  // ── Powered-by header: off ────────────────────────────────
  poweredByHeader: false,
};

module.exports = nextConfig;
