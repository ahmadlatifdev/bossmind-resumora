# System Performance Audit — resumora.net

**Audit date:** 2026-08-23 (America/Toronto)  
**Auditor role:** Senior DevOps / Systems Auditor  
**Scope:** Firebase Hosting, Cloud Run Functions, Firestore rules, Scheduler, Self-Heal, GA4 config, refund/auth/i18n benefit rate  
**Security:** No `sk_live_`, `whsec_`, `pk_live_`, or `price_` values are printed in this report.

---

## Executive summary

| Area                    | Verdict                                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Hosting (public pages)  | **Healthy** — HTTP 200; pricing/login ~140–200 ms                                                                                 |
| Core checkout + webhook | **Ready** on Cloud Run; webhook uses `constructEvent` + Secret Manager                                                            |
| Self-heal scheduler     | **Running every 5 min** but **health score ~40 (impaired)**; Guardian failing; alerts not sending (email key missing on function) |
| User refund APIs        | **Not deployed** — hosting rewrites return **404** (`requestRefund` / `listMyRefunds` missing on Cloud Run)                       |
| i18n EN/FR/ES           | **Complete** — 246/246/246 keys; 0 missing / 0 placeholders                                                                       |
| GA4                     | **Partially configured** — Firebase measurement ID present (`G-QW…`); dedicated `VITE_GA_MEASUREMENT_ID` empty                    |
| Lighthouse LCP/INP/CLS  | **Not measured in this audit** (no PageSpeed/Lighthouse run; GA4 Core Web Vitals not pulled via API)                              |

**Benefit rate (ops value delivered vs intended):** roughly **~55–65%**. Core commerce path and self-heal loop exist and schedule; user-facing refund + KYC monitor + alert delivery are incomplete in production.

---

## 1) Uptime & health metrics

### Cloud Run — core services (`gcloud run services describe`)

| Service                   | Ready       | Latest revision                     | Memory | Notes                                                    |
| ------------------------- | ----------- | ----------------------------------- | ------ | -------------------------------------------------------- |
| `createcheckoutsession`   | True        | `createcheckoutsession-00016-xap`   | 256Mi  | Secrets: `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET` bound |
| `stripewebhook`           | True        | `stripewebhook-00011-bov`           | 256Mi  | Signature verification via `constructEvent`              |
| `getsystemhealth`         | True        | `getsystemhealth-00001-did`         | 256Mi  | Returns 401 without admin password (expected)            |
| `runsystemhealth`         | True        | `runsystemhealth-00001-mih`         | 512Mi  | Manual MAPE-K trigger                                    |
| `selfhealmonitor`         | True        | `selfhealmonitor-00001-hiv`         | 512Mi  | Scheduler target                                         |
| `autoapprovestalerefunds` | True        | `autoapprovestalerefunds-00001-zix` | 256Mi  | Daily job                                                |
| `requestrefund`           | **Missing** | —                                   | —      | Code exists in repo; **not deployed**                    |
| `listmyrefunds`           | **Missing** | —                                   | —      | Code exists in repo; **not deployed**                    |

### Cloud Scheduler

| Job                                                     | State          | Schedule                        | Last attempt (UTC)                                                    |
| ------------------------------------------------------- | -------------- | ------------------------------- | --------------------------------------------------------------------- |
| `firebase-schedule-selfHealMonitor-us-central1`         | ENABLED        | every 5 minutes                 | 2026-08-23T11:26:06Z (fresh)                                          |
| `firebase-schedule-autoApproveStaleRefunds-us-central1` | ENABLED        | every day 09:00 America/Toronto | No successful last-attempt shown (code −1 / empty)                    |
| `stripeKycMonitor` schedule                             | **Not listed** | —                               | Function export in repo; **scheduler job not present** → not deployed |
| `recovery-system-trigger`                               | ENABLED        | `* * * * *`                     | Active (external recovery job)                                        |

**Self-heal success rate (observed):** job **fires reliably** (~every 5 min). Recent cycles report **`score: 40`, `status: impaired`, `guardianPassed: false`, `approvals: 1`**. Auto safe remediations often `executed: 0` with HITL approvals opened. Alert notify **skipped** (`hasKey: false`, `hasTo: false`) — Resend / admin email not wired on that service.

