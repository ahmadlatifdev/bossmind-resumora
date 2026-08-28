# Firestore collections (Resumora client)

## users

- `uid`, `email`, `fullName`, `createdAt`, `updatedAt`
- `stripeCustomerId` — created/reused by `createCheckoutSession`
- `plan` / `planId` — e.g. `basic` | `balanced` | `professional` | `advanced`
- `planStatus` / `subscriptionStatus` — `pending` | `active`
- `purchaseDate` — set on `checkout.session.completed`
- Client registration upserts profile; Stripe webhook / Admin SDK set paid fields
- Clients can only read/write their own `users/{uid}` (see `firestore.rules`)

## videos

- video_id, title_EN, title_FR, title_ES, description_EN, description_FR, description_ES
- duration (300), url_mp4_en/fr/es, thumbnail, order

## user_downloads

- user_id, video_id, downloaded_at, language
- Client enforces max 5; mirrors to this collection when rules allow

## user_plans

- user_id, plan_type, amount, status, created_at

## refund_requests

Manual + user + auto refund workflow:

- `status`: `pending_approval` | `refunded` | `rejected`
- `request_type`: `system` (checkout) | `user` (client Request Refund)
- `service_provided` boolean — auto-refund only when false after 10 business days
- `request_date` / `createdAt` used for grace period
- Stripe refunds use idempotency key `refund_{requestId}`
- Client APIs: `POST /api/request-refund`, `GET /api/my-refunds` (Bearer Firebase ID token)
- Admin: `/admin/refunds` + `X-Admin-Password`
- Scheduler: `autoApproveStaleRefunds` daily 09:00 America/Toronto

## support_tickets

Inbound support for `info@resumora.net` (Resend webhook → Cloud Function `supportWebhook`):

- Authorized registered customers only (Auth email / `users.email`)
- AI drafts policy-grounded replies; **human approval required** before customer send
- `status`: `received` | `draft_pending_approval` | `escalated` | `sent` | `rejected`
- Labels may include `Human Review Required` (refunds/cancels or ≥2 AI attempts)
- Admin decide: `POST /api/admin/support/decide` with `X-Admin-Password`
- Client SDK: **no access** (Admin SDK / Functions only)

## users (refund-related fields)

- `serviceProvided` / `serviceActivated` / `serviceStatus` (`provided`|`activated`|`delivered`) — when true, no pending refund is queued

## system_health

MAPE-K self-healing knowledge store (Admin SDK / Functions only):

- Doc `current`: `score` (0–100), `status`, `findings`, `lastObservations`, `lastGuardian`, `activeRemediations`, `cycleId`, `updatedAt`
- Updated every 5 minutes by scheduled function `selfHealMonitor`

## system_incidents / system_remediations / system_heal_approvals

- Incident + remediation history; critical actions require `pending_approval` → admin decide
- Client SDK: **no access**

## system_client_errors

- Optional frontend error ingest via `reportClientError` (message/path only — no secrets)

## notification_history

- Deduped alert log for self-heal score alerts + Stripe KYC reminders
- Docs may use stable ids (`health_score_low`, `stripe_kyc_payouts`) plus auto-id audit rows
- Client SDK: **no access**

## system_health.stripeAccount

- Written daily by `stripeKycMonitor`: `payoutsEnabled`, `kycPending`, `needsAttention`, requirement counts (no owner PII)

Admin UI: `/admin/system-health` · APIs under `/api/admin/system-health*`

Client code in `src/lib/userAccess.js` writes `user_downloads` when Firestore rules permit, and always keeps a localStorage mirror for anonymous clients.
