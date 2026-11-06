#!/usr/bin/env python3
"""
Generate per-speaker interview audio (Interviewer + Candidate) for all 4 roles.

Uses Edge-TTS (free, open-source Microsoft Edge neural voices) to synthesize the
combined dialogue for each speaker into a single .mp3.

Prerequisites:
  pip install edge-tts

Output:
  pipeline/assets/audio/<role>_interviewer.mp3
  pipeline/assets/audio/<role>_candidate.mp3

Usage:
  python pipeline/scripts/generate_audio.py
"""

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_JSON = ROOT / "assets" / "interview_scripts.json"
AUDIO_DIR = ROOT / "assets" / "audio"

# Distinct voices so the two speakers are audibly different.
VOICES = {
    "Interviewer": "en-US-ChristopherNeural",
    "Candidate": "en-US-GuyNeural",
}


def load_roles():
    data = json.loads(SCRIPTS_JSON.read_text(encoding="utf-8"))
    return data.get("roles", {})


async def synthesize(text: str, voice: str, out_path: Path):
    try:
        import edge_tts
    except ImportError:
        print("[ERROR] edge-tts is not installed. Run: pip install edge-tts")
        sys.exit(1)

    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(out_path))


async def main():
    try:
        import edge_tts  # noqa: F401
    except ImportError:
        print("[ERROR] edge-tts is not installed. Run: pip install edge-tts")
        sys.exit(1)

    roles = load_roles()
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    for role_id, role in roles.items():
        # Group turns by speaker.
        by_speaker = {"Interviewer": [], "Candidate": []}
        for turn in role.get("turns", []):
            by_speaker.setdefault(turn["speaker"], []).append(turn["text"])

        for speaker, lines in by_speaker.items():
            if not lines:
                continue
            text = ". ".join(lines).strip()
            out_path = AUDIO_DIR / f"{role_id}_{speaker.lower()}.mp3"
            voice = VOICES.get(speaker, "en-US-ChristopherNeural")
            print(f"Synthesizing {role_id}/{speaker} ({len(lines)} turns, voice={voice})...")
            await synthesize(text, voice, out_path)
            print(f"  [OK] {out_path}")

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