### Live HTTP probes (this audit)

| URL                                           | Result  | Latency     |
| --------------------------------------------- | ------- | ----------- |
| `GET /`                                       | 200     | ~896 ms     |
| `GET /pricing`                                | 200     | ~197 ms     |
| `GET /login`                                  | 200     | ~139 ms     |
| `GET /admin/system-health` (UI)               | 200     | ~144 ms     |
| `GET /api/admin/system-health` (bad password) | **401** | ~1622 ms    |
| `OPTIONS/POST /api/request-refund`            | **404** | ~128–141 ms |
| `OPTIONS /api/create-checkout-session`        | 204     | ~244 ms     |

---

## 2) Performance measurement (LCP / INP / CLS / API)

| Metric                     | Pricing         | Video Library                     | Member Access (`/login`) | Source                                  |
| -------------------------- | --------------- | --------------------------------- | ------------------------ | --------------------------------------- |
| LCP                        | _Not collected_ | _Not collected_                   | _Not collected_          | Need PageSpeed Insights / Lighthouse CI |
| INP                        | _Not collected_ | _Not collected_                   | _Not collected_          | Same                                    |
| CLS                        | _Not collected_ | _Not collected_                   | _Not collected_          | Same                                    |
| Document TTFB (proxy)      | ~197 ms         | Auth-gated (not probed logged-in) | ~139 ms                  | Live `Invoke-WebRequest`                |
| `/api/admin/system-health` | —               | —                                 | ~1.6 s (401 path)        | Includes cold-start risk                |
| `/api/request-refund`      | —               | —                                 | **404**                  | Function not live                       |

**GA4:** Firebase `VITE_FIREBASE_MEASUREMENT_ID` mapped (`G-QW…`). `VITE_GA_MEASUREMENT_ID` empty — analytics helper still accepts Firebase measurement ID. Core Web Vitals from GA4 were **not queried** (no Analytics Data API credentials in this session).

---

## 3) Feature performance (benefit report)

### Refunds

| Check                                    | Result                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Admin UI `/admin/refunds`                | Hosted (SPA)                                                                                |
| Admin APIs list/decide                   | Cloud Run services **present** (`listrefundrequests`, `deciderefundrequest`)                |
| Auto 10-business-day job                 | Service + scheduler **present**; last run evidence weak                                     |
| User `POST /api/request-refund`          | **404 — not deployed**                                                                      |
| User `GET /api/my-refunds`               | **404 — not deployed**                                                                      |
| Account UI `/account`                    | On Hosting after 2026-08-23 deploy                                                          |
| Firestore `refund_requests` distribution | **Not readable** this session (Admin SDK / admin password not available; client rules deny) |

**Benefit:** Admin + auto path partially live; **client self-serve refund path not producing production benefit yet**.

### Authentication

| Check                       | Result                                                          |
| --------------------------- | --------------------------------------------------------------- |
| Firebase project            | `resumora-live`                                                 |
| Login error mapping         | Deployed in hosting build (specific `auth/*` → EN/FR/ES)        |
| `users` growth              | **Not counted** (no Admin SDK query this session)               |
| Firestore rules for `users` | Owner read/write; paid fields **blocked** from client elevation |

### Checkout

| Check                   | Result                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `createCheckoutSession` | Ready                                                                                                 |
| Stripe secrets          | **Secret Manager: Yes** (`STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET` listed; bound on checkout/webhook) |
| Webhook signature       | **Yes** — `stripe.webhooks.constructEvent`                                                            |
| Env fallback            | Code also reads `process.env.STRIPE_*` if secret `.value()` fails (defense in depth)                  |

### i18n

| Locale | Key count | Missing vs EN | Placeholder (`value === key`) |
| ------ | --------- | ------------- | ----------------------------- |
| EN     | 246       | —             | —                             |
| FR     | 246       | 0             | 0                             |
| ES     | 246       | 0             | 0                             |

### Self-heal / monitoring

| Check                        | Result                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------- |
| 5‑min MAPE-K                 | Active; score **~40 impaired**                                               |
| Admin `/admin/system-health` | UI live; API gated                                                           |
| Slack/Email alerts           | **Not delivering** — notify skipped (no API key / recipient on function env) |
| `notification_history`       | Intended; not verified populated                                             |

