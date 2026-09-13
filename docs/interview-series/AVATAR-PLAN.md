# Avatar Video Generation Plan — Option B

## Hardware Reality

- GPU: AMD Radeon RX Vega 10 (2 GB VRAM, integrated)
- Local HeyGem.ai: NOT POSSIBLE
- Local Duix.Avatar: NOT POSSIBLE
- Cloud API: REQUIRED

## Chosen Service: D-ID

- Free trial: 14 days, 3 minutes
- Advanced plan: $108/month for 100 minutes
- Project needs: 96 minutes (4 scripts x 8 min x 3 languages = 12 videos)

## Assets Ready

- 12 TTS audio files in: audio/
  - 01-resume-to-interview-en.mp3, -fr.mp3, -es.mp3
  - 02-star-behavioral-en.mp3, -fr.mp3, -es.mp3
  - 03-situational-async-en.mp3, -fr.mp3, -es.mp3
  - 04-global-career-en.mp3, -fr.mp3, -es.mp3

## What You Need to Provide

- One presenter photo (stock image or AI-generated, no real face needed)
- D-ID account + Advanced plan subscription

## Process Per Video (12 total)

1. Upload presenter photo to D-ID
2. Upload the matching audio file
3. Generate → download MP4
4. Save as: resume-to-interview-en.mp4, etc.

## After All 12 MP4s Are Downloaded

1. Place in: C:\Users\user\bossmind-resumora\videos\
2. Run: .\scripts\transcode-all-interview-videos.ps1
3. Wait 30 minutes for transcoding
4. Verify output: gcloud storage ls gs://resumora-videos/output/ -r
5. Update Firestore catalog with HLS URLs
