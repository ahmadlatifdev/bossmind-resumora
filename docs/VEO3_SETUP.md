# Google Veo 3 (Vertex AI) — Setup & Deploy

Alternative to HeyGen for Resume Studio AI videos on **resumora.net** (`resumora-live`).

**Model:** `veo-3.1-fast-generate-001`  
**APIs:** `POST /api/video/google-generate`, `GET|POST /api/video/google-status`  
**Code:** `functions/veo.js`, `exports.generateGoogleVideo`, `exports.googleVideoStatus`

Do **not** paste service-account JSON, `sk_*`, or other secrets into chat/logs.

---

## One-shot automated setup (recommended)

```powershell
cd D:\BossMind\bossmind-resumora
powershell -ExecutionPolicy Bypass -File .\scripts\setup-veo.ps1
```

Flags:

- `-SkipDeploy` — IAM / bucket / secret only
- `-SkipKeyRotation` — reuse existing `VEO_SERVICE_ACCOUNT_KEY` (no new SA JSON key)

The script deploys **`generateGoogleVideo`** + **`googleVideoStatus`** (not `createCheckoutSession`).  
Do **not** run `gcloud run deploy createCheckoutSession --source .` — that targets the wrong service and packages the Vite app.

Env/secret names bound on Cloud Run:

- `VEO_SERVICE_ACCOUNT_KEY` ← Secret Manager
- `GCS_BUCKET_NAME=resumora-videos` (+ `VEO_OUTPUT_BUCKET` alias)

---

## Task 3 — Exact `gcloud` commands (manual / reference)

### 3.1 Service account + roles

```powershell
$PROJECT = "resumora-live"
$SA_ID = "veo-video-runner"
$SA_EMAIL = "$SA_ID@$PROJECT.iam.gserviceaccount.com"

gcloud config set project $PROJECT

gcloud iam service-accounts create $SA_ID `
  --display-name="Veo video runner" `
  --project=$PROJECT

gcloud projects add-iam-policy-binding $PROJECT `
  --member="serviceAccount:$SA_EMAIL" `
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding $PROJECT `
  --member="serviceAccount:$SA_EMAIL" `
  --role="roles/storage.objectAdmin"

# Also allow the Cloud Run / Functions default compute SA (ADC path — recommended)
$PROJECT_NUMBER = gcloud projects describe $PROJECT --format="value(projectNumber)"
$COMPUTE_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT `
  --member="serviceAccount:$COMPUTE_SA" `
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding $PROJECT `
  --member="serviceAccount:$COMPUTE_SA" `
  --role="roles/storage.objectAdmin"
```

### 3.2 JSON key → Secret Manager (optional if you use ADC only)

```powershell
$PROJECT = "resumora-live"
$SA_EMAIL = "veo-video-runner@$PROJECT.iam.gserviceaccount.com"
$KEY_FILE = "$env:TEMP\veo-video-runner-key.json"

# Create key once — store only in Secret Manager, then delete local file
gcloud iam service-accounts keys create $KEY_FILE `
  --iam-account=$SA_EMAIL `
  --project=$PROJECT

# Create / add secret version (value is the JSON file contents — never echo it)
gcloud secrets create VEO_SERVICE_ACCOUNT_JSON --project=$PROJECT --replication-policy=automatic 2>$null
gcloud secrets versions add VEO_SERVICE_ACCOUNT_JSON --project=$PROJECT --data-file=$KEY_FILE

# Remove local key file immediately
Remove-Item -Force $KEY_FILE

# Output bucket for Veo MP4s
gcloud storage buckets create "gs://$PROJECT-veo-videos" `
  --project=$PROJECT `
  --location=us-central1 `
  --uniform-bucket-level-access 2>$null
```

### 3.3 Bind secret + env on Cloud Run services

After Firebase deploy creates the services (or on update):

```powershell
$PROJECT = "resumora-live"
$REGION = "us-central1"

foreach ($svc in @("generategooglevideo", "googlevideostatus")) {
  gcloud run services update $svc `
    --project=$PROJECT `
    --region=$REGION `
    --no-invoker-iam-check `
    --update-env-vars="VEO_OUTPUT_BUCKET=$PROJECT-veo-videos,VEO_MODEL_ID=veo-3.1-fast-generate-001,VEO_LOCATION=us-central1" `
    --set-secrets="VEO_SERVICE_ACCOUNT_JSON=VEO_SERVICE_ACCOUNT_JSON:latest"
}
```

If you rely on **ADC only** (compute SA roles from 3.1), omit `--set-secrets` and skip 3.2.

---

## Task 4 — Deploy commands

### Backend (preferred: Firebase Functions codebase filter)

```powershell
cd D:\BossMind\bossmind-resumora\functions
npm install

cd D:\BossMind\bossmind-resumora
firebase deploy --only functions:resumora-checkout:generateGoogleVideo,functions:resumora-checkout:googleVideoStatus,hosting --project resumora-live

# Then apply invoker-iam-disabled (org policy blocks allUsers):
gcloud run services update generategooglevideo --project=resumora-live --region=us-central1 --no-invoker-iam-check
gcloud run services update googlevideostatus --project=resumora-live --region=us-central1 --no-invoker-iam-check
```

### Alternative: raw `gcloud run deploy` (not recommended for this Firebase codebase)

Firebase Gen2 services are built from the Functions codebase. Prefer `firebase deploy` above. If you must use Cloud Run source deploy, point at `functions/` with a proper Dockerfile — do **not** use `--source .` from the Vite app root.

### Frontend Hosting

```powershell
cd D:\BossMind\bossmind-resumora
npm run build
firebase deploy --only hosting --project resumora-live
# or: node scripts/deploy-hosting-api.mjs
```

---

## Paid-plan gate

`generateGoogleVideo` / `googleVideoStatus` require:

1. `Authorization: Bearer <Firebase ID token>`
2. Firestore `users/{uid}` with `planStatus` or `subscriptionStatus` = `active` (or `paid` / `serviceStatus=activated`)

---

## Studio UI

`/studio` → toggle **Google Veo 3** | **HeyGen**, prompt, optional reference image (Veo), generate → poll → play MP4.
