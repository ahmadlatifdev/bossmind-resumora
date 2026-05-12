# Google organic marketing automation (Resumora)

This layer complements **social** automation (`docs/SOCIAL_GROWTH_AUTOMATION.md`). It generates **structured JSON** for organic discovery: SEO article outlines, keyword clusters, landing-page briefs, YouTube outlines, Search Console workflow steps, and media specs — **without** calling Google APIs from the repo (no OAuth secrets in git).

## Commands

- `npm run marketing:google-organic` — write bundle to `.bossmind/campaigns/google-organic/<week>.json` + optional Neon event `google_organic.bundle_generated` (requires `NEON_DATABASE_URL`).
- `npm run marketing:google-organic:dry` — same without Neon persist.

## What is generated

- **EN + FR** article outlines (titles, meta descriptions, target keywords, internal links to `/pricing`, `/contact`, `/solutions/*`).
- **Keyword clusters** for executive resume / ATS / LinkedIn intents (deduped by weekly seed hash).
- **Landing briefs** aligned to existing solution slugs (mobile-first, schema hints).
- **YouTube organic** chapter outlines (Shorts/long companion — worker implements render).
- **Search Console** operational checklist (export coverage → map to slugs → ship via normal PR flow).
- **Google Business Profile** checklist when `GOOGLE_BUSINESS_LOCATION_ID` is set.
- **Image / video** creative briefs (OG 1.91:1, square feed, 9:16 Shorts) with **navy/gold** restraint.

## Live Google integrations (outside this repo)

| Capability | Requirement |
|------------|-------------|
| Search Console API | OAuth refresh token + `googleapis` in a Railway worker |
| Google Business Profile API | OAuth + Business Profile API enabled project |
| YouTube Data API | OAuth + channel ownership |
| Indexing | Publish real routes via normal deploy; use `next` metadata API on approved pages only |

## Policy

- **Free-organic-first**: no paid placement logic here.
- **Policy-safe**: service marketing only; no guarantees outside delivery scope.
- **Immutability**: do not auto-write to `pages/` or protected components — human PR merges content.

## Config

- `config/resumora-organic-marketing.json` — `googleOrganic.enabled` toggles generation.