---

## 4) Critical missing items

| Priority | Gap                                                                                                 | Impact                                   |
| -------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **P0**   | Deploy `requestRefund` + `listMyRefunds` (+ Hosting rewrite already present)                        | Account “Request Refund” broken (404)    |
| **P0**   | Fix self-heal Guardian / score 40 (likely Stripe secret mount + env inventory on `selfHealMonitor`) | Continuous false-impaired + HITL noise   |
| **P1**   | Wire `RESEND_API_KEY` / `EMAIL_API_KEY` + `ADMIN_NOTIFY_EMAIL` on self-heal / refund functions      | Alerts & refund emails silent            |
| **P1**   | Deploy `stripeKycMonitor` schedule                                                                  | KYC/payout banner never refreshed by job |
| **P1**   | Confirm `autoApproveStaleRefunds` executes at 09:00 (empty last attempt)                            | Auto-refund benefit unverified           |
| **P2**   | Run Lighthouse / PageSpeed on `/`, `/pricing`, `/login`, `/videos`                                  | No LCP/INP/CLS baseline                  |
| **P2**   | Persist structured heal scores to BigQuery or export dashboard                                      | Audit relies on Cloud Logging scrape     |
| **P2**   | Set `VITE_GA_MEASUREMENT_ID` explicitly if GA property ≠ Firebase measurement                       | Avoid dual-ID confusion                  |
| **P3**   | `recovery-system-trigger` every minute — document ownership / cost                                  | Extra Cloud Scheduler spend              |

### Firestore rules assessment

- **Default deny** for unmatched paths: good.
- Sensitive collections (`refund_requests`, `system_health`, `webhook_events`, etc.): **Admin SDK only** — good.
- `users/{uid}`: owner-scoped; cannot client-write paid entitlement fields — good.
- **Note:** clients _can_ set `serviceProvided` / `serviceActivated` (not in blocked list) — intentional for “service used” marking, but could be abused to suppress auto-refunds; consider locking those fields to Admin SDK later.

### Webhook retry / error handling

- Stripe retries on non-2xx; handler should acknowledge after durable writes.
- Invoice / pending-refund side effects are try/catch so webhook can still return success — appropriate.
- Signature failure returns auth error (no silent accept) — verified in code.

---

## 5) Security & cost

| Control                                   | Status                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Webhook signature validation              | **Yes** (`constructEvent`)                                                                       |
| `STRIPE_API_KEY` in Secret Manager        | **Yes** (secret name present; bound on checkout/webhook)                                         |
| `STRIPE_WEBHOOK_SECRET` in Secret Manager | **Yes**                                                                                          |
| `RESEND_API_KEY` in Secret Manager        | **Yes** (name present) — **not confirmed bound** to self-heal service (notify skipped)           |
| Secrets printed in logs                   | Not observed; structured logs use prefixes / booleans                                            |
| Org policy blocks `allUsers` invoker      | Known; several services use `--no-invoker-iam-check`                                             |
| Cost drivers                              | 5‑min self-heal + optional 1‑min `recovery-system-trigger`; cold starts on admin health (~1.6 s) |

---

## Recommended next actions (ordered)

1. `firebase deploy --only functions` (or at least `requestRefund`, `listMyRefunds`, `stripeKycMonitor`, updated `selfHealMonitor` / `refunds`) then `--no-invoker-iam-check` on new HTTP services.
2. Bind Resend + admin notify env/secrets to self-heal and refund functions; re-check notify logs.
3. Diagnose score 40 (Stripe secret availability inside scheduler revision; hosting probe / env prefix findings).
4. Unlock `/admin/system-health` once and export score + refund counts for a quantitative benefit dashboard.
5. Run PageSpeed Insights (mobile+desktop) for LCP/INP/CLS baseline.

---

## Appendix — recreate describe commands

```powershell
gcloud run services describe createcheckoutsession --region=us-central1 --project=resumora-live
gcloud run services describe stripewebhook --region=us-central1 --project=resumora-live
gcloud run services describe getsystemhealth --region=us-central1 --project=resumora-live
gcloud scheduler jobs list --location=us-central1 --project=resumora-live
gcloud secrets list --project=resumora-live
```
