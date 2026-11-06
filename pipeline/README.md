# Conversational Interview Video Pipeline

100% open-source pipeline that produces 4 conversational interview videos
(Software Engineer, Data Scientist, Product Manager, Marketing Manager) with
lip-synced avatars (MultiTalk) and kinetic "Word-Pop" subtitles (Remotion).

```
pipeline/
├── build_interviews.js          # master orchestrator (Node)
├── assets/
│   ├── interview_scripts.json   # dialogue for the 4 roles
│   ├── audio/                   # generated MP3s (Edge-TTS)
│   ├── images/                  # interviewer.png / candidate.png reference images
│   └── transcripts/             # Whisper word timestamps (JSON)
├── outputs/                     # raw avatars + final MP4s
├── scripts/
│   ├── generate_audio.py        # Edge-TTS → per-speaker MP3
│   └── generate_avatars.py      # MultiTalk lip-sync (validates + TODO)
└── remotion-editor/             # Remotion Word-Pop renderer
```

## Install (manual steps — run in order)

```bash
# 1. Audio TTS
pip install edge-tts

# 2. MultiTalk (heavy, GPU)
git clone https://github.com/MeiGen-AI/MultiTalk.git ../MultiTalk
cd ../MultiTalk && pip install -r requirements.txt
# TODO: download the pretrained checkpoint into MultiTalk/checkpoints/

# 3. Remotion
cd pipeline/remotion-editor && npm install

# 4. Whisper (word timestamps)
pip install openai-whisper
```

## Run

```bash
node pipeline/build_interviews.js
```

The orchestrator runs audio generation immediately, then prints the exact TODO
commands for the GPU/model-weighted steps (MultiTalk inference, Whisper
timestamps, Remotion render) since those can't run until the weights are
installed.
