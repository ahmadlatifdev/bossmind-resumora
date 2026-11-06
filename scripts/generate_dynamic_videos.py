#!/usr/bin/env python3
"""
Generate dynamic conversational videos using VidForge (real API, not the CLI).

IMPORTANT — VidForge's actual behavior differs from common assumptions:
  * Script format is {"scenes": [{"keyword": "...", "text": "..."}]}.
    There is NO audio_file field — VidForge synthesizes speech itself via Edge-TTS
    (--voice) and does NOT consume pre-generated .mp3 files.
  * Backgrounds are fetched from Pexels using each scene's "keyword",
    so a PEXELS_API_KEY is required (not fully open-source).
  * ImageMagick (magick/convert) and FFmpeg must be on PATH.
  * Default output is vertical (1080x1920); we override target_size to 1920x1080.

Prerequisites:
  pip install vidforge
  set PEXELS_API_KEY=...
  install ImageMagick: https://imagemagick.org/script/download.php

Usage:
  python scripts/generate_dynamic_videos.py
  python scripts/generate_dynamic_videos.py --video 01-resume-to-interview --lang en \
      --voice en-US-ChristopherNeural --font-color "#D4AF37"
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT / "docs" / "interview-series"
OUTPUT_DIR = ROOT / "assets" / "vid-star-conversational-build-EN"

VIDEOS = [
    "01-resume-to-interview",
    "02-star-behavioral",
    "03-situational-async",
    "04-global-career",
]

# Background search terms (Pexels) per speaker, for visual alternation.
INTERVIEWER_KEYWORD = "abstract dark office professional"
CANDIDATE_KEYWORD = "abstract blue technology motion"


def extract_language_script(video_id: str, lang: str) -> str:
    """Extract one language's narration from the (multi- or single-language) .md."""
    md = SCRIPTS_DIR / f"{video_id}.md"
    if not md.exists():
        return ""
    lines = md.read_text(encoding="utf-8").splitlines()
    has_lang_sections = any(re.match(r"^##\s+(EN|FR|ES)\b", ln, re.I) for ln in lines)

    out = []
    current = None if has_lang_sections else lang
    for line in lines:
        m = re.match(r"^##\s+(EN|FR|ES)\b", line, re.I)
        if has_lang_sections and m:
            current = lang if m.group(1).lower() == lang.lower() else None
            continue
        if line.startswith("#"):
            if re.search(r"production notes", line, re.I):
                current = None
            continue
        if line.startswith("**") or re.match(r"^---\s*$", line):
            continue
        if current:
            out.append(line)

    text = "\n".join(out)
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"\*(.*?)\*", r"\1", text)
    text = re.sub(r"\[(.*?)\]\(.*?\)", r"\1", text)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"^[-*]\s+", "", text, flags=re.M)
    text = re.sub(r"^\d+\.\s+", "", text, flags=re.M)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def split_sentences(text: str):
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p.strip() for p in parts if p.strip()]


def build_scenes(text: str):
    scenes = []
    for i, sentence in enumerate(split_sentences(text)):
        speaker = "Interviewer" if i % 2 == 0 else "Candidate"
        keyword = INTERVIEWER_KEYWORD if speaker == "Interviewer" else CANDIDATE_KEYWORD
        scenes.append({"keyword": keyword, "text": f"{speaker}: {sentence}"})
    return scenes


def main():
    parser = argparse.ArgumentParser(description="Generate a conversational video with VidForge")
    parser.add_argument("--video", default="01-resume-to-interview")
    parser.add_argument("--lang", default="en")
    parser.add_argument("--voice", default="en-US-ChristopherNeural")
    parser.add_argument("--font-color", default="#D4AF37")
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    text = extract_language_script(args.video, args.lang)
    if not text:
        print(f"[ERROR] No {args.lang.upper()} narration found for {args.video}.")
        sys.exit(1)

    scenes = build_scenes(text)
    print(f"Parsed {len(scenes)} conversational scenes for {args.video} ({args.lang}).")

    # Write the VidForge-format script.json next to this script.
    script_path = ROOT / "scripts" / "vidforge_script.json"
    script_path.write_text(
        json.dumps({"scenes": scenes}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Wrote script: {script_path}")

    output = args.output or str(OUTPUT_DIR / f"{args.video}-{args.lang}.mp4")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    try:
        from vidforge import VideoFactory, VidForgeConfig, VidForgeError
    except ImportError:
        print("[ERROR] vidforge is not installed. Run: pip install vidforge")
        sys.exit(1)

    try:
        config = VidForgeConfig(
            pexels_api_key=os.environ.get("PEXELS_API_KEY"),
            tts_voice=args.voice,
            font_color=args.font_color,
            target_size=(1920, 1080),  # 1080p landscape (VidForge defaults to vertical)
            words_per_subtitle=3,
            text_position_y=1000,
        )
    except (ValueError, RuntimeError) as err:
        print(f"[ERROR] VidForge config error: {err}")
        print("  - Set PEXELS_API_KEY (Pexels is required for background media).")
        print("  - Install ImageMagick and ensure 'magick' is on PATH.")
        sys.exit(1)

    factory = VideoFactory(config=config)
    print(f"Rendering (voice={args.voice}, font={args.font_color}) -> {output}")
    try:
        result = factory.create_video(script_json_path=str(script_path), output_filename=output)
        print(f"[OK] Video saved to: {result}")
    except VidForgeError as err:
        print(f"[ERROR] Pipeline failed: {err}")
        sys.exit(1)


if __name__ == "__main__":
    main()
