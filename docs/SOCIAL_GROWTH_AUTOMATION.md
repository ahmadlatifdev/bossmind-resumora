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

- Queue generation + scoring: `lib/marketing/social-growth-engine.js`
- CLI orchestrator: `scripts/marketing/run-social-growth-engine.mjs`
- Weekly analytics rollup: `scripts/marketing/social-growth-report.mjs`
- Secure ingest endpoint: `POST /api/integrations/social-ingest`
- Secure orchestration endpoint: `POST /api/integrations/social-growth-orchestrate`

## What is automated

- Bilingual EN/FR queue generation per platform
- Platform-specific objective routing
- CTA enforcement:
  - Book Resume Review
  - Upgrade Resume
  - Contact Resumora
  - Apply Now
  - Start Your Career Upgrade
- Hashtag generation and hook generation
- Predicted engagement scoring
- Publish window optimization from historical metrics (when available in Neon)
- Optional webhook-driven autopublish dispatch
- Shared-memory persistence (`event_log`, `task_state`, `error_memory`)
- Weekly performance report snapshots

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
- Build weekly performance report:
  - `npm run marketing:growth-report`

## Recommended schedule (Railway cron / external scheduler)

- **Daily 08:00 UTC**: `npm run marketing:growth-engine`
- **Daily 09:00 UTC**: `npm run marketing:growth-engine:publish`
- **Monday 10:00 UTC**: `npm run marketing:growth-report`

## Safety / Anti-Leak

- Run `npm run bossmind:checkpoint` before broad changes.
- Do not edit protected UI surfaces for social automation work.
- Keep secrets in Railway / CI env only (never committed).
- Keep ingestion and orchestration endpoints bearer-protected.
- Use `marketing:growth-engine:dry-run` before enabling live publish jobs.
