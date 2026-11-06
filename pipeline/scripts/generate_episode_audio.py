#!/usr/bin/env python3
"""
Generate per-character narration audio (Coach vs Job Seeker) for the 6 interview
episodes using Edge-TTS, then concatenate the lines into a single MP3 per episode.

Voices:
  Coach       -> en-US-ChristopherNeural
  Job Seeker  -> en-US-GuyNeural

Output: pipeline/assets/audio/<episode>.mp3

Usage: python pipeline/scripts/generate_episode_audio.py
"""

import asyncio
import subprocess
import sys
from pathlib import Path

try:
    import edge_tts
except ImportError:
    print("[ERROR] edge-tts is not installed. Run: pip install edge-tts")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[2]  # repo root
SCRIPTS_DIR = ROOT / "docs" / "interview-series"
AUDIO_DIR = ROOT / "pipeline" / "assets" / "audio"

EPISODES = [
    "01_build_strong_resume",
    "02_tailor_resume",
    "03_cover_letter",
    "04_interview_prep",
    "05_career_gaps",
    "06_resumora_walkthrough",
]

VOICES = {
    "Coach": "en-US-ChristopherNeural",
    "Job Seeker": "en-US-GuyNeural",
}

PAUSE_SECONDS = 0.4


def make_silence(path: Path):
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"anullsrc=r=24000:cl=mono",
            "-t", str(PAUSE_SECONDS),
            "-q:a", "4",
            str(path),
        ],
        check=True,
        capture_output=True,
    )


async def synth_line(text: str, voice: str, out: Path):
    last = None
    for attempt in range(4):
        try:
            await edge_tts.Communicate(text, voice).save(str(out))
            return
        except edge_tts.exceptions.NoAudioReceived as exc:
            last = exc
            await asyncio.sleep(2 * (attempt + 1))  # 2s, 4s, 6s backoff (rate-limit cooldown)
    if last:
        raise last


async def process_episode(episode: str, silence: Path):
    md = SCRIPTS_DIR / f"{episode}.md"
    if not md.exists():
        print(f"[skip] {episode}: script not found")
        return

    lines = md.read_text(encoding="utf-8").splitlines()
    tmp = AUDIO_DIR / f"_tmp_{episode}.mp3"
    chunks = []
    spoken = 0

    print(f"[{episode}]")
    for line in lines:
        match = None
        for speaker in VOICES:
            if line.startswith(f"{speaker}:"):
                match = speaker
                break
        if match is None:
            continue
        text = line.split(":", 1)[1].strip()
        if not text:
            continue

        await synth_line(text, VOICES[match], tmp)
        chunks.append(tmp.read_bytes())
        chunks.append(silence.read_bytes())
        spoken += 1
        if spoken % 10 == 0:
            print(f"  {spoken} lines synthesized…")
        await asyncio.sleep(0.8)

    if not chunks:
        print(f"[skip] {episode}: no dialogue found")
        return

    out = AUDIO_DIR / f"{episode}.mp3"
    out.write_bytes(b"".join(chunks))
    tmp.unlink(missing_ok=True)
    print(f"[OK] {out} ({spoken} lines)")


async def main():
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    silence = AUDIO_DIR / "_silence.mp3"
    make_silence(silence)

    for episode in EPISODES:
        await process_episode(episode, silence)

    silence.unlink(missing_ok=True)
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
