# Multi-trigger Refund System

## Triggers

1. **System** — `checkout.session.completed` → `pending_approval` if service not provided
2. **User** — `POST /api/request-refund` with Firebase Bearer token (Account → Request Refund)
3. **Admin** — `/admin/refunds` approve / reject
4. **Auto** — `autoApproveStaleRefunds` daily 09:00 America/Toronto after **10 business days** (weekends + holidays) when `service_provided` is still false

## Client UI

- https://resumora.net/account

## Deploy

```powershell
cd D:\BossMind\bossmind-resumora
npm run build
firebase deploy --only hosting --project resumora-live
# fallback:
node scripts/deploy-hosting-api.mjs

$env:GOOGLE_CLOUD_QUOTA_PROJECT = 'resumora-live'
$token = (gcloud auth print-access-token)
firebase deploy --only functions:requestRefund,functions:listMyRefunds,functions:listRefundRequests,functions:decideRefundRequest,functions:autoApproveStaleRefunds,functions:stripeWebhook,firestore:rules --project resumora-live --token $token

# If function filter fails, deploy all functions:
firebase deploy --only functions,firestore:rules --project resumora-live --token $token

# After create, disable invoker IAM if org policy blocks allUsers (same as other APIs):
gcloud run services update requestrefund --region=us-central1 --project=resumora-live --no-invoker-iam-check
gcloud run services update listmyrefunds --region=us-central1 --project=resumora-live --no-invoker-iam-check

gcloud scheduler jobs describe firebase-schedule-autoApproveStaleRefunds-us-central1 --location=us-central1 --project=resumora-live
```

Env (names only): `STRIPE_API_KEY`, `RESEND_API_KEY` / `EMAIL_API_KEY`, `ADMIN_NOTIFY_EMAIL` (defaults toward info@resumora.net), `ADMIN_REFUND_PASSWORD`.
