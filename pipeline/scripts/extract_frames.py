#!/usr/bin/env python3
"""Extract the first frame of existing videos as PNG reference images via FFmpeg."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# (source video relative to repo root, output image relative to repo root)
PAIRS = [
    ("videos/01-resume-to-interview-en.mp4", "pipeline/assets/images/interviewer.png"),
    ("videos/02-star-behavioral-en.mp4", "pipeline/assets/images/candidate.png"),
]


def extract(src: str, dst: str) -> bool:
    src_path = ROOT / src
    dst_path = ROOT / dst
    if not src_path.exists():
        print(f"[WARN] source video missing: {src}")
        return False
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(src_path), "-frames:v", "1", "-q:v", "2", str(dst_path)],
        check=True,
        capture_output=True,
    )
    print(f"[OK] {src} -> {dst} ({dst_path.stat().st_size} bytes)")
    return dst_path.exists()


def main():
    ok = sum(1 for src, dst in PAIRS if extract(src, dst))
    print(f"Extracted {ok}/{len(PAIRS)} frames.")
    if ok == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
