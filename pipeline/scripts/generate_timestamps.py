#!/usr/bin/env python3
"""
Generate word-level timestamps for interview audio using OpenAI Whisper.

For each role:
  1. Concatenate interviewer + candidate MP3s into a single combined track.
  2. Run Whisper with word_timestamps=True.
  3. Write pipeline/assets/transcripts/<role>_transcript.json:
       { "audio": "<role>_combined.mp3", "words": [{"word","start","end"}, ...] }

Prerequisites:
  pip install openai-whisper
  ffmpeg on PATH

Usage:
  python pipeline/scripts/generate_timestamps.py
  python pipeline/scripts/generate_timestamps.py --model base
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIO_DIR = ROOT / "assets" / "audio"
TRANSCRIPTS_DIR = ROOT / "assets" / "transcripts"

ROLES = [
    "software_engineer",
    "data_scientist",
    "product_manager",
    "marketing_manager",
]


def combine_audio(role: str):
    """Concatenate interviewer + candidate tracks into a single conversation MP3."""
    interviewer = AUDIO_DIR / f"{role}_interviewer.mp3"
    candidate = AUDIO_DIR / f"{role}_candidate.mp3"
    combined = AUDIO_DIR / f"{role}_combined.mp3"

    if not interviewer.exists() or not candidate.exists():
        print(f"  [skip] {role}: missing interviewer/candidate audio")
        return None

    # Re-encode via the concat filter (more reliable than the concat demuxer for MP3).
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", str(interviewer),
            "-i", str(candidate),
            "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[out]",
            "-map", "[out]",
            "-c:a", "libmp3lame", "-q:a", "4",
            str(combined),
        ],
        check=True,
        capture_output=True,
    )
    return combined


def transcribe(audio_path: Path, model_name: str):
    import whisper

    model = whisper.load_model(model_name)
    result = model.transcribe(str(audio_path), word_timestamps=True)
    words = []
    for segment in result.get("segments", []):
        for w in segment.get("words", []):
            word = (w.get("word") or "").strip()
            if not word:
                continue
            words.append(
                {
                    "word": word,
                    "start": round(float(w.get("start", 0.0)), 3),
                    "end": round(float(w.get("end", 0.0)), 3),
                }
            )
    return words


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="base")
    args = parser.parse_args()

    try:
        import whisper  # noqa: F401
    except ImportError:
        print("[ERROR] openai-whisper is not installed. Run: pip install openai-whisper")
        sys.exit(1)

    TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

    for role in ROLES:
        combined = combine_audio(role)
        if not combined:
            continue
        print(f"Transcribing {combined.name} (model={args.model})...")
        words = transcribe(combined, args.model)
        out = TRANSCRIPTS_DIR / f"{role}_transcript.json"
        out.write_text(
            json.dumps({"audio": combined.name, "words": words}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"  [OK] {out} ({len(words)} words)")

    print("Done.")


if __name__ == "__main__":
    main()
