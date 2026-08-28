# Resumora multi-platform media distribution (GCP / Firebase only)

Automate master → platform variants → GCS → publish/queue across YouTube, TikTok,
Facebook, Instagram, LinkedIn, X, and Bilibili. No n8n.

## Architecture

```
public/videos/*.mp4  (+ public/subtitles/*.vtt)
        │
        ▼
scripts/prepare-platform-videos.mjs   (ffmpeg: 16:9 + 9:16 + thumb + VTT/SRT)
        │
        ▼
gs://resumora-videos/distribute-outbox/{videoId}/
        │
        ▼
Cloud Function distributeMasterVideo  (Storage finalize)
        │
        ├─ media_library / media_publish_jobs / media_publish_metrics (Firestore)
        ├─ Bilibili → live upload (when cookies configured)
        └─ Other platforms → queued jobs until API secrets exist
```

Also available: `publishVideoToBilibili` for direct `bilibili-outbox/` uploads
(see `docs/BILIBILI_PUBLISH.md`).

## Task 1 — Prepare variants (local)

Requires **ffmpeg**:

```powershell
winget install --id=Gyan.FFmpeg -e
cd D:\BossMind\bossmind-resumora
node .\scripts\prepare-platform-videos.mjs --input .\public\videos\vid-resume-writing.mp4 --id vid-resume-writing --langs en,fr,es
```

Outputs under `dist-media/{videoId}/`:

| Asset                  | Use                                                  |
| ---------------------- | ---------------------------------------------------- |
| `*.landscape-16x9.mp4` | YouTube / Facebook / LinkedIn / Bilibili             |
| `*.shorts-9x16.mp4`    | TikTok / Reels / Shorts / X (≤60s)                   |
| `*.thumb.jpg`          | LinkedIn / Instagram cover                           |
| `*.vtt` / `*.srt`      | YouTube (VTT) / Facebook (SRT)                       |
| `manifest.json`        | Titles, tags, platform map + `resumora.net` branding |

Upload:

```powershell
$ID = "vid-resume-writing"
gcloud storage cp -r ".\dist-media\$ID\*" "gs://resumora-videos/distribute-outbox/$ID/" --project=resumora-live
```

## Task 2 — Automated publishing

### Deploy distributor

```powershell
cd D:\BossMind\bossmind-resumora
firebase deploy --only functions:resumora-checkout:distributeMasterVideo --project resumora-live
gcloud run services update distributemastervideo --project=resumora-live --region=us-central1 --no-invoker-iam-check --quiet
```

### Secrets (Secret Manager — never commit)

**Bilibili (live publish):** `BILIBILI_SESSDATA`, `BILIBILI_BILI_JCT`, `BILIBILI_DEDE_USER_ID`  
(see `docs/BILIBILI_PUBLISH.md`)

**Optional — enable API post when ready:**

| Platform     | Secret names (examples)                                               |
| ------------ | --------------------------------------------------------------------- |
| YouTube      | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` |
| Meta (FB/IG) | `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`                              |
| TikTok       | `TIKTOK_ACCESS_TOKEN`                                                 |
| LinkedIn     | `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORG_ID`                            |
| X            | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`                         |

Until those secrets exist, jobs stay in Firestore `media_publish_jobs` with
`queued_awaiting_credentials` (honest gate — no fake “posted” status).

### Reporting

- Firestore `media_publish_metrics` — per-platform status events
- Site GA4 (`VITE_GA_MEASUREMENT_ID`) continues to track web traffic; extend with
  campaign UTMs on social profile links via `VITE_SOCIAL_*` (utm_* kept; click-ids stripped)

## Task 3 — Brand + Bilibili localization

### Footer profiles

Set in `.env.local` / Hosting build env (https only):

```
VITE_SOCIAL_FACEBOOK_URL=
VITE_SOCIAL_INSTAGRAM_URL=
VITE_SOCIAL_TIKTOK_URL=
VITE_SOCIAL_X_URL=
VITE_SOCIAL_LINKEDIN_URL=
VITE_SOCIAL_YOUTUBE_URL=
VITE_SOCIAL_BILIBILI_URL=
```

Then:

```powershell
npm run build
firebase deploy --only hosting --project resumora-live
```

### Bilibili AI Voice / translation

Auto-submit cannot flip Bilibili’s in-app **AI Voice / AI translation** switches
(those are creator-studio features). The pipeline:

1. Publishes with title, description, tags, and `resumora.net` branding
2. Appends an ops reminder to enable **AI translation / AI Voice** for ZH audiences
3. Sets `BILIBILI_ENABLE_AI_VOICE=true` by default (description note)

After first upload, open Bilibili Creator → the draft/video → enable AI translation/voice once; subsequent international uploads follow your account defaults where available.

## Security

- Cookies and API tokens only in Secret Manager
- Never print `sk_live_`, `whsec_`, `pk_live_`, `price_`, or cookie values
- Prefix gates: `distribute-outbox/` and `bilibili-outbox/` only (library `masters/` untouched)
