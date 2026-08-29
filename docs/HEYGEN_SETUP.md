# HeyGen — dropped

HeyGen was removed from Resumora. Do not re-add `HEYGEN_*` env keys or `/api/video/generate` routes.

**Replacement:** Bilibili publish pipeline — see [BILIBILI_PUBLISH.md](./BILIBILI_PUBLISH.md).

- Client video API: `src/lib/videoApi.js`
- Server catalog: `functions/videoCatalog.js`
- Auto-publish: `functions/bilibiliPublish.js` + `publishVideoToBilibili`
