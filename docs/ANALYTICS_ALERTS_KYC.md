# GA4 + Health Alerts + Stripe KYC Monitor

## 1) Google Analytics 4

Client env (Vite — measurement IDs are public `G-…` values):

```env
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

Also accepted: `VITE_FIREBASE_MEASUREMENT_ID`.

Implementation: `src/lib/analytics.js`  
Wired in: `App.tsx` (SPA page views), `PricingPage`, `videos-main`, plan `select_item`, video `video_start`.  
Privacy: no email / uid / name / `price_` IDs sent.

## 2) Real-time system health alerts

On each `selfHealMonitor` cycle (every 5 minutes):

- If score **&lt; 70** (override with `SELF_HEAL_ALERT_THRESHOLD`) **or** Guardian fails → Slack webhook and/or Resend email
- Deduped in Firestore `notification_history` (default cooldown 6h via `SELF_HEAL_ALERT_COOLDOWN_MS`)
- Alert body includes findings, timestamp, and https://resumora.net/admin/system-health

Env (Cloud Functions / Secret Manager — names only):

- `RESEND_API_KEY` or `EMAIL_API_KEY`
- `SELF_HEAL_ADMIN_EMAIL` / `ADMIN_NOTIFY_EMAIL` (defaults toward `info@resumora.net`)
- `SLACK_WEBHOOK_URL` or `SELF_HEAL_SLACK_WEBHOOK`

## 3) Stripe KYC / payouts reminder

Scheduled function `stripeKycMonitor` — **every day 08:00 America/Toronto**

- Calls Stripe `accounts.retrieve()` (no secret values logged)
- Writes `system_health/current.stripeAccount`
- If `payouts_enabled === false` or KYC requirements pending → email/Slack + persistent admin banner
- Clears banner / marks notify doc resolved when healthy again

## Deploy

### Frontend

```powershell
cd D:\BossMind\bossmind-resumora
# Ensure VITE_GA_MEASUREMENT_ID is set in .env.local (G-… only)
npm run build
firebase deploy --only hosting --project resumora-live
# fallback:
node scripts/deploy-hosting-api.mjs
```

### Functions + Firestore rules

```powershell
$env:GOOGLE_CLOUD_QUOTA_PROJECT = 'resumora-live'
$token = (gcloud auth print-access-token)
firebase deploy --only functions,firestore:rules --project resumora-live --token $token
```

Then disable invoker IAM on new HTTP services if org policy blocks `allUsers` (same pattern as checkout):

```powershell
gcloud run services update getsystemhealth --region=us-central1 --project=resumora-live --no-invoker-iam-check
```

### Scheduler (created automatically by Functions v2 `onSchedule`)

```powershell
gcloud scheduler jobs list --location=us-central1 --project=resumora-live

gcloud scheduler jobs describe firebase-schedule-selfHealMonitor-us-central1 --location=us-central1 --project=resumora-live
gcloud scheduler jobs describe firebase-schedule-stripeKycMonitor-us-central1 --location=us-central1 --project=resumora-live

# Force a run
gcloud scheduler jobs run firebase-schedule-selfHealMonitor-us-central1 --location=us-central1 --project=resumora-live
gcloud scheduler jobs run firebase-schedule-stripeKycMonitor-us-central1 --location=us-central1 --project=resumora-live
```

### Optional: set secrets (values never printed here)

```powershell
# Example pattern only — paste values in your terminal, not in chat
firebase functions:secrets:set STRIPE_API_KEY --project resumora-live
# RESEND / Slack: set as Cloud Run env or Secret Manager bindings for the function services
```
