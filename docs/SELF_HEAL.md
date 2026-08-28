# Resumora Self-Healing (MAPE-K)

Production control loop for **resumora.net**: Monitor → Analyze → Plan → Execute → Knowledge, with a **Guardian** verification gate and **human approval** for critical actions.

## What auto-runs (SAFE)

- Hosting probes (`/`, `/pricing`, `/login`, checkout OPTIONS)
- Firestore heartbeat on `system_health/current`
- Stripe API probe (prices.list — never logs full `price_` / `sk_` values)
- Env **prefix** validation only (`sk_live_` / `sk_test_`, `pk_*`, `whsec_`, `price_`)
- Endpoint warmup (Reflexion retry on latency / soft failures)
- Incident + remediation history in Firestore

## What requires human approval (CRITICAL)

- Cloud Run restart proposals
- Hosting / CDN purge or redeploy proposals
- Env / secret drift rollback proposals
- Post-Guardian automatic rollback proposals

Approving a ticket **authorizes the ops runbook** — the agent **never rewrites secret values** or `.env.local` from Cloud Functions.

## Admin UI

- https://resumora.net/admin/system-health
- Auth: same `ADMIN_REFUND_PASSWORD` via `X-Admin-Password`

## Env (Cloud Functions / Cloud Run — names only)

| Key                                             | Purpose                |
| ----------------------------------------------- | ---------------------- |
| `ADMIN_REFUND_PASSWORD`                         | Admin API gate         |
| `STRIPE_API_KEY` (secret)                       | Guardian Stripe probe  |
| `RESEND_API_KEY` / `EMAIL_API_KEY`              | Email HITL notify      |
| `ADMIN_NOTIFY_EMAIL` / `SELF_HEAL_ADMIN_EMAIL`  | Notify recipient       |
| `SELF_HEAL_SLACK_WEBHOOK` / `SLACK_WEBHOOK_URL` | Optional Slack         |
| `SELF_HEAL_ALLOW_RESTART`                       | Flag only (still HITL) |
| `SELF_HEAL_ALLOW_CDN_PURGE`                     | Flag only (still HITL) |

## Deploy functions + rules + scheduler

Firebase Functions v2 `onSchedule('every 5 minutes')` creates the Cloud Scheduler job automatically on deploy:

```bash
cd D:\BossMind\bossmind-resumora
npm run build
firebase deploy --only functions:selfHealMonitor,functions:getSystemHealth,functions:runSystemHealth,functions:decideSystemHeal,functions:reportClientError,firestore:rules,hosting --project resumora-live
```

Or deploy the whole functions codebase:

```bash
firebase deploy --only functions,firestore:rules,hosting --project resumora-live
```

### gcloud (verify / inspect scheduler)

```bash
gcloud config set project resumora-live

# List scheduler jobs created for Functions v2
gcloud scheduler jobs list --location=us-central1

# Describe the self-heal job (name includes selfHealMonitor)
gcloud scheduler jobs describe firebase-schedule-selfHealMonitor-us-central1 --location=us-central1

# Force one run
gcloud scheduler jobs run firebase-schedule-selfHealMonitor-us-central1 --location=us-central1
```

### Ops runbooks after HITL approve

```bash
# Cloud Run / Functions revision (example — use the failing service name from console)
gcloud run services update SERVICE_NAME --region=us-central1 --project=resumora-live

# Hosting cache effectively cleared by new release
npm run build
node scripts/deploy-hosting-api.mjs

# Env / secrets: update via Secret Manager / Cloud Run env — never paste full keys into chat
firebase functions:secrets:set STRIPE_API_KEY --project resumora-live
```

## APIs

| Method | Path                              | Auth                       |
| ------ | --------------------------------- | -------------------------- |
| GET    | `/api/admin/system-health`        | `X-Admin-Password`         |
| POST   | `/api/admin/system-health/run`    | `X-Admin-Password`         |
| POST   | `/api/admin/system-health/decide` | `X-Admin-Password`         |
| POST   | `/api/client-error`               | public (message/path only) |
