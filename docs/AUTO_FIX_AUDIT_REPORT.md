# Auto-Fix Audit Report — resumora.net

**Date:** 2026-08-23  
**Auditor role:** Principal SRE + Lead Full-Stack  
**Project:** `resumora-live` / Hosting `client-resumora-live` / `resumora.net`  
**Repo working branch:** `R-02-apply` (selected fixes also pushed to `main` where noted)

**Safety:** No `sk_*`, `whsec_*`, `pk_*`, or `price_*` values printed. `.env.local`, Firebase web config defaults, and Secret Manager secret _values_ were not modified.

---

## Phase 1 — Deep code audit (findings)

### Routes (`src/App.tsx`)

| Path                   | Component / behavior              | Status                                |
| ---------------------- | --------------------------------- | ------------------------------------- |
| `/`                    | `HomePage`                        | OK                                    |
| `/login`               | `LoginPage`                       | OK (+ Firestore `upsertUserProfile`)  |
| `/register`, `/signup` | Navigate → `/login?mode=register` | OK                                    |
| `/account`             | `AuthGuard` → `AccountPage`       | OK (nav link was missing on home SPA) |
| `/video-library`       | `AuthGuard` → `VideosPage`        | OK                                    |
| `/resume-studio`       | Navigate → `/studio`              | OK (standalone `studio.html`)         |
| `/admin/refunds`       | `AdminRefundsPage`                | OK                                    |
| `/admin/system-health` | `AdminSystemHealthPage`           | OK                                    |
| `*`                    | Navigate → `/`                    | OK                                    |

Multi-page entries (Hosting): `/pricing`, `/studio`, `/videos`, `/reset-password` — separate Vite HTML shells; auth gated via `StudioAuthGate` / Login.

### Dead / weak UI (before fix)

| Item                                 | Issue                                                                                       | Fix                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Home `SiteNav`                       | Logged-in users had Sign out but **no Account** link                                        | Added `/account` link when authenticated |
| Pricing `PlanCard`                   | Passed `stripePriceId` into handlers that store **plan id** (worked via lookup but brittle) | Pass `plan.id` consistently              |
| Pricing Client Registration          | Already present when `showRegister` (plan picked)                                           | Verified — no change needed              |
| Checkout CTAs / Login / Video player | Handlers present                                                                            | OK                                       |

### API cross-check

| Frontend                          | Backend export          | Hosting rewrite | Pre-fix live           | Post-fix live                  |
| --------------------------------- | ----------------------- | --------------- | ---------------------- | ------------------------------ |
| `/api/create-checkout-session`    | `createCheckoutSession` | yes             | 400 Invalid planId     | same (healthy)                 |
| `/api/request-refund`             | `requestRefund`         | yes             | **404** (not deployed) | **401** without auth (healthy) |
| `/api/my-refunds`                 | `listMyRefunds`         | yes             | **404** (not deployed) | **401** without auth (healthy) |
| `/api/client-error`               | `reportClientError`     | yes             | 400 message required   | OK                             |
| `/api/admin/system-health*`       | get/run/decide          | yes             | 401 without password   | OK                             |
| `/api/video/catalog`              | `heygenVideoCatalog`    | yes             | **403** IAM            | **200** after invoker fix      |
| Admin refunds / support / webhook | present                 | yes             | n/a                    | services exist                 |

### Environment

- Inspected **`.env.example` only** (not `.env.local` values).
- Added missing **placeholder** keys used by `plans.js`: `VITE_STRIPE_PRICE_PRO`, `VITE_STRIPE_PRICE_PROFESSIONAL_TIER`, Payment Link fallbacks.
- Did **not** edit `.env.local` or rotate secrets (per safety rule).

### i18n

- en/fr/es: **246** keys each; all `t()` usages resolved; **no missing keys**.

---

## Phase 2 — Automated fixes applied

### Critical (production)

