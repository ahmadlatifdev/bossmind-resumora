# Video archival & DR (BossMind Resumora)

## Infrastructure (Phase 1 — live on `resumora-live`)

| Resource                        | Status                                           |
| ------------------------------- | ------------------------------------------------ |
| Firestore PITR                  | Enabled (`POINT_IN_TIME_RECOVERY_ENABLED`, nam5) |
| `gs://resumora-videos`          | us-central1, object versioning on                |
| `gs://resumora-videos-failover` | us-east1, object versioning on                   |
| `gs://resumora-backups`         | us-central1 (Firestore export target)            |
| Pub/Sub `refresh-videos-topic`  | Created                                          |
| Scheduler `refresh-videos-cron` | `0 0 1 */3 *` UTC → topic                        |

## Functions

| Export              | Trigger                        | Role                                                    |
| ------------------- | ------------------------------ | ------------------------------------------------------- |
| `refreshVideos`     | Pub/Sub `refresh-videos-topic` | Archive `video_registry` Current → `archive/{YYYY-Qn}/` |
| `refreshVideosHttp` | HTTPS (private invoker)        | Manual archival                                         |
| `restoreVideo`      | HTTPS (private invoker)        | Copy archive → `active/` + status Current               |

Code: `functions/src/refreshVideos.js`, `restoreVideo.js`, `services/AIGateway.js`.

## Kimi K3 (optional)

Set on the Cloud Function (via Secret Manager / CI env — never commit values):

- `ENABLE_KIMI_ENRICHMENT=false` (default)
- `RUNPOD_API_KEY` only when enabling

## Ops

```powershell
# Manual scheduler tick
gcloud scheduler jobs run refresh-videos-cron --location=us-central1 --project=resumora-live

# Restore (authenticated identity required — private invoker)
# POST Cloud Run URL for restoreVideo with JSON { "docId": "..." }
```

Deploy path: **git push → GitHub Actions** only (no local `firebase deploy` / `gcloud functions deploy`).
