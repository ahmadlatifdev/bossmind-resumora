#!/usr/bin/env python3
"""
(OPTIONAL) Conversational avatar videos via MultiTalk (audio-driven talking head).

This is a TEMPLATE — MultiTalk is a research project (MeiGen-AI/MultiTalk) that
requires downloading its model weights and knowing the exact inference entry point,
which this script does not assume. Fill in the TODOs once MultiTalk is set up.

Prerequisites:
  git clone https://github.com/MeiGen-AI/MultiTalk.git
  cd MultiTalk && pip install -r requirements.txt
  # download the pretrained checkpoint into MultiTalk/checkpoints/

Usage (after filling TODOs):
  python scripts/generate_avatar_videos.py --audio audio/01-resume-to-interview-en.mp3 \
      --img interviewer.png --img2 candidate.png
"""

import argparse
import subprocess
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Generate a split-screen conversational avatar video")
    parser.add_argument("--audio", required=True)
    parser.add_argument("--img", help="Interviewer reference image")
    parser.add_argument("--img2", help="Candidate reference image")
    parser.add_argument("--multitalk-dir", default=str(Path(__file__).resolve().parents[1] / ".." / "MultiTalk"))
    parser.add_argument("--output", default="avatar_video.mp4")
    args = parser.parse_args()

    multitalk = Path(args.multitalk_dir)
    if not multitalk.exists():
        print(f"[ERROR] MultiTalk not found at {multitalk}. Clone it first:")
        print("  git clone https://github.com/MeiGen-AI/MultiTalk.git")
        sys.exit(1)

    # TODO: replace with MultiTalk's actual inference command once its entry
    # point and checkpoint name are known. Example skeleton:
    #
    #   python {multitalk}/infer.py --audio {args.audio} --source {args.img} --out {args.output}
    #
    # Then, if two avatars (interviewer + candidate) are desired, run inference for
    # each image and splice the two clips together with ffmpeg:
    #
    #   ffmpeg -i interviewer.mp4 -i candidate.mp4 -filter_complex hstack out.mp4

    print("This is a template — fill in the TODO in scripts/generate_avatar_videos.py.")
    sys.exit(1)


if __name__ == "__main__":
    main()
