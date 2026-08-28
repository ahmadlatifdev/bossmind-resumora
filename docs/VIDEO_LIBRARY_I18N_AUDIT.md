# Video Library Audit — Creation, Fetching & EN/FR/ES i18n

**Date:** 2026-08-23  
**Routes:** `/video-library` (SPA `App.tsx`) and `/videos` (`videos.html` → `VideosPage`)  
**Note:** There is **no** `src/pages/VideoLibrary.tsx`. The page is `src/pages/VideosPage.tsx`.

**Security:** No Stripe/Firebase secret values printed.

---

## Executive summary

| Item                     | Result                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Total videos             | **4**                                                                                                        |
| Catalog API              | `GET /api/video/catalog` → **source=`fallback`** (Firestore `videos` empty / unused)                         |
| Local fallback           | `src/lib/videoLibrary.js` → same 4 IDs                                                                       |
| UI chrome i18n           | **Complete** — 25 `videos.*` + `player.*` keys in EN/FR/ES; **0 missing**                                    |
| Metadata i18n            | **Complete** in local library + API fallback (`title_*` / `description_*`)                                   |
| Dedicated subtitle files | **Missing feature** — no `public/videos/`, no `public/subtitles/`, no `.vtt`/`.srt` in repo                  |
| Runtime captions         | **Present** via generated WebVTT from EN/FR/ES voiceover scripts (`resolveCaptionTracks`) with `srcLang` set |
| Lang switcher re-render  | **Yes** — `uiLang` state updates cards/player without full reload                                            |

---

## Task 1 — Creation & fetching

### Fetch path

1. `VideosPage` mounts → `useEffect` calls `fetchVideoCatalog()` (`src/lib/heygen.js` → `/api/video/catalog`).
2. Backend `functions/heygen.js` `getCatalog()`:
   - Prefer Firestore `videos` ordered by `order`
   - Else return `FALLBACK_CATALOG` (4 items)
3. Live probe: `catalog_source=fallback`, `heygenConfigured=false`, **count=4**.
4. If API fails, UI keeps embedded `VIDEO_LIBRARY` (also 4).

### Video inventory

| #   | ID                     | Status                                              |
| --- | ---------------------- | --------------------------------------------------- |
| 1   | `vid-resume-writing`   | Present in local + API fallback; titles EN/FR/ES OK |
| 2   | `vid-ats-optimization` | Same                                                |
| 3   | `vid-linkedin-tips`    | Same                                                |
| 4   | `vid-interview-prep`   | Same                                                |

### File / URL status

| Asset location                 | Status                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `public/videos/`               | **Does not exist** (0 files)                                                                                  |
| Dedicated Resumora GCS masters | **Not referenced** in live fallback                                                                           |
| MP4 URLs                       | Google sample bucket `gtv-videos-bucket/sample/ForBigger*.mp4` (placeholder until HeyGen/GCS masters)         |
| Probe from this runner         | HEAD/GET returned **403** to sample CDN (environment may block; browsers can still play depending on network) |

**Verdict:** Library **structure is created and linked** (4 cards, player, download). **Production masters are not published** — still on public sample placeholders + empty Firestore.

---

## Task 2 — i18n wiring

### Player UI (`VideoPlayer.tsx`)

Uses `t(uiLang, …)` for:

- `player.mute` / `unmute` / `volume` / `speed` / `fullscreen`
- `player.audioControls` / `captions` / `captionsOn` / `captionsOff` / `captionLang`
- `player.voiceoverActive` / `player.noCaptions`

Native `<video controls>` play/pause scrubber remains browser-localized; custom toolbar is app-i18n.

### Library chrome (`VideosPage` / `VideoCard`)

`videos.title`, `lead`, `remaining`, `play`, `download`, `audioLang`, `duration`, `voiceTag`, HeyGen notes — all keyed.

### Metadata

Local `VIDEO_LIBRARY` and API `FALLBACK_CATALOG` provide EN/FR/ES titles + descriptions. `localize(video.title, uiLang)` + FR/ES fallback to EN when mapping catalog.

### Language switcher → re-render

`SiteHeader` `onLangChange` → `setLang` + `setLangState` → `VideoCard` `useEffect([uiLang])` sets `videoLang` → title/description/player `uiLang`/`lang` update **without page refresh**.

### Subtitles / captions

