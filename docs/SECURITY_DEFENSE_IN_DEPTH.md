# Defense in Depth — resumora-live

Three-level security framework for **resumora.net** (Firebase Hosting, Cloud Run, Firestore, GitHub Actions OIDC).

| Level | Focus                 | Automation                                                       |
| ----- | --------------------- | ---------------------------------------------------------------- |
| **1** | Edge & application    | `scripts/setup-security.ps1`, `firebase.json` headers, App Check |
| **2** | Identity & zero-trust | `firestore.rules`, Cloud Run IAP (manual GCP)                    |
| **3** | Data & monitoring     | SCC, audit logs, Admin dashboard alerts                          |

---

## Level 1 — Edge & Application Protection

### Cloud Armor (gcloud)

Run via `scripts/setup-security.ps1` or manually:

```powershell
$PROJECT = "resumora-live"
$POLICY = "resumora-edge-policy"

gcloud compute security-policies create $POLICY `
  --project=$PROJECT `
  --description="Resumora edge WAF/DDoS for resumora.net"

# Default allow (priority 1000)
gcloud compute security-policies rules create 1000 `
  --project=$PROJECT `
  --security-policy=$POLICY `
  --expression="true" `
  --action=allow `
  --description="Default allow"

# Geo deny example — ISO 3166-1 alpha-2 (adjust for your threat model)
gcloud compute security-policies rules create 900 `
  --project=$PROJECT `
  --security-policy=$POLICY `
  --expression="origin.region_code == 'CN' || origin.region_code == 'RU'" `
  --action=deny-403 `
  --description="Geo deny list"

# L7 DDoS / adaptive protection
gcloud compute security-policies update $POLICY `
  --project=$PROJECT `
  --enable-layer7-ddos-defense
```

**Attach policy** to an external HTTPS load balancer backend service when routing traffic to Cloud Run (Firebase Hosting CDN already provides baseline DDoS; Armor applies to LB-backed backends).

### Firebase App Check (reCAPTCHA Enterprise)

```powershell
cd D:\BossMind\bossmind-resumora
$env:APP_CHECK_RISK_THRESHOLD = "0.5"
node scripts/setup-app-check.mjs
```

Store the site key in GitHub Actions secret `VITE_FIREBASE_APP_CHECK_SITE_KEY` (never commit the value).

Enforcement: Firebase Console → App Check → Web app → Enforcement **ON**, score threshold **0.5**.

### Security headers

Deployed automatically via `firebase.json` hosting headers (HSTS, `nosniff`, `X-Frame-Options`). CI validates with:

```powershell
node scripts/ci/verify-security-headers.mjs
```

---

## Level 2 — Identity & Zero-Trust

### Cloud Run IAP (admin / internal functions)

Protect sensitive Cloud Run services (e.g. `getsystemhealth`, `runsystemhealth`) behind Identity-Aware Proxy:

1. **Enable IAP API**

   ```powershell
   gcloud services enable iap.googleapis.com --project=resumora-live
   ```

2. **Configure OAuth consent screen** (GCP Console → APIs & Services → OAuth consent screen).

3. **Enable IAP on each Cloud Run service** (example):

   ```powershell
   gcloud run services update getsystemhealth `
     --project=resumora-live `
     --region=us-central1 `
     --no-invoker-iam-check `
     --iap
   ```

   Or attach IAP to the **load balancer** backend that fronts the service.

4. **Grant `roles/iap.httpsResourceAccessor`** to admin Google accounts / groups only.

5. **Service-to-service**: use OIDC ID tokens from the calling service account (`Authorization: Bearer $(gcloud auth print-identity-token --audiences=URL)`).

Public endpoints (`createcheckoutsession`, `stripewebhook`, `videocatalog`) remain `--no-invoker-iam-check` with App Check + Armor at edge.

### Firestore rules

`firestore.rules` enforces:

- `users/{uid}` — owner read/write only
- `chats/{chatId}` + `messages` — participants only
- All other collections — **deny** (Admin SDK / Cloud Functions only)

Deploy via CI:

```powershell
firebase deploy --only firestore:rules --project resumora-live --non-interactive
```

---

## Level 3 — Data & Monitoring

### Security Command Center (Standard)

```powershell
gcloud services enable securitycenter.googleapis.com --project=resumora-live

gcloud scc settings services enable eventthreatdetection --project=resumora-live
gcloud scc settings services enable securityhealthanalytics --project=resumora-live
gcloud scc settings services enable websecurityscanner --project=resumora-live
```

Or run: `powershell -ExecutionPolicy Bypass -File .\scripts\setup-security.ps1`

### Event Threat Detection & Data Access logs

`setup-security.ps1` enables **DATA_READ** / **DATA_WRITE** audit logs for:

- `firestore.googleapis.com`
- `run.googleapis.com`
- `cloudfunctions.googleapis.com`

### Admin dashboard — SCC critical alert

1. Set GitHub secret `SECURITY_ALERT_WEBHOOK` (Slack/email gateway URL — same pattern as `DEPLOY_ALERT_WEBHOOK`).
2. Self-heal monitor surfaces finding code `scc_critical_finding` when critical log sink events are detected.
3. View on **https://resumora.net/admin/system-health** under Security findings.

---

## CI/CD (Zero Manual Terminal Deploy)

| Step                                          | When                                              |
| --------------------------------------------- | ------------------------------------------------- |
| `node scripts/ci/verify-security-headers.mjs` | Every PR / deploy build                           |
| `firebase deploy --only firestore:rules`      | Production deploy job                             |
| `scripts/setup-security.ps1`                  | One-time / `workflow_dispatch` infra provisioning |

Never commit secrets. Use GitHub Secrets and GCP Secret Manager only.
