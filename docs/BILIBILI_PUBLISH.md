# Bilibili auto-publish (GCS → Bilibili) — resumora-live

Google Cloud / Firebase only (no n8n). Triggered when a video is finalized in
`gs://resumora-videos/` under the outbox prefix.

HeyGen is **dropped**. Resumora uses Bilibili for channel publishing and Firestore/GCS for the client video library.

## What it does

1. **Trigger:** Cloud Function `publishVideoToBilibili` on Storage `finalize` for bucket `resumora-videos`.
2. **Filter:** Only `video/*` (and known video extensions). Skips thumbnails / images.
3. **Prefix:** Only objects under `bilibili-outbox/` (override with env `BILIBILI_UPLOAD_PREFIX`).
4. **Upload:** Bilibili member `preupload` → UPOS chunk upload → `/x/vu/web/add/v3` submit.
5. **Auth:** Cookies from Secret Manager (`BILIBILI_SESSDATA`, `BILIBILI_BILI_JCT`, `BILIBILI_DEDE_USER_ID`).
6. **Log:** Firestore `bilibili_publish_log/{id}` — status, bvid, errors (never stores cookie values).

## Client video library

- Client: `src/lib/videoApi.js` → `/api/video/catalog` + `/api/video/download`
- Server: `functions/videoCatalog.js` + exports in `functions/index.js`
- Catalog reads Firestore `videos` first, then falls back to bundled preview MP4s.

## Get cookies (browser)

1. Log in to [https://www.bilibili.com](https://www.bilibili.com) in Chrome/Edge.
2. Open **DevTools** (`F12`) → **Application** → **Cookies** → `https://www.bilibili.com`.
3. Copy `SESSDATA`, `bili_jct`, and `DedeUserID`.
4. Treat these like passwords. They expire when you log out or Bilibili rotates the session.

**Do not** commit cookies to git, chat, or shared `.env` files.

## Store cookies in Secret Manager

Use `scripts/bootstrap-secrets.ps1` (length check only) or `scripts/apply-bilibili-secrets.ps1` when available.

Secret names: `BILIBILI_SESSDATA`, `BILIBILI_BILI_JCT`, `BILIBILI_DEDE_USER_ID`.

## Deploy

Production deploy is via GitHub Actions (PR → merge → approval). Functions included in the standard `deploy-prod` workflow.

## Test

```powershell
gcloud storage cp .\sample.mp4 "gs://resumora-videos/bilibili-outbox/sample.mp4" --project=resumora-live
gcloud functions logs read publishVideoToBilibili --project=resumora-live --region=us-central1 --limit=50
```

## Security

- Never hard-code `SESSDATA` / `bili_jct` / `DedeUserID`.
- Never log cookie values, `sk_live_`, `whsec_`, or `price_` IDs.
- Library masters under `masters/` are **not** auto-published (prefix gate).