| Type                                | EN                       | FR      | ES      |
| ----------------------------------- | ------------------------ | ------- | ------- |
| Dedicated `.vtt` / `.srt` files     | **No**                   | **No**  | **No**  |
| Generated WebVTT from voiceover     | **Yes**                  | **Yes** | **Yes** |
| `<track kind="captions" srcLang=…>` | **Yes** (when generated) | **Yes** | **Yes** |
| Caption language selector           | **Yes**                  | **Yes** | **Yes** |

**Missing feature:** published timed subtitle tracks. Current captions are **single-cue voiceover VTT blobs**, not dialogue-timed subtitle files.

---

## Task 3 — Summary table

| Video                | Title EN/FR/ES  | Description EN/FR/ES | Subtitles EN/FR/ES | Player UI EN/FR/ES |
| -------------------- | --------------- | -------------------- | ------------------ | ------------------ |
| vid-resume-writing   | Yes / Yes / Yes | Yes / Yes / Yes      | Generated VTT only | Yes                |
| vid-ats-optimization | Yes / Yes / Yes | Yes / Yes / Yes      | Generated VTT only | Yes                |
| vid-linkedin-tips    | Yes / Yes / Yes | Yes / Yes / Yes      | Generated VTT only | Yes                |
| vid-interview-prep   | Yes / Yes / Yes | Yes / Yes / Yes      | Generated VTT only | Yes                |

### Missing `locales/*.json` keys (video library)

**None** for `videos.*` and `player.*` (FR/ES parity check: none missing / none placeholder).

---

## Remediation — exact additions

### A) Dedicated caption files (recommended)

Create:

```text
public/subtitles/vid-resume-writing.en.vtt
public/subtitles/vid-resume-writing.fr.vtt
public/subtitles/vid-resume-writing.es.vtt
… (repeat for other video IDs)
```

Example VTT:

```vtt
WEBVTT

00:00:00.000 --> 00:00:08.000
Welcome to Resumora. Structure your resume for impact.

00:00:08.000 --> 00:00:20.000
Lead with a clear headline and achievement bullets with metrics.
```

Wire in `videoLibrary.js` (or Firestore) captions:

```js
captions: {
  en: "/subtitles/vid-resume-writing.en.vtt",
  fr: "/subtitles/vid-resume-writing.fr.vtt",
  es: "/subtitles/vid-resume-writing.es.vtt",
},
```

`resolveCaptionTracks` already prefers `https?://` **or** same-origin paths if you extend the URL check to allow paths starting with `/`:

```js
// In resolveCaptionTracks — allow Hosting-relative caption URLs
if (url && typeof url === "string" && (/^https?:\/\//i.test(url) || url.startsWith("/"))) {
  out[code] = { kind: "url", src: url, label: code.toUpperCase(), srclang: code };
  continue;
}
```

### B) Firestore production catalog document (example)

```js
// videos/vid-resume-writing
{
  order: 1,
  duration: 300,
  title_EN: "Resume writing that gets interviews",
  title_FR: "Rédiger un CV qui obtient des entretiens",
  title_ES: "Redacción de CV que consigue entrevistas",
  description_EN: "…",
  description_FR: "…",
  description_ES: "…",
  url_mp4_en: "gs://YOUR_BUCKET/masters/vid-resume-writing-en.mp4", // use https://storage.googleapis.com/... public URL
  url_mp4_fr: "https://storage.googleapis.com/YOUR_BUCKET/masters/vid-resume-writing-fr.mp4",
  url_mp4_es: "https://storage.googleapis.com/YOUR_BUCKET/masters/vid-resume-writing-es.mp4",
  captions_en: "https://storage.googleapis.com/YOUR_BUCKET/captions/vid-resume-writing.en.vtt",
  captions_fr: "https://storage.googleapis.com/YOUR_BUCKET/captions/vid-resume-writing.fr.vtt",
  captions_es: "https://storage.googleapis.com/YOUR_BUCKET/captions/vid-resume-writing.es.vtt",
  voiceover_en: "…",
  voiceover_fr: "…",
  voiceover_es: "…",
}
```

After four docs exist, `/api/video/catalog` returns `source: "firestore"` and the UI maps them via `mapCatalogItem`.

### C) Optional code patch for relative caption paths

Apply the `url.startsWith("/")` check in `resolveCaptionTracks` (snippet above) so Hosting-served `/subtitles/*.vtt` works without full HTTPS URLs.

---

## Interactive canvas

See Cursor canvas: `video-library-i18n-audit.canvas.tsx`.
