# Video Library masters + Firestore seed — command sheet

Do not print `sk_*`, `whsec_*`, `pk_*`, or `price_*` values.

## 1) Generate EN masters (Veo 3)

HTTP mode (preferred when functions are live) — paid-plan Firebase ID token required:

```powershell
cd D:\BossMind\bossmind-resumora
$env:FIREBASE_ID_TOKEN = '<paid-plan-firebase-id-token>'   # do not commit / paste into chat
node .\scripts\generate-resumora-masters.js
```

Direct Vertex mode (no Hosting rewrite required):

```powershell
cd D:\BossMind\bossmind-resumora
node .\scripts\generate-resumora-masters.js --direct
```

Outputs:

- `public/videos/vid-resume-writing.mp4`
- `public/videos/vid-ats-optimization.mp4`
- `public/videos/vid-linkedin-tips.mp4`
- `public/videos/vid-interview-prep.mp4`

Veo clip length is **8s max** (API limit), even if prompts say 60s.

## 2) Seed Firestore `videos`

Upload to GCS + write docs (default):

```powershell
cd D:\BossMind\bossmind-resumora
node .\scripts\seed-firestore-videos.js
```

Or Hosting URLs only (after MP4s are on Hosting):

```powershell
node .\scripts\seed-firestore-videos.js --hosting-urls --skip-upload
```

PowerShell equivalent (existing):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\seed-video-library.ps1
```

`/api/video/catalog` already prefers Firestore when docs have `https` `url_mp4_en` (`functions/heygen.js`).

## 3) Build + Hosting deploy

```powershell
cd D:\BossMind\bossmind-resumora
npm run build
firebase deploy --only hosting --project resumora-live
```

## 4) Verify

```powershell
curl.exe https://resumora.net/api/video/catalog
# Expect: "source":"firestore"
```
