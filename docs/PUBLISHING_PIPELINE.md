# Resumora publishing pipeline (GCP / Firebase only)

Complete flow for the 4 master videos across YouTube, TikTok, Instagram, Facebook,
LinkedIn, X, and Bilibili.

## Components

| Piece                                        | Path                                                       |
| -------------------------------------------- | ---------------------------------------------------------- |
| Transform (9:16 / 16:9 / thumbs / captions)  | `scripts/prepare-platform-videos.mjs`                      |
| Seed masters + `videos` + `publishing_queue` | `scripts/seed-publishing-pipeline.mjs`                     |
| Firestore trigger worker                     | `functions/publishToSocial.js` → `exports.publishToSocial` |
| GCS distribute helper                        | `functions/mediaDistribute.js` → `distributeMasterVideo`   |
| Bilibili uploader                            | `functions/bilibiliPublish.js`                             |
| i18n titles/tags                             | `locales/{en,fr,es}.json` → `publish.vid-*.*`              |

## 1) Secrets (Secret Manager — never commit values)

```powershell
$PROJECT = "resumora-live"

# Required for Bilibili auto-publish
foreach ($s in @('BILIBILI_SESSDATA','BILIBILI_BILI_JCT','BILIBILI_DEDE_USER_ID')) {
  gcloud secrets describe $s --project=$PROJECT 2>$null
  if ($LASTEXITCODE -ne 0) {
    gcloud secrets create $s --project=$PROJECT --replication-policy=automatic
  }
  # Then: echo -n "VALUE" | gcloud secrets versions add $s --project=$PROJECT --data-file=-
}

# Optional — create when OAuth apps are ready (YouTube / Meta / LinkedIn)
# YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
# META_PAGE_ACCESS_TOKEN, META_PAGE_ID
# LINKEDIN_ACCESS_TOKEN, LINKEDIN_ORG_ID
# TIKTOK_ACCESS_TOKEN, X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN
```

Grant runtime SA `roles/secretmanager.secretAccessor` on each secret.

## 2) Deploy functions

```powershell
cd D:\BossMind\bossmind-resumora

firebase deploy --only "functions:resumora-checkout:publishToSocial,functions:resumora-checkout:distributeMasterVideo,functions:resumora-checkout:publishVideoToBilibili" --project resumora-live

foreach ($svc in @('publishtosocial','distributemastervideo','publishvideotobilibili')) {
  gcloud run services update $svc --project=resumora-live --region=us-central1 --no-invoker-iam-check --quiet
}
```

Optional YouTube/Meta/LinkedIn env on the `publishtosocial` service (after secrets exist):

```powershell
gcloud run services update publishtosocial --project=resumora-live --region=us-central1 `
  --set-secrets=YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest,YOUTUBE_REFRESH_TOKEN=YOUTUBE_REFRESH_TOKEN:latest `
  --no-invoker-iam-check --quiet
```

## 3) Seed 4 masters + queue

Place MP4s in `public/videos/` then:

```powershell
# Upload masters, write Firestore videos/*, create publishing_queue (status=pending)
node .\scripts\seed-publishing-pipeline.mjs

# Or also ffmpeg-transform + upload distribute-outbox (requires ffmpeg):
node .\scripts\seed-publishing-pipeline.mjs --prepare
```

Creating a `publishing_queue` doc with `status: "pending"` triggers **`publishToSocial`**.

Final statuses: `published` | `partial` | `awaiting_credentials` | `failed`.

## 4) Frontend

```powershell
npm run build
firebase deploy --only hosting --project resumora-live
```

Set `VITE_SOCIAL_*` profile URLs in Hosting build env for footer icons.

## Bilibili AI Voice / translation

Cookie upload cannot toggle Bilibili’s in-app AI Voice switch. After publish, enable
**AI translation / AI Voice** once in Creator Studio. Queue docs include
`bilibiliAiVoiceNote` as an ops reminder.

## Security

Never print or commit: `SESSDATA`, `bili_jct`, `DedeUserID`, `sk_live_`, `whsec_`, `pk_live_`, `price_` IDs.
