/**
 * Resumora — middleware.js (Next.js Edge Middleware)
 *
 * Edge-level canonical redirect: enforces resumora.net as the sole
 * public-facing domain. Runs before any page renders, so crawlers
 * and social bots receive the 308 immediately without loading a page.
 *
 * SAFE EXCLUSIONS (never redirected):
 *   - /api/stripe/*        — Stripe webhooks (called by Stripe servers to Render URL)
 *   - /api/webhooks/*      — any other webhooks
 *   - /api/health          — Render health check
 *   - /_next/*             — Next.js internal assets
 *   - /favicon.ico         — static assets
 *
 * All other paths arriving on bossmind-resumora-web.onrender.com
 * receive a 308 permanent redirect to https://resumora.net/<same-path>.
 *
 * Does NOT touch:
 *   - auth/session logic
 *   - upload processing
 *   - Stripe checkout flow
 *   - PRAE systems
 *   - API contracts
 */

import { NextResponse } from "next/server";

/** The internal Render domain to redirect away from. */
const RENDER_HOST = "bossmind-resumora-web.onrender.com";

/** The canonical production domain. */
const CANONICAL_HOST = "resumora.net";

/**
 * Paths that must NEVER be redirected.
 * Stripe calls webhooks directly to the Render URL — redirecting
 * those would break webhook delivery because Stripe does not follow
 * redirects on POST requests.
 */
const EXCLUDED_PREFIXES = [
  "/api/stripe",
  "/api/webhooks",
  "/api/health",
  "/_next",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

export function middleware(request) {
  const { hostname, pathname, search } = request.nextUrl;

  // Only act on Render internal domain traffic
  if (hostname !== RENDER_HOST) {
    return NextResponse.next();
  }

  // Never redirect excluded paths (webhooks, assets, health)
  const isExcluded = EXCLUDED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  if (isExcluded) {
    return NextResponse.next();
  }

  // Stripe-signature header means this is a webhook POST — never redirect
  const hasStripeSignature = request.headers.has("stripe-signature");
  if (hasStripeSignature) {
    return NextResponse.next();
  }

  // Build the canonical redirect URL, preserving path and query string
  const redirectUrl = new URL(request.url);
  redirectUrl.hostname = CANONICAL_HOST;
  redirectUrl.protocol = "https:";
  redirectUrl.port     = "";         // remove any explicit port

  // 308 Permanent Redirect — preserves HTTP method (safe for all flows)
  return NextResponse.redirect(redirectUrl.toString(), {
    status: 308,
    headers: {
      // Tell crawlers to update their indexes
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export const config = {
  /**
   * Run middleware on all routes except:
   * - Next.js internal routes (_next/*)
   * - Static file routes (favicon, images, etc.)
   * The EXCLUDED_PREFIXES check above provides a second layer of safety.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
