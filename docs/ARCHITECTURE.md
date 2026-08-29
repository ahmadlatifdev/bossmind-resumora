# BossMind Resumora — System Architecture

> **Project:** resumora.net · **Firebase:** `resumora-live` · **Hosting:** `client-resumora-live`  
> **Last indexed:** auto-generated via `npm run index:codebase`

## High-level topology

```text
Browser (Vite/React SPA)
    │
    ├─► Firebase Hosting (dist/) ──rewrites──► Cloud Functions Gen2 (us-central1)
    │                                              ├─ createCheckoutSession
    │                                              ├─ stripeWebhook (queue @ 90/s)
    │                                              ├─ billing: refund-preview, cancel-subscription
    │                                              └─ admin: system-health, manual update
    │
    ├─► Firebase Auth + Firestore (users, ServiceEvents, Refunds, Plans)
    │
    └─► Stripe (Checkout, Webhooks, Billing Portal, Refunds)

Local dev: server/stripe/index.ts (Express webhook + billing on PORT)
```

## Frontend (`src/`)

| Area       | Path                                   | Role                              |
| ---------- | -------------------------------------- | --------------------------------- |
| Shell      | `App.tsx`, `components/SiteHeader.tsx` | Routing, luxury nav               |
| Auth       | `auth/AuthContext.tsx`                 | Firebase Auth + subscription gate |
| Plans      | `lib/plans.js`                         | $29/$49/$79/$110 catalog          |
| Checkout   | `lib/stripeCheckout.js`                | Cloud Run / Payment Link fallback |
| Billing UI | `pages/AccountPage.tsx`                | Cancel modal + refund history     |
| Studio     | `pages/StudioPage.tsx`                 | Resume upload → ServiceEvents     |

## Backend (`functions/`)

| Module                        | Purpose                                              |
| ----------------------------- | ---------------------------------------------------- |
| `index.js`                    | Checkout session + HeyGen proxies                    |
| `stripeWebhook.js`            | Signature verify → p-queue processor                 |
| `lib/stripeWebhookQueue.js`   | 90 evt/s throttle, event.id dedupe                   |
| `lib/stripeEventProcessor.js` | PI succeeded, checkout, subscription, invoice failed |
| `lib/serviceDelivery.js`      | ServiceEvents audit + refund math                    |
| `lib/refundEngine.js`         | v1 conditional refunds                               |
| `lib/refundEngineV2.js`       | v2 retention + churn-aware refunds                   |
| `lib/analyticsEngine.js`      | Churn score + revenue rollup                         |
| `billingEndpoints.js`         | HTTP APIs for account cancellation                   |
| `adminEndpoints.js`           | System health + self-heal                            |

## Data model (Firestore)

- **ServiceEvents** — `customer_id`, `subscription_id`, `event_type`, `timestamp`
- **Plans** — `plan_id`, `total_milestones`
- **Refunds** — Stripe refund records + status
- **RevenueAnalytics** — daily rollups (written by analytics engine)
- **users** — `subscriptionStatus`, Stripe IDs

## Stripe performance stack

- Optimized Checkout: Link wallet, automatic tax, 3DS automatic, PMC attachment
- Webhook endpoint: `https://resumora.net/api/webhook`
- Dunning: queued emails on `invoice.payment_failed`

## CI/CD

| Workflow              | Trigger               | Target                       |
| --------------------- | --------------------- | ---------------------------- |
| `deploy-staging.yml`  | PR / push `staging`   | Preview channel (blue-green) |
| `deploy-prod.yml`     | merge main + approval | Production                   |
| `self-heal-tests.yml` | schedule + PR         | Billing + build regression   |
| `daily-health.yml`    | cron 08:00 UTC        | Health report artifact       |
| `security-audit.yml`  | weekly + PR           | npm audit + secret scan      |

## Security boundaries

- Secrets: `D:\BossMind\config\secrets.env` (never committed)
- Functions env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, optional `RESEND_API_KEY`
- CORS allowlist: resumora.net + localhost dev ports

## Manual Dashboard (Stripe-only)

1. Authorization Boost ON
2. Smart Retries Extended (45 days)
3. Verify Dynamic Payment Methods + Adaptive Pricing Active
