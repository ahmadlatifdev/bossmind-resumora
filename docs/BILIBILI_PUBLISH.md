# Bilibili auto-publish (GCS → Bilibili) — resumora-live

Google Cloud / Firebase only (no n8n). Triggered when a video is finalized in
`gs://resumora-videos/` under the outbox prefix.

## What it does

1. **Trigger:** Cloud Function `publishVideoToBilibili` on Storage `finalize` for bucket `resumora-videos`.
2. **Filter:** Only `video/*` (and known video extensions). Skips thumbnails / images.
3. **Prefix:** Only objects under `bilibili-outbox/` (override with env `BILIBILI_UPLOAD_PREFIX`).
4. **Upload:** Bilibili member `preupload` → UPOS chunk upload → `/x/vu/web/add/v3` submit.
5. **Auth:** Cookies from Secret Manager (`BILIBILI_SESSDATA`, `BILIBILI_BILI_JCT`, `BILIBILI_DEDE_USER_ID`).
6. **Log:** Firestore `bilibili_publish_log/{id}` — status, bvid, errors (never stores cookie values).

## Get cookies (browser)

1. Log in to [https://www.bilibili.com](https://www.bilibili.com) (or member.bilibili.com) in Chrome/Edge.
2. Open **DevTools** (`F12`) → **Application** (Chrome) / **Storage** (Firefox).
3. Under **Cookies** → `https://www.bilibili.com`, copy:
   - `SESSDATA`
   - `bili_jct`
   - `DedeUserID`
4. Treat these like passwords. They expire when you log out or Bilibili rotates the session.

**Do not** commit cookies to git, chat, or `.env` files that are shared.

## Store cookies in Secret Manager

```powershell
$PROJECT = "resumora-live"

# Paste values when prompted (do not echo them into shell history if avoidable)
gcloud secrets create BILIBILI_SESSDATA --project=$PROJECT --replication-policy=automatic
echo -n "PASTE_SESSDATA_HERE" | gcloud secrets versions add BILIBILI_SESSDATA --project=$PROJECT --data-file=-

gcloud secrets create BILIBILI_BILI_JCT --project=$PROJECT --replication-policy=automatic
echo -n "PASTE_BILI_JCT_HERE" | gcloud secrets versions add BILIBILI_BILI_JCT --project=$PROJECT --data-file=-

gcloud secrets create BILIBILI_DEDE_USER_ID --project=$PROJECT --replication-policy=automatic
echo -n "PASTE_DEDE_USER_ID_HERE" | gcloud secrets versions add BILIBILI_DEDE_USER_ID --project=$PROJECT --data-file=-
```

If a secret already exists, skip `create` and only run `versions add`.

Grant the Cloud Functions / Cloud Run runtime service account access:

```powershell
$PROJECT = "resumora-live"
$PROJECT_NUMBER = gcloud projects describe $PROJECT --format="value(projectNumber)"
$SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

foreach ($s in @('BILIBILI_SESSDATA','BILIBILI_BILI_JCT','BILIBILI_DEDE_USER_ID')) {
  gcloud secrets add-iam-policy-binding $s --project=$PROJECT `
    --member="serviceAccount:$SA" `
    --role="roles/secretmanager.secretAccessor"
}
```

Also ensure the runtime SA can read `gs://resumora-videos` (`roles/storage.objectViewer` or broader).

## Optional env (Cloud Function)

| Variable                       | Purpose                                | Default            |
| ------------------------------ | -------------------------------------- | ------------------ |
| `BILIBILI_UPLOAD_PREFIX`       | GCS path prefix to publish             | `bilibili-outbox/` |
| `BILIBILI_DEFAULT_DESCRIPTION` | Description template (`{filePath}` ok) | Resumora auto text |
| `BILIBILI_TAGS`                | Comma tags                             | `Resumora,resume`  |
| `BILIBILI_TID`                 | Partition id                           | `21` (日常)        |

## Deploy

```powershell
cd D:\BossMind\bossmind-resumora

firebase deploy --only functions:resumora-checkout:publishVideoToBilibili --project resumora-live

# Org policy often blocks invoker IAM on Gen2; storage triggers use Eventarc — still apply if deploy warns:
gcloud run services update publishvideotobilibili --project=resumora-live --region=us-central1 --no-invoker-iam-check --quiet
```

## Test

```powershell
# Upload a sample MP4 into the outbox (not library masters/)
gcloud storage cp .\sample.mp4 "gs://resumora-videos/bilibili-outbox/sample.mp4" --project=resumora-live

# Watch logs (no secrets printed by design)
gcloud functions logs read publishVideoToBilibili --project=resumora-live --region=us-central1 --limit=50
```

## Security

- Never hard-code `SESSDATA` / `bili_jct` / `DedeUserID`.
- Never log cookie values, `sk_live_`, `whsec_`, or `price_` IDs.
- Library masters under `masters/` are **not** auto-published (prefix gate).
