# AI video creation recommendation (P3)

## Recommendation: **HeyGen** (primary) + Synthesia (alternate)

| Criterion | HeyGen | Synthesia |
|-----------|--------|-----------|
| Realism / avatar quality | Excellent for career-coach presenters | Excellent, slightly more corporate |
| API maturity | Strong REST API + webhooks | Strong enterprise API |
| EN/FR voices | Yes | Yes |
| Clip length control | Easy to keep ≤5 min | Easy |
| Storage handoff | Export MP4 → Firebase Storage | Export MP4 → Firebase Storage |
| Fit for Resumora | Best for interview-coach tone | Best for compliance-heavy scripts |

**Resumora choice:** use **HeyGen** to generate the 5 library masters (EN + FR variants), upload final MP4s to Firebase Storage, then replace `previewUrl` in `src/lib/videoLibrary.js`.

## Integration sketch (not live until API key is approved)

1. Create HeyGen API key in vault (never commit).
2. Cloud Function `generateInterviewClip({ script, language, jobTags })`.
3. On completion webhook → save to `gs://resumora-live.../videos/{id}/{lang}.mp4`.
4. Write metadata to Firestore `videos` + enforce `userVideoAccess` max 5.

## Blocker

No HeyGen/Synthesia secret is configured in this environment. UI ships with preview media + tip downloads; production assets swap is a follow-up after key approval.
