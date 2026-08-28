# Video Library masters (gitignored binaries preferred)

Place the 4 EN master MP4s here (FR/ES optional until localized):

```
vid-resume-writing.mp4          # or vid-resume-writing-en.mp4
vid-ats-optimization.mp4
vid-linkedin-tips.mp4
vid-interview-prep.mp4
```

Then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\seed-video-library.ps1
npm run build
firebase deploy --only hosting --project resumora-live
```

Do not commit large MP4 binaries unless explicitly approved.
