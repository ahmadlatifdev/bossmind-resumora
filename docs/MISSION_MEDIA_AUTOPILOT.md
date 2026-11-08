# Mission: Resumora.net Media Autopilot — Checkpoint

Scoped to Resumora only. No credentials, tokens, or customer PII stored here.

## State

- Repo (authoritative): `github.com/ahmadlatifdev/bossmind-resumora` · branch `main`
- HEAD at mission start: `3a05f6d`
- Production: Firebase Hosting `client-resumora-live.web.app` / domain `resumora.net` · project `resumora-live`

## Verified discovery

- Health/self-heal schedulers live (Cloud Scheduler, us-central1):
  - `firebase-schedule-systemHealthCron-us-central1` — every 1 min (ENABLED)
  - `resumora-system-health` — every 15 min (ENABLED)
  - `recovery-system-trigger` — every 1 min (ENABLED)
  - `firebase-schedule-systemManualCron-us-central1` — Mon 06:00 (ENABLED)
  - `resumora-finance-allocation` + `firebase-schedule-financeAllocationCron` — daily 07:15 (ENABLED)
  - `firebase-schedule-bossmindMemoryWorker-us-central1` — every 1 min (ENABLED; source NOT in this repo)
  - `refresh-videos-cron` — quarterly (ENABLED)
- Guard-Ops / auto-ACK infra present (`lib/autoAck.js`, `lib/harnessTasks.js`, `selfHeal.js`); toggles default OFF.
- Playwright `tests/launch.spec.ts` + CI `e2e-tests` deploy guard present.

## Completed (verified)

- **Social image**: generated 1200×630 `public/og-image.png` (44 KB) via `scripts/generate-og-image.py` (Pillow).
  - Deployed to `https://resumora.net/og-image.png` (HTTP 200, dimensions 1200×630).
  - `index.html` + `pricing.html` `og:image` / `twitter:image` now point to `https://resumora.net/og-image.png`.
  - Served HTML verified: crawler receives the new absolute URL.

## Remaining / blocked (see completion report)

- Publishing (LinkedIn/Reddit/TikTok/etc.): no API credentials in repo — blocked on account authorization.
- Revenue simulation: no real charges without explicit authorization.
- Memory outbox / DBOS: live in a separate codebase, not this repo.

## Rollback / recovery

- Image revert: restore `og:image` to prior `resumora-logo.png` (index.html) / `logo.png` (pricing.html) and redeploy hosting.
- Git checkpoint: commit after image deploy.
