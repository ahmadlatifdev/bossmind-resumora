# Stripe checkout — production validation (Resumora)

This document **does not** replace Stripe’s own testing or a live payment. It maps **in-repo** behavior and the **commands** that prove configuration.

## Architecture (as shipped)

| Step | Implementation |
|------|----------------|
| Client | `useStripeCheckout` in `lib/marketing/client-hooks.js` — requires **signed-in** user (`/api/engagement/stats`); else redirects to `/register?plan=…` |
| Session | `POST /api/checkout` — `mode: "payment"`, **one-time** prices only (`stripe.checkout.sessions.create`) |
| Prices | `NEXT_PUBLIC_STRIPE_PRICE_BASIC` / `PRO` / `ELITE` via `lib/marketing/stripe-plan-map.js` |
| Success | `/success?session_id=…` → `GET /api/verify-session` — logs `stripe_checkout_paid` to Neon **once** per session |
| Webhook | `POST /api/webhooks/stripe` — signature verify, **`event_log` idempotency** on Stripe `event.id` |
| Diagnostics | `GET /api/stripe/status` — **dev or** `BOSSMIND_DIAGNOSTICS=1` only (no secret leakage) |

## Subscription note

**There is no subscription checkout.** `/api/checkout` **rejects** non–`one_time` Stripe prices. “Elite/Premium” tiers are **one-time payments** aligned with current product copy.

## Automated evidence report (local)

```bash
npm run bossmind:stripe:production-report
BOSSMIND_STRIPE_STRICT=1 npm run bossmind:stripe:production-report
```

Optional remote JSON (only if the server exposes diagnostics):

```text
BOSSMIND_STRIPE_PROBE_ORIGIN=https://resumora.net
```

(Requires `BOSSMIND_DIAGNOSTICS=1` on that host for `/api/stripe/status` to return 200.)

## Required environment (names only)

See `config/bossmind-env-structure.example.txt` and `lib/marketing/stripe-env-audit.js`:

- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_STRIPE_PRICE_BASIC` / `PRO` / `ELITE`
- `STRIPE_WEBHOOK_SECRET` (`whsec_…`)

## Manual production confirmation

1. Webhook URL in Stripe Dashboard: `https://resumora.net/api/webhooks/stripe` (or your canonical origin).  
2. Complete a **test** checkout while signed in; confirm redirect and `stripe_webhook.*` + `stripe_checkout_paid` in Neon `event_log`.  
3. Confirm **live** keys only on production Render service; test keys on preview/staging.

## Anti-loop / security

- Webhook duplicate deliveries: **200 + `duplicate: true`** without second `event_log` insert.  
- Secrets never returned from `/api/stripe/status` — boolean/format flags only.
