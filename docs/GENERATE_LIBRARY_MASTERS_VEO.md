# Generate Video Library masters with Veo 3

Creates:

- `public/videos/vid-resume-writing.mp4`
- `public/videos/vid-ats-optimization.mp4`
- `public/videos/vid-linkedin-tips.mp4`
- `public/videos/vid-interview-prep.mp4`

Uses `functions/veo.js` (same stack as Studio Google Veo 3).

**Limit:** Veo clips are max **8 seconds** (not the 5:00 library target). Use these as EN placeholders / teasers, then replace with full HeyGen masters when available.

## Preconditions

1. Billing / Vertex must be allowed on `resumora-live` (if you see `Lightning dunning decision is deny`, fix Cloud Billing first).
2. Bucket name via env (no secret values in chat):
   - `$env:GCS_BUCKET_NAME` or `$env:VEO_OUTPUT_BUCKET` (defaults to `resumora-videos`)
3. Org policy may block SA key creation — local mode uses `gcloud auth print-access-token` (no key file).

## Generate (recommended — direct)

```powershell
cd D:\BossMind\bossmind-resumora
node .\scripts\generate-resumora-masters.js
```

One video only:

```powershell
node .\scripts\generate-resumora-masters.js --only=vid-resume-writing
```

Alias / older wrapper:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\generate-library-masters-veo.ps1
```

## HTTP mode (after functions deployed)

```powershell
# Paid-plan Firebase ID token — do not commit or paste into chat logs
$env:FIREBASE_ID_TOKEN = '<token>'
node .\scripts\generate-library-masters-veo.cjs --http
```

Deploy Veo functions (when ready):

```powershell
firebase deploy --only functions:resumora-checkout:generateGoogleVideo,functions:resumora-checkout:googleVideoStatus --project resumora-live
gcloud run services update generategooglevideo --project=resumora-live --region=us-central1 --no-invoker-iam-check
gcloud run services update googlevideostatus --project=resumora-live --region=us-central1 --no-invoker-iam-check
```

## After files exist

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\seed-video-library.ps1
npm run build
firebase deploy --only hosting --project resumora-live
```
