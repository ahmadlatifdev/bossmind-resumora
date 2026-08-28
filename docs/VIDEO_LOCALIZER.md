# Global Video Localizer — Resumora integration

Open-source dubbing for the 4 Video Library masters into **FR** and **ES** using:

- **Whisper** (transcription)
- **deep-translator** (translation — free)
- **EdgeTTS** (voice — free; ElevenLabs optional / unused by default)
- **ffmpeg / MoviePy** (mux)

Upstream: [MCP-1st-Birthday/video-dubber](https://huggingface.co/spaces/MCP-1st-Birthday/video-dubber) (MIT) — vendored as `services/video-localizer/localizer_engine.py`.

Expect **2–5 minutes per 1 minute of video** on CPU.

---

## Layout

| Path                                            | Role                                                 |
| ----------------------------------------------- | ---------------------------------------------------- |
| `services/video-localizer/`                     | Cloud Run Python worker + Dockerfile                 |
| `functions/videoLocalizer.js`                   | Node proxy                                           |
| `exports.localizeVideo` / `localizeVideoStatus` | `/api/video/localize` + `/api/video/localize-status` |
| `VideoCard`                                     | FR/ES “Coming soon” / localized badges               |

Env (never commit values):

- `VIDEO_LOCALIZER_URL` — Cloud Run service URL
- `LOCALIZER_SHARED_SECRET` — shared bearer between Functions ↔ worker
- `GCS_BUCKET_NAME` — output bucket (e.g. `resumora-videos`)

---

## Deploy Cloud Run worker

```powershell
$PROJECT = "resumora-live"
$REGION = "us-central1"
$SERVICE = "video-localizer"
$BUCKET = "resumora-videos"   # do not print secret material; bucket name is OK for ops
$SECRET = (New-Guid).Guid.Replace("-","").Substring(0,32)

# Store shared secret (example — use Secret Manager in production)
gcloud secrets create LOCALIZER_SHARED_SECRET --project=$PROJECT --replication-policy=automatic 2>$null
# Write secret from a temp file, then delete the file (do not echo):
# Set-Content ... ; gcloud secrets versions add LOCALIZER_SHARED_SECRET --data-file=...

cd D:\BossMind\bossmind-resumora\services\video-localizer

gcloud run deploy $SERVICE `
  --project=$PROJECT `
  --region=$REGION `
  --source=. `
  --allow-unauthenticated `
  --cpu=4 `
  --memory=8Gi `
  --timeout=3600 `
  --concurrency=1 `
  --max-instances=2 `
  --cpu-boost `
  --no-cpu-throttling `
  --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT,GCS_BUCKET_NAME=$BUCKET,FORCE_EDGE_TTS=1,WHISPER_MODEL=base" `
  --set-secrets="LOCALIZER_SHARED_SECRET=LOCALIZER_SHARED_SECRET:latest"

# Grant runtime SA storage + firestore
$PROJECT_NUMBER = gcloud projects describe $PROJECT --format="value(projectNumber)"
$RUNTIME_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$RUNTIME_SA" --role="roles/storage.objectAdmin"
gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$RUNTIME_SA" --role="roles/datastore.user"

# After deploy, copy the service URL into Functions env:
# VIDEO_LOCALIZER_URL=https://video-localizer-XXXX-uc.a.run.app
```

Machine type note: Cloud Run uses **vCPU allocation** (not classic GCE E2/N2 names). For heavy Whisper work use **`--cpu=4 --memory=8Gi --no-cpu-throttling`**. For GCE VM workers instead, prefer `e2-standard-4` or `n2-standard-4`.

Smoke check after deploy (do **not** use `/healthz` — Cloud Run reserves paths ending in `z`):

```powershell
curl.exe https://YOUR_LOCALIZER_URL/health
```

One-shot helper:

```powershell
powershell -ExecutionPolicy Bypass -File D:\BossMind\bossmind-resumora\scripts\deploy-video-localizer.ps1
```

---

## Deploy Firebase Functions + Hosting

```powershell
cd D:\BossMind\bossmind-resumora
firebase deploy --only functions:resumora-checkout:localizeVideo,functions:resumora-checkout:localizeVideoStatus --project resumora-live
gcloud run services update localizevideo --project=resumora-live --region=us-central1 --no-invoker-iam-check `
  --update-env-vars="VIDEO_LOCALIZER_URL=https://YOUR_LOCALIZER_URL" `
  --set-secrets="LOCALIZER_SHARED_SECRET=LOCALIZER_SHARED_SECRET:latest"
gcloud run services update localizevideostatus --project=resumora-live --region=us-central1 --no-invoker-iam-check `
  --update-env-vars="VIDEO_LOCALIZER_URL=https://YOUR_LOCALIZER_URL" `
  --set-secrets="LOCALIZER_SHARED_SECRET=LOCALIZER_SHARED_SECRET:latest"

npm run build
firebase deploy --only hosting --project resumora-live
```

---

## Manually localize the 4 library videos

Requires paid-plan Firebase ID token and `url_mp4_en` on each Firestore `videos/{id}` (or pass `sourceUrl`).

```powershell
$TOKEN = "<firebase-id-token>"
$BASE = "https://resumora.net"
$ids = @(
  "vid-resume-writing",
  "vid-ats-optimization",
  "vid-linkedin-tips",
  "vid-interview-prep"
)
foreach ($id in $ids) {
  foreach ($lang in @("fr","es")) {
    Invoke-RestMethod -Method POST -Uri "$BASE/api/video/localize" `
      -Headers @{ Authorization = "Bearer $TOKEN"; "Content-Type" = "application/json" } `
      -Body (@{ videoId = $id; targetLanguage = $lang } | ConvertTo-Json)
  }
}
# Poll: GET /api/video/localize-status?jobId=...
```

When a job completes, Firestore gets `url_mp4_fr` / `url_mp4_es` and the Video Library loads distinct files; until then FR/ES show the **Coming soon** badge and fall back to English audio.
