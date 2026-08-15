# HeyGen + Resumora video pipeline

## Status
- Client: `src/lib/heygen.js` calls `/api/video/*`
- Server: `functions/heygen.js` + exports in `functions/index.js`
- Catalog prefers Firestore `videos` (pre-generated MP4 URLs in Storage)
- On-demand generation requires `HEYGEN_API_KEY` on Functions

## Pre-generate the 4 core videos (recommended)
1. In HeyGen Creator, generate EN masters (~5:00) for:
   - Resume writing
   - ATS optimization
   - LinkedIn tips
   - Interview prep
2. Dub/translate to FR + ES (Audio Dubbing).
3. Upload MP4s to Firebase Storage under `videos/{id}/{lang}.mp4`.
4. Write Firestore docs in `videos` with `url_mp4_en|fr|es`, titles, descriptions, `duration: 300`, `order`.

## Enable API key (do not paste into chat)
```powershell
# In functions/.env (local) or Secret Manager for production:
HEYGEN_API_KEY=...
HEYGEN_DEFAULT_AVATAR_ID=...
HEYGEN_DEFAULT_VOICE_ID=...
```

Then deploy functions:
```powershell
firebase deploy --only functions:heygenVideoCatalog,functions:heygenVideoGenerate,functions:heygenVideoStatus --project resumora-live
```

## Polling
Client uses exponential backoff (1s → ×1.5 → cap 10s) in `pollHeyGenVideo`.
