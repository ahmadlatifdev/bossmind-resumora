# Remotion Editor — Word-Pop subtitle overlay

Remotion project that burns kinetic "Word-Pop" subtitles over a raw interview MP4.

## Setup

```bash
cd pipeline/remotion-editor
npm install
```

## Generate word timestamps (Whisper)

TODO — install whisper and generate a per-word transcript:

```bash
pip install openai-whisper
whisper <raw.mp4> --model base --word_timestamps True --output_format json
```

Convert the Whisper JSON into the format `[{ "word", "start", "end" }]` (seconds)
and save it to `pipeline/assets/transcripts/<role>_transcript.json`.

## Render

Pass the raw video + transcript via `--props`:

```bash
npx remotion render InterviewVideo out/video.mp4 \
  --props='{"src":"../outputs/avatars/software_engineer_raw.mp4","transcript":[...]}'
```

Or use the defaults in `src/Root.tsx` (which reference a placeholder). The master
orchestrator (`pipeline/build_interviews.js`) constructs and runs this command.
