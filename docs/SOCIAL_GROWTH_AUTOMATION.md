# Resumora Social Growth Automation

This document defines the persistent multi-platform social growth layer for Resumora.

## Scope

Platforms covered:

- Facebook
- Instagram
- TikTok
- YouTube
- LinkedIn
- Pinterest
- X
- Threads

The automation layer is **engine-only** (content + analytics + orchestration). It does not mutate approved UI/layout surfaces.

## Components

- Queue generation + scoring: `lib/marketing/social-growth-engine.js` (weekly per platform, EN/FR rotation)
- CLI orchestrator: `scripts/marketing/run-social-growth-engine.mjs`
- Weekly analytics rollup: `scripts/marketing/social-growth-report.mjs`
- Secure ingest endpoint: `POST /api/integrations/social-ingest`
- Secure orchestration endpoint: `POST /api/integrations/social-growth-orchestrate`

## What is automated

- **Weekly cadence:** one queued post **per platform per ISO week** (8 slots/week), with **EN/FR rotating** by week + platform index so both languages stay active without same-week duplicate bilingual spam.
- Platform-specific objective routing
- CTA enforcement:
  - Book Resume Review
  - Upgrade Resume
  - Contact Resumora
  - Apply Now
  - Start Your Career Upgrade
- Hashtag generation and hook generation
- Predicted engagement scoring
- **Single** publish window per platform (default), refined from historical metrics when Neon has `social_channel_metric` rows
- Optional webhook-driven autopublish dispatch with **Neon dedupe**: successful `social_growth.publish_attempt` for the same `weekId` + `platform` is not re-sent unless `--no-dedupe` or API `skipIfAlreadyPublished: false`
- Shared-memory persistence (`event_log`, `task_state`, `error_memory`)
- Weekly performance report snapshots

## Google organic companion

- See **`docs/GOOGLE_ORGANIC_AUTOMATION.md`** and `npm run marketing:google-organic` for SEO / landing / YouTube / GSC **artifact** generation.

## Required environment

- `NEON_DATABASE_URL` — shared memory persistence
- `SOCIAL_INGEST_SECRET` — bearer for `/api/integrations/social-ingest`
- `BOSSMIND_ORCHESTRATION_SECRET` (or `SOCIAL_AUTOMATION_SECRET`) — bearer for `/api/integrations/social-growth-orchestrate`
- `SOCIAL_AUTOMATION_TOKEN` — token forwarded to publisher workers
- Optional publisher webhooks (one per platform):
  - `SOCIAL_WEBHOOK_FACEBOOK`
  - `SOCIAL_WEBHOOK_INSTAGRAM`
  - `SOCIAL_WEBHOOK_TIKTOK`
  - `SOCIAL_WEBHOOK_YOUTUBE`
  - `SOCIAL_WEBHOOK_LINKEDIN`
  - `SOCIAL_WEBHOOK_PINTEREST`
  - `SOCIAL_WEBHOOK_X`
  - `SOCIAL_WEBHOOK_THREADS`
- Optional trend feed:
  - `SOCIAL_TREND_SIGNALS_JSON` (JSON array of `{ keyword, score }`)

## Commands

- Generate + persist queue:
  - `npm run marketing:growth-engine`
- Generate + persist + autopublish:
  - `npm run marketing:growth-engine:publish`
- Dry-run publish dispatch:
  - `npm run marketing:growth-engine:dry-run`
- Google organic bundle (SEO / landing / YouTube outlines):
  - `npm run marketing:google-organic`
  - `npm run marketing:google-organic:dry`
- Build weekly performance report:
  - `npm run marketing:growth-report`

## Recommended schedule (Railway cron / external scheduler)

- **Monday 10:15 UTC (weekly)**: `npm run marketing:growth-engine:publish` — single organic wave per week (dedupe protects replays).
- **Same window (optional)**: `npm run marketing:google-organic` — Google organic JSON bundle.
- **Monday 10:30 UTC**: `npm run marketing:growth-report` — rollup report.

GitHub Actions: **`.github/workflows/resumora-organic-weekly.yml`** runs the dry-run publish path in CI plus Google bundle + report (set `NEON_DATABASE_URL` secret for persistence).

> **Removed:** daily 08:00 / 09:00 UTC jobs — replaced by weekly organic strategy (`config/resumora-organic-marketing.json`).

## Safety / Anti-Leak

- Run `npm run bossmind:checkpoint` before broad changes.
- Do not edit protected UI surfaces for social automation work.
- Keep secrets in Railway / CI env only (never committed).
- Keep ingestion and orchestration endpoints bearer-protected.
- Use `marketing:growth-engine:dry-run` before enabling live publish jobs.
