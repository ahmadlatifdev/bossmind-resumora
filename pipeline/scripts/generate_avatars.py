#!/usr/bin/env python3
"""
Generate lip-synced conversational avatar videos using MultiTalk.

MultiTalk (https://github.com/MeiGen-AI/MultiTalk) is a research talking-head /
lip-sync model. It requires a GPU + pretrained weights, so this script does NOT
auto-run the inference. It validates the environment, locates assets, and prints
the exact commands / TODOs you must run to install the weights and generate the
raw avatar MP4s.

Prerequisites (manual — see TODOs below):
  git clone https://github.com/MeiGen-AI/MultiTalk.git
  cd MultiTalk && pip install -r requirements.txt
  # download the pretrained checkpoint into MultiTalk/checkpoints/

Usage:
  python pipeline/scripts/generate_avatars.py
  python pipeline/scripts/generate_avatars.py --multitalk-dir ../MultiTalk
"""

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
AUDIO_DIR = ASSETS / "audio"
IMAGES_DIR = ASSETS / "images"
OUTPUTS_DIR = ROOT / "outputs" / "avatars"

DEFAULT_MULTITALK_DIR = Path(__file__).resolve().parents[2] / "MultiTalk"

ROLES = [
    "software_engineer",
    "data_scientist",
    "product_manager",
    "marketing_manager",
]


def fail(msg: str):
    print(f"[ERROR] {msg}")
    sys.exit(1)


def check_multitalk(multitalk_dir: Path):
    if not multitalk_dir.exists():
        fail(
            f"MultiTalk not found at {multitalk_dir}.\n"
            "  TODO: run -> git clone https://github.com/MeiGen-AI/MultiTalk.git\n"
            "        cd MultiTalk && pip install -r requirements.txt"
        )

    # TODO: verify the checkpoint exists once you know the exact filename.
    # checkpoints = multitalk_dir / "checkpoints"
    # if not checkpoints.exists():
    #     fail(f"MultiTalk checkpoints missing at {checkpoints}. Download the pretrained weights.")


def find_audio(role: str, speaker: str):
    path = AUDIO_DIR / f"{role}_{speaker}.mp3"
    return path if path.exists() else None


def find_image(speaker: str):
    # TODO: drop reference images into pipeline/assets/images/ named
    # interviewer.png and candidate.png.
    for name in (f"{speaker}.png", f"{speaker}.jpg"):
        path = IMAGES_DIR / name
        if path.exists():
            return path
    return None


def main():
    parser = argparse.ArgumentParser(description="Generate MultiTalk avatar videos")
    parser.add_argument("--multitalk-dir", default=str(DEFAULT_MULTITALK_DIR))
    args = parser.parse_args()

    multitalk = Path(args.multitalk_dir)
    check_multitalk(multitalk)
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"MultiTalk repo: {multitalk}")
    print("NOTE: MultiTalk inference requires a GPU + pretrained weights.")
    print("This script validates assets and prints the command to run per role.\n")

    for role in ROLES:
        interviewer_audio = find_audio(role, "interviewer")
        candidate_audio = find_audio(role, "candidate")
        interviewer_img = find_image("interviewer")
        candidate_img = find_image("candidate")

        if not interviewer_audio or not candidate_audio:
            print(f"  [skip] {role}: audio missing (run generate_audio.py first)")
            continue
        if not interviewer_img or not candidate_img:
            print(f"  [skip] {role}: reference images missing (pipeline/assets/images/)")
            continue

        # TODO: replace with MultiTalk's actual inference command. Skeleton:
        #
        #   python <multitalk>/<infer_script>.py \
        #     --source {interviewer_img} --audio {interviewer_audio} --out {OUTPUTS_DIR}/{role}_interviewer.mp4
        #   python <multitalk>/<infer_script>.py \
        #     --source {candidate_img} --audio {candidate_audio} --out {OUTPUTS_DIR}/{role}_candidate.mp4
        #
        # Then splice into a split-screen with ffmpeg:
        #   ffmpeg -i {role}_interviewer.mp4 -i {role}_candidate.mp4 \
        #     -filter_complex "[0:v][1:v]hstack=inputs=2,format=yuv420p" -c:a aac {role}_raw.mp4

        print(
            f"  [todo] {role}: run MultiTalk inference for interviewer + candidate "
            f"(see TODO in {__file__})"
        )

    print("\nDone. Run the commands in the TODOs to generate the raw avatar MP4s.")


if __name__ == "__main__":
    main()
