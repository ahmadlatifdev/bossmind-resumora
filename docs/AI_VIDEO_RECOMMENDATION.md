# AI video pipeline (Resumora)

## Recommendation: **Bilibili** (channel publish) + **Google Veo 3** (generation)

HeyGen and Synthesia are **dropped** from Resumora.

| Criterion        | Bilibili                                                          | Google Veo 3               |
| ---------------- | ----------------------------------------------------------------- | -------------------------- |
| Approved stack   | Yes — GCP/Firebase only                                           | Yes — GCP                  |
| EN/FR/ES library | Upload masters → GCS → optional Bilibili outbox                   | Generate clips in Studio   |
| Secrets          | `BILIBILI_SESSDATA`, `BILIBILI_BILI_JCT`, `BILIBILI_DEDE_USER_ID` | `GEMINI_API_KEY` / Veo env |
| Client library   | Firestore `videos` + `/api/video/catalog`                         | N/A                        |

**Resumora choice:** store final MP4 masters in `gs://resumora-videos/masters/`, write metadata to Firestore `videos`, publish to Bilibili via `bilibili-outbox/` when cookies are configured.

## Integration (live)

1. Video catalog API: `videoCatalog` + `videoDownload` Cloud Functions.
2. Bilibili auto-publish: `publishVideoToBilibili` on GCS finalize.
3. Client library page reads catalog; download cap enforced server-side (max 5).

See [BILIBILI_PUBLISH.md](./BILIBILI_PUBLISH.md) for cookie setup and deploy notes.
