# BossMind global traffic and discovery (Resumora)

This document describes **what the repository implements** versus what **must be confirmed in external dashboards** (Google, Meta, analytics).

## In-repo capabilities

- **Technical SEO:** `lib/marketing/seo-config.js`, `pages/sitemap.xml.js`, `pages/robots.txt.js`, site-wide JSON-LD via `_document`.
- **Organic bundles:** `lib/marketing/google-organic-engine.js` (article outlines, clusters, GSC checklist steps, EN/FR). Orchestrator: `npm run bossmind:organic:growth`.
- **Discovery inventory API:** `GET /api/marketing/traffic-discovery` — public URL counts, sitemap/robots URLs, schema summary, and explicit `cannotAutoConfirmFromRepo` items.
- **Operator trust snapshot:** `GET /api/marketing/trust-snapshot` — engagement aggregates (no dislike promotion), discovery hints, optional local optimization readiness; requires the same auth as `runtime-sync-status` (dev, `BOSSMIND_DIAGNOSTICS=1`, or Bearer `BOSSMIND_ORCHESTRATION_SECRET`).
- **Production evidence script:** `npm run bossmind:global:production-confirm` — optional live sitemap probe with `BOSSMIND_CONFIRM_PROBE_SITEMAP=1`.

## Not auto-activated from code

Indexing, impressions, rankings, and social post visibility require **verified properties**, **secrets**, and **manual or API-backed** steps (Search Console sitemap submission, platform webhooks, OAuth). The global confirm script lists these under `cannotAutoConfirmFromRepo`.

## Environment

Set `NEXT_PUBLIC_SITE_URL` (or `NEXT_PUBLIC_BOSSMIND_PUBLIC_ORIGIN`) to the **canonical HTTPS origin** used on Render so sitemaps, hreflang alternates, and probes align with production.
