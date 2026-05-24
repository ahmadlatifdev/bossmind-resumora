/**
 * Resumora -- middleware.js (Next.js Edge Middleware)
 *
 * Canonical redirect: any *.onrender.com host -> https://resumora.net
 *
 * Root cause fixes applied:
 *   1. Was matching only "bossmind-resumora-web.onrender.com" exactly.
 *      Render exposes both bossmind-resumora-web.onrender.com AND
 *      bossmind-resumora.onrender.com. Now matches ALL *.onrender.com hosts.
 *   2. Render's reverse proxy may rewrite the Host header before Next.js
 *      receives it. Added X-Forwarded-Host header as fallback so the real
 *      public-facing hostname is always detected correctly.
 *
 * SAFE EXCLUSIONS (never redirected):
 *   /api/*       -- all API routes including webhooks and Stripe
 *   /_next/*     -- Next.js internal assets
 *   /favicon.ico -- static
 *   /robots.txt  -- must be reachable on both domains
 *   /sitemap.xml -- must be reachable on both domains
 *
 * Local dev: localhost never matches *.onrender.com -> pass through.
 * Does NOT touch: auth, session, Stripe, uploads, PRAE, API contracts.
 */

import { NextResponse } from "next/server";

const CANONICAL_HOST = "resumora.net";

/**
 * Returns true if the hostname is a Render internal domain.
 * Matches: bossmind-resumora-web.onrender.com, bossmind-resumora.onrender.com,
 *          any-variant.onrender.com
 * Does NOT match: resumora.net, localhost, 127.0.0.1
 */
function isRenderHost(hostname) {
  if (!hostname) return false;
  return hostname.endsWith(".onrender.com") || hostname === "onrender.com";
}

/**
 * Paths that must never be redirected.
 * /api/ covers all API routes including:
 *   /api/stripe/webhook, /api/webhooks/stripe,
 *   /api/client/*, /api/engagement/*, /api/health
 */
const EXCLUDED_PREFIXES = [
  "/api/",
  "/_next/",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Resolve the real public-facing hostname.
  // Render's load balancer may rewrite the Host header to an internal value.
  // X-Forwarded-Host carries the original client-facing hostname reliably.
  const xForwardedHost = request.headers.get("x-forwarded-host") || "";
  const hostHeader     = request.headers.get("host") || "";
  const effectiveHost  = (xForwardedHost || hostHeader)
    .split(",")[0].trim().toLowerCase();

  // Already on canonical domain -- pass through immediately.
  if (
    effectiveHost === CANONICAL_HOST ||
    effectiveHost === `www.${CANONICAL_HOST}`
  ) {
    return NextResponse.next();
  }

  // Not a Render host (local dev, staging, other) -- pass through.
  if (!isRenderHost(effectiveHost)) {
    return NextResponse.next();
  }

  // Stripe webhook: stripe-signature header means Stripe is calling us directly.
  // Never redirect -- Stripe does not follow redirects on POST.
  if (request.headers.has("stripe-signature")) {
    return NextResponse.next();
  }

  // Never redirect excluded paths (API routes, static assets).
  if (EXCLUDED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Build the canonical redirect URL, preserving path + query string exactly.
  const redirectUrl = new URL(request.url);
  redirectUrl.hostname = CANONICAL_HOST;
  redirectUrl.protocol = "https:";
  redirectUrl.port     = "";

  // 308 Permanent Redirect -- preserves HTTP method, signals crawlers to update.
  return NextResponse.redirect(redirectUrl.toString(), {
    status: 308,
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

export const config = {
  matcher: [
    // Match all paths except Next.js static assets and favicon.
    // /api/* is NOT excluded here -- middleware needs to run to check
    // stripe-signature header. EXCLUDED_PREFIXES handles /api/ safely.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
