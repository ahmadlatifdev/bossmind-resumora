# Resumora — Security & Operations Handoff

Production project: `resumora-live` · Hosting: `client-resumora-live.web.app` · Domain: `resumora.net`

This document records the automated, serverless security posture as of the **v1.0.0-launch** code freeze.

---

## 1. Private asset delivery (Cloudflare R2)

- The R2 bucket (`resumora-videos`) is **private** — no `pub-*.r2.dev` public URLs are used anywhere.
- Private assets are referenced internally as `r2://<bucket>/<key>` and resolved at request time by the
  `secureAssetUrl` Cloud Function (`/api/secure-asset-url`), which is Firebase Auth-gated and returns a
  **presigned URL with a 1-hour expiry** (`expiresIn: 3600`).
- GCS masters are likewise served via signed v4 URLs (`/api/video/signed-url`, 1-hour expiry,
  auth + subscription gated). Luxury PDFs use `/api/luxury-pdf-url` (auth + subscription gated).
- There are **no hardcoded** `firebasestorage.googleapis.com`, `storage.googleapis.com`, `.r2.dev`, or
  raw `.mp4`/`.pdf` URLs in the frontend (verified against `src/` and the built bundle).

## 2. Stripe webhook integrity

- `stripeWebhook` (`functions/stripeWebhook.js`) verifies every payload with
  `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)`; missing/invalid signatures
  return **400**.
- Entitlement grant (`checkout.session.completed`) uses a **strict allow-list**: `hasActiveSubscription: true`,
  `entitlementState: 'active'`, `paid: true` are written **only** when `payment_status` is `paid` or
  `no_payment_required`. `unpaid` / missing status is refused (`lib/stripeEventProcessor.js`).
- Refunds and disputes (`charge.refunded`, `charge.dispute.created`) auto-revoke entitlements
  (`hasActiveSubscription: false`, `entitlementState: 'revoked'`).
- Event processing is idempotent via `stripe_processed_events/{event.id}` (Firestore), and the handler
  always returns **200 OK** to Stripe while logging internal failures with structured context
  (event id, type, customer id) to GCP Cloud Logging.

## 3. Observability

- **Frontend:** Sentry (`@sentry/react`) is initialized in `src/main.tsx` when `VITE_SENTRY_DSN` is set, and a
  `Sentry.ErrorBoundary` wraps the app to capture React crash stacks and show a fallback UI.
- **Backend:** Cloud Functions / Cloud Run emit structured error logs (event id, event type, Stripe customer id)
  to **Google Cloud Logging / Cloud Error Reporting**, which auto-aggregates errors and alerts.
- **Note:** Datadog and DBOS are **not** configured in this stack (the platform is Google-only). Backend
  monitoring is handled natively by GCP Cloud Logging + Error Reporting.

## 4. Continuous automated guardrails

- **Synthetic User E2E** (`tests/launch.spec.ts` via Playwright) walks the critical funnel — homepage →
  Pricing → checkout CTA → Stripe redirect, Video Library render, and an invisible-overlay hit test.
  Failures **block the production deploy** (`e2e-tests` job in `.github/workflows/deploy-prod.yml`).
- **Self-heal & health checks:** scheduled `systemHealthCron` / `selfHeal` functions monitor the stack.
- **Secrets:** Stripe / R2 / Bilibili / Resend credentials live in Secret Manager; no plaintext keys in the repo.

---

This environment runs entirely on Google Cloud serverless (Firebase Hosting, Cloud Functions / Cloud Run,
Firestore, Secret Manager, Cloud Scheduler). No persistent servers, no manual intervention required for the
core payment + entitlement path.
