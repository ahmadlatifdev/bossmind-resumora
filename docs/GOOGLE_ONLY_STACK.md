# Google-Only Consolidation (Resumora)

**Status:** Active policy  
**Public site:** `https://resumora.net`  
**Hosting:** Firebase Hosting `client-resumora-live` only  
**API region:** `us-central1` (Cloud Functions gen2 → Cloud Run)

## Component map

| Component              | Google surface                                          | Not allowed                       |
| ---------------------- | ------------------------------------------------------- | --------------------------------- |
| Static UI (Vite build) | Firebase Hosting                                        | Vercel, Netlify, Cloudflare Pages |
| `/api/*`               | Firebase Functions → Cloud Run                          | External PaaS                     |
| Secrets                | GCP Secret Manager (`defineSecret`)                     | Vercel Env UI                     |
| Cron                   | Firebase `onSchedule` + Cloud Scheduler mirrors         | Vercel Cron                       |
| AI                     | Vertex AI `us-central1` (ADC) + optional Gemini API key | Non-Google AI hosts as primary    |
| Payments               | Stripe API with keys in Secret Manager                  | —                                 |

## Secrets (Secret Manager)

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ADMIN_REFUND_PASSWORD`
- `GEMINI_API_KEY` (optional when Vertex ADC is enabled)

Non-secret runtime env (Cloud Run): `CHECKOUT_SESSION_PREFIX`, `STRIPE_PRICE_*`, `VERTEX_AI=true`.

## Ops scripts

```bash
# Mirror crons into Cloud Scheduler
node scripts/create-gcp-scheduler.mjs
node scripts/create-gcp-scheduler.mjs --apply

# Remount secrets / env onto Cloud Run (gated)
# SELF_HEAL_ALLOW_GCLOUD=true node scripts/ops-auto-heal-resync.cjs --apply
```

## AI

Set `VERTEX_AI=true` (or `GOOGLE_GENAI_USE_VERTEXAI=true`) on Functions. Runtime uses Vertex REST in `us-central1` via Application Default Credentials — **no new npm SDK required** (constraint: no new libraries). Falls back to Gemini Developer API when Vertex is off and `GEMINI_API_KEY` is present.

## Deploy path

Git push → GitHub Actions → Firebase Hosting + Functions. Do not `firebase deploy` / `gcloud run deploy` from local agents for production.
