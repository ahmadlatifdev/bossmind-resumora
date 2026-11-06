#!/usr/bin/env python3
"""
Convert Whisper word-timestamp JSON transcripts into standard .srt subtitle files.

Reads pipeline/assets/transcripts/<role>_transcript.json
({ "audio": ..., "words": [{"word","start","end"}, ...] })
and writes pipeline/assets/transcripts/<role>_combined.srt, grouping words into
readable phrases (up to ~5 words per line).

Usage: python pipeline/scripts/json_to_srt.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRANSCRIPTS_DIR = ROOT / "assets" / "transcripts"

ROLES = [
    "software_engineer",
    "data_scientist",
    "product_manager",
    "marketing_manager",
]

MAX_WORDS = 5
MAX_DURATION = 3.0  # seconds per subtitle line


def srt_timestamp(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, rem = divmod(ms, 3600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def group_words(words):
    """Group words into readable phrases (max words / max duration)."""
    groups = []
    current = []
    for w in words:
        if current:
            gap = w.get("start", 0) - current[0].get("start", 0)
            if len(current) >= MAX_WORDS or gap >= MAX_DURATION:
                groups.append(current)
                current = []
        current.append(w)
    if current:
        groups.append(current)
    return groups


def words_to_srt(words):
    lines = []
    for i, group in enumerate(group_words(words), 1):
        start = group[0].get("start", 0.0)
        end = group[-1].get("end", start + 0.5)
        text = " ".join((g.get("word") or "").strip() for g in group).strip()
        if not text:
            continue
        lines.append(f"{i}\n{srt_timestamp(start)} --> {srt_timestamp(end)}\n{text}\n")
    return "\n".join(lines)


def main():
    found = 0
    for role in ROLES:
        src = TRANSCRIPTS_DIR / f"{role}_transcript.json"
        if not src.exists():
            print(f"[skip] {role}: {src.name} not found")
            continue
        data = json.loads(src.read_text(encoding="utf-8"))
        words = data.get("words", [])
        if not words:
            print(f"[skip] {role}: no words in transcript")
            continue
        srt = words_to_srt(words)
        out = TRANSCRIPTS_DIR / f"{role}_combined.srt"
        out.write_text(srt, encoding="utf-8")
        print(f"[OK] {out} ({len(group_words(words))} lines, {len(words)} words)")
        found += 1

    if not found:
        print("[WARN] No transcripts found. Run generate_timestamps.py first.")
        sys.exit(1)
    print("Done.")


if __name__ == "__main__":
    main()
