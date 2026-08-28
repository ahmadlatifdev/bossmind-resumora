# Seed Video Library (Firestore + GCS)

`/api/video/catalog` reads Firestore `videos` first. If empty / no `url_mp4_en`, it returns metadata-only fallback (no Google sample bucket).

## 1) Place masters

Copy EN masters into `public/videos/` (FR/ES optional):

```
vid-resume-writing.mp4
vid-ats-optimization.mp4
vid-linkedin-tips.mp4
vid-interview-prep.mp4
```

Or `vid-*-en.mp4` / `vid-*-fr.mp4` / `vid-*-es.mp4`.

## 2) Upload + seed

```powershell
cd D:\BossMind\bossmind-resumora
# Optional: $env:GCS_BUCKET_NAME = "<your-bucket-env>"
powershell -ExecutionPolicy Bypass -File .\scripts\seed-video-library.ps1
```

Manual upload equivalent:

```powershell
$Bucket = $env:GCS_BUCKET_NAME
if (-not $Bucket) { $Bucket = "resumora-videos" }
gcloud storage cp .\public\videos\vid-resume-writing.mp4 "gs://$Bucket/masters/vid-resume-writing-en.mp4" --project=resumora-live
gcloud storage cp .\public\videos\vid-ats-optimization.mp4 "gs://$Bucket/masters/vid-ats-optimization-en.mp4" --project=resumora-live
gcloud storage cp .\public\videos\vid-linkedin-tips.mp4 "gs://$Bucket/masters/vid-linkedin-tips-en.mp4" --project=resumora-live
gcloud storage cp .\public\videos\vid-interview-prep.mp4 "gs://$Bucket/masters/vid-interview-prep-en.mp4" --project=resumora-live
```

## 3) Hosting (captions under `/subtitles/*.vtt`)

```powershell
npm run build
firebase deploy --only hosting --project resumora-live
```

## 4) Verify

```powershell
curl.exe https://resumora.net/api/video/catalog
# Expect: "source":"firestore" and https url_mp4_en values
```

Captions are generated in `public/subtitles/` (12 WebVTT files). FR/ES dubbed MP4s can be filled later by the video-localizer pipeline (`url_mp4_fr` / `url_mp4_es`).