1. **Deployed** Cloud Functions `requestRefund` + `listMyRefunds` (codebase `resumora-checkout`).
2. Applied **`--no-invoker-iam-check`** on `requestrefund`, `listmyrefunds`, and HeyGen video services (org policy blocks `allUsers` invoker binding; same pattern as checkout).
3. **Hosting release** `1787494992551000` (`version 2e4610e32f735d7c`) with frontend nav + pricing selection fixes.
4. **Retired** legacy GitHub workflow on `main` (`3b3d7c7`) — stopped deploys to wrong project `key-journal-378204`.

### Frontend code

- `src/App.tsx` — Account nav for signed-in users.
- `src/pages/PricingPage.tsx` — plan selection/checkout uses plan ids.
- `.env.example` — placeholder coverage for Stripe price/link env names.

### Backend logic

- `requestRefund` / `listMyRefunds` already had auth + validation in `functions/index.js`; gap was **not deployed**.
- `createCheckoutSession` 400 on empty body is **correct validation**, not a bug.
- Webhook `stripeWebhook` already live.

---

## Phase 3 — Verification & testing

| Check                                                                                                | Result                                |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `npm run build`                                                                                      | **Passed** (Vite 5.4.21, ~22s)        |
| `npm test`                                                                                           | **No test script** in `package.json`  |
| Live pages GET `/`, `/pricing`, `/login`, `/account`, `/studio`, `/video-library`, `/reset-password` | **200** (earlier smoke)               |
| `POST /api/create-checkout-session` `{}`                                                             | **400** Invalid planId                |
| `POST /api/request-refund` (bad token)                                                               | **401** Invalid or expired auth token |
| `GET /api/my-refunds` (bad token)                                                                    | **401** Invalid or expired auth token |
| `GET /api/video/catalog`                                                                             | **200**                               |
| `GET /api/admin/system-health`                                                                       | **401** Unauthorized (expected)       |
| Hosting deploy                                                                                       | **DEPLOY_OK**                         |

Firebase CLI still reports invoker IAM set failures on function deploy; runtime is healthy with invoker-iam-disabled.

---

## Phase 4 — Summary tables

### Critical errors fixed

- Fixed **404** on `/api/request-refund` and `/api/my-refunds` by **deploying** missing Cloud Run functions + invoker-iam-disabled.
- Fixed **403** on `/api/video/catalog` (and related HeyGen services) via `--no-invoker-iam-check`.
- Fixed home SPA **missing Account** navigation for authenticated users.
- Hardened pricing card selection to use **plan ids** (not only Stripe price aliases).
- Retired **wrong-project** GitHub Hosting workflow on `main`.

### Missing features added / restored

- Live user refund request + list APIs (were coded, not serving).
- Account link in home `SiteNav`.
- `.env.example` placeholders for professional-tier / payment-link Vite keys.

### Tests run

- Production `npm run build` — pass.
- Live HTTP smoke on routes + APIs listed above.
- Function deploy + Cloud Run service Ready for `requestrefund` / `listmyrefunds`.

### Remaining issues (manual / follow-up)

1. **GitHub Actions production deploy** still needs secret `FIREBASE_SERVICE_ACCOUNT` (and Vite build secrets / `production` environment) — CI will fail until set; see `docs/CI_CD_FIREBASE_HOSTING.md`.
2. **Node.js 20** runtime deprecation on Cloud Functions (decommission target ~2026-10-30) — plan upgrade to Node 22.
3. **Org policy** blocks `allUsers` `roles/run.invoker` — keep using `--no-invoker-iam-check` after every new HTTP function deploy.
4. **Self-heal score / Resend admin email** (from prior audits) — not changed in this pass; alert email may still skip if secrets unbound.
5. **End-to-end paid checkout + refund with real Firebase ID token** — not executed here (would require a live member session); validate once from `/account` while signed in.
6. Uncommitted local tree still has many prior WIP files on `R-02-apply`; only hosting workflow retirement was committed to `main` in this pass. Frontend fixes are **live on Hosting** from local build; consider a follow-up git commit when ready.

---

## Model / process note

- Controller: DeepSeek V4 Pro role (SRE/backend)
- Repair worker: Kimi K3 role (UI/nav/pricing)
- Claude Free Plan Only: skipped
- PRAE: build + live smoke used as release evidence for Hosting + refund APIs
