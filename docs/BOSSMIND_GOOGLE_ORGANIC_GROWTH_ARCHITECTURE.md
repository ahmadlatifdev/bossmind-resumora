# BossMind Google Organic Growth — production architecture

This document **locks the default strategy** for BossMind organic growth: **artifact-first, API-second, never silent overwrite of approved UI**.  
Implementation in this repository is **bounded** to what can be shipped safely in Git (scripts, JSON bundles, Neon audit events). **Google Cloud OAuth, YouTube uploads, Merchant feeds, and n8n** are **out-of-repo integrations** wired with secrets on Railway / Render.

## Technical SEO shipped in-app

**Activation report (status matrix):** `docs/BOSSMIND_SEO_GOOGLE_ACTIVATION_REPORT.md`

| Surface | Location |
|---------|----------|
| Dynamic `sitemap.xml` | `pages/sitemap.xml.js` + `lib/marketing/seo-config.js` |
| Image sitemap | `pages/sitemap-images.xml.js` + `buildImageSitemapXml` in `seo-config.js` |
| Dynamic `robots.txt` | `pages/robots.txt.js` (disallows `/api/`, auth, ops routes; references both sitemaps) |
| Site-wide JSON-LD | `pages/_document.js` (Organization + WebSite) |
| **Google Business Profile (Maps) ops** | **`docs/RESUMORA_GOOGLE_BUSINESS_PROFILE_PLAYBOOK.md`** + `config/resumora-google-business-profile-checklist.json` + **`npm run resumora:gbp:audit`** (live-site alignment) + **`npm run resumora:gbp:confirm`** (Neon audit after manual GBP work) |
| Homepage meta / OG / Twitter / hreflang | `components/marketing/HomePage.jsx` + `site-copy` |

Set **`NEXT_PUBLIC_SITE_URL`** (canonical origin, no trailing slash) on Render. Submit **`{origin}/sitemap.xml`** in Search Console after deploy. **Indexing API** auto-submit for all URLs is not enabled (policy + credentials); use GSC or compliant batch jobs.

## 1. Master Google identity (BossMind-Core)

Create a single GCP project (suggested id: `bossmind-core`). Enable APIs only as needed:

| API | Role in BossMind |
|-----|-------------------|
| Search Console API | Query / coverage export, URL inspection (batch via worker) |
| Indexing API | **Only** for job posting / broadcast pages per Google policy—not generic marketing pages |
| Google Analytics Admin / Data | GA4 property linking, conversion events |
| YouTube Data API | Metadata, playlists (uploads still binary + policy review) |
| Merchant Center | Product surfaces where applicable |
| Gemini API | Optional; DeepSeek remains primary in-repo content brain |

**Secrets:** service accounts and refresh tokens live in **Railway env** (or Secret Manager); never commit JSON keys.

## 2. AI content intelligence (DeepSeek V3 + LangGraph)

| Layer | Location |
|-------|----------|
| Content / repair reasoning | `DEEPSEEK_API_KEY`, LangGraph repair flows under `lib/orchestration/` |
| Organic **drafts** (EN/FR, non-destructive) | `scripts/marketing/weekly-organic-pipeline.js` (`--enrich-ai`) |
| Google-facing bundles (articles, schema hints, internal links) | `lib/marketing/google-organic-engine.js` → `scripts/marketing/run-google-organic-engine.mjs` |

**Policy:** no auto-merge of generated markdown into `pages/` or `components/` without human or deploy-gate review. Duplicate prevention uses `weekId` + hashed slugs in bundle JSON.

## 3. Keyword discovery

**In-repo:** clusters and long-tail scaffolding in `google-organic-engine` JSON.  
**Future worker:** ingest Search Console queries + GA4 landing paths + optional Trends API; write **aggregates** to Neon (`event_log` / dedicated table). **pgvector** (optional) for embedding similarity—add via Neon migration when approved (not required for v1).

## 4. Landing page factory

**Not auto-generated routes in production** without design approval. Safe path:

1. Bundles under `.bossmind/campaigns/` supply outlines, meta, schema, internal links.  
2. Editorial or Cursor applies changes behind `npm run bossmind:checkpoint` and `docs/PROTECTED_COMPONENTS_REGISTRY.md`.  
3. `npm run build` + deploy gate.

Programmatic ISR/MDX factories belong in a **dedicated** repo or feature flag after legal/SEO review.

## 5. AI media

Bundle `media.imageBriefs` / `videoBriefs` describe ratios and palettes; **render** via designer tools or a separate worker (Sharp, FFMPEG). Do not commit generated binaries into this repo by default.

## 6. Multi-platform distribution

| Channel | Mechanism |
|---------|-----------|
| Site | Static/SSR pages on Render (this app) |
| Social | `scripts/marketing/run-social-growth-engine.mjs` (webhook autopublish **opt-in**) |
| YouTube / GBP / Pinterest | External worker + OAuth; captions and chapters from bundle templates |

Workflow: **Generate → Optimize (human or gate) → Publish → Index (API where allowed) → Analyze → Improve** — logging each phase to Neon.

## 7. Technical SEO

Use Next.js metadata, `public/robots.txt`, sitemap where already configured; extend only with review. Structured data: prefer JSON-LD on approved templates. Core Web Vitals: follow Next/Image and existing performance scripts (`bossmind:perf-scan`).

## 8. Autonomous optimization

Low-performing page detection requires **Search Console + GA4 data in Neon or warehouse** — not implemented blindly here. Safe hooks: `bossmind:organic:growth` + `bossmind:marketing:activate` on a schedule; optional `BOSSMIND_ORGANIC_USE_ORCHESTRATOR=1` to route activation through one orchestrator process.

## 9. BossMind memory (Neon)

| Event type | Meaning |
|------------|---------|
| `google_organic.bundle_generated` | Weekly bundle persisted |
| `bossmind.organic_growth.orchestration` | Multi-phase orchestrator summary |
| `bossmind.marketing.activation.*` | Unified marketing activation lifecycle |

**Self-learning:** promote patterns only from **aggregated** performance (CTR, conversions), stored as JSON payloads, not raw PII.

## 10. Validation + self-healing

Before deploy: `bossmind:deploy-gate`, `bossmind:antileak`, protected surface verify.  
Sentry → LangGraph repair remains the operational repair chain (see existing orchestration docs).

## 11. Protection rules (mandatory)

- Never overwrite **confirmed production** layouts without baseline seal workflow.  
- Block duplicate routes and SEO cannibalization via **code review + registry**, not silent scripts.  
- Resumora hosting: **Render** front, **Railway** workers — no Vercel path unless explicitly re-approved.

## 12. Multi-product registry

`config/bossmind-organic-growth-registry.json` lists **Resumora, ElegancyArt, AI Video Generator, TikTok AI, BossMind Capital**.  
Only projects with `BOSSMIND_REPO_ROOT_<NAME>` set **and** matching script layout run from this orchestrator; **Resumora** runs from the current repo root by default.

## 13. Commands

```bash
npm run bossmind:organic:growth
npm run bossmind:marketing:activate
# Single orchestrated path from marketing activation:
BOSSMIND_ORGANIC_USE_ORCHESTRATOR=1 npm run bossmind:marketing:activate
```

## Honest ceiling

Fully autonomous **publishing, indexing, media encoding, and cross-product GCP** control cannot be completed inside **only** the Resumora repo: each product needs its own Next (or other) app, OAuth consent, and platform quotas. This architecture **locks the strategy and the safe automation boundary**; workers and GCP complete the outer ring.
