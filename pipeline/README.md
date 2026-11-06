# Conversational Interview Video Pipeline

Open-source pipeline that produces 4 conversational interview videos
(Software Engineer, Data Scientist, Product Manager, Marketing Manager) with a
**Serverless Video API** (JSON2Video) for reliable, Windows-proof rendering.

```
pipeline/
├── build_interviews.js          # master orchestrator (Node)
├── .env.example                 # JSON2VIDEO_API_KEY / AUDIO_BASE_URL placeholders
├── assets/
│   ├── interview_scripts.json   # dialogue for the 4 roles
│   ├── audio/                   # generated MP3s (Edge-TTS)
│   ├── images/                  # (optional) reference images
│   └── transcripts/             # Whisper word timestamps (JSON)
├── outputs/                     # final MP4s
└── scripts/
    ├── generate_audio.py        # Edge-TTS → per-speaker MP3
    ├── generate_timestamps.py   # Whisper → word timestamps JSON
    └── render_via_api.js        # JSON2Video API → render + poll + download
```

## Setup (one-time)

```bash
# 1. Audio TTS
pip install edge-tts

# 2. Whisper (word timestamps)
pip install openai-whisper

# 3. Sign up for JSON2Video (https://json2video.com)
#    Dashboard → API Key → copy it.

# 4. Upload the audio MP3s to Firebase Storage (or any public bucket), then:
#    AUDIO_BASE_URL=https://storage.googleapis.com/<bucket>/audio
```

## Configure

```powershell
cp pipeline/.env.example pipeline/.env
# edit pipeline/.env:
#   JSON2VIDEO_API_KEY=...
#   AUDIO_BASE_URL=...
```

Or export directly:

```powershell
$env:JSON2VIDEO_API_KEY = "<your-key>"
$env:AUDIO_BASE_URL = "https://storage.googleapis.com/<bucket>/audio"
```

## Run

```powershell
node pipeline/build_interviews.js
```

This generates audio (Edge-TTS), transcribes it (Whisper word timestamps), then
sends each role to JSON2Video — which renders a dark-blue (#0A1A3A) background,
the audio, and gold (#D4AF37) text overlays — then polls until done and
downloads the MP4 into `pipeline/outputs/`.
