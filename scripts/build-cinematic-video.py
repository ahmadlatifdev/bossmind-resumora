#!/usr/bin/env python3
"""
Hybrid Build — cinematic course videos from existing audio + B-roll.

For a given master MP4:
  1. probes its duration (the target length)
  2. randomly samples B-roll .mp4 clips (with repetition) until they cover the target
  3. scales/crops every clip to 1920x1080, concatenates them, trims to the target
  4. muxes the master's audio track back in
  5. writes the final cinematic MP4

Dependencies:
  - FFmpeg binary on PATH (ffmpeg + ffprobe)
  - ffmpeg-python  (pip install ffmpeg-python)

Example:
  python scripts/build-cinematic-video.py \
    --master public/videos/01-resume-to-interview-en.mp4 \
    --broll  assets/broll \
    --output out/01-resume-to-interview-en-cinematic.mp4

Loop all 12 masters:
  python scripts/build-cinematic-video.py --all --masters public/videos --broll assets/broll --outdir out
"""
import argparse
import glob
import os
import random
import sys

try:
    import ffmpeg
except ImportError:
    sys.exit("Missing dependency. Run:  pip install ffmpeg-python")

W, H = 1920, 1080
FPS = 30
CODEC = "libx264"


def probe_duration(path):
    try:
        meta = ffmpeg.probe(path)
        return float(meta["format"]["duration"])
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"ffprobe failed for {path}: {exc}")


def build_one(master, broll_dir, output, target=None, seed=None):
    rng = random.Random(seed)
    clips = sorted(glob.glob(os.path.join(broll_dir, "*.mp4")))
    if not clips:
        raise SystemExit(f"No .mp4 clips found in {broll_dir}")

    target = float(target) if target else probe_duration(master)
    durations = {c: probe_duration(c) for c in clips}
    if not any(d > 0 for d in durations.values()):
        raise SystemExit("All B-roll clips have zero duration — check the files.")

    # Random order, repeat as needed until cumulative length >= target.
    sequence, total = [], 0.0
    guard = 0
    while total < target and guard < 5000:
        clip = rng.choice(clips)
        sequence.append(clip)
        total += durations[clip]
        guard += 1

    print(f"[{os.path.basename(master)}] target={target:.1f}s  "
          f"clips={len(sequence)}  covered={total:.1f}s")

    inputs = [ffmpeg.input(master)]
    inputs += [ffmpeg.input(c) for c in sequence]

    # Normalize every clip: cover-crop to 1920x1080, lock fps + reset timestamps.
    video_nodes = []
    for i in range(1, len(inputs)):
        node = (
            inputs[i]
            .video.filter("scale", W, H, force_original_aspect_ratio="increase")
            .filter("crop", W, H)
            .filter("setsar", "1")
            .filter("fps", FPS)
            .filter("setpts", "PTS-STARTPTS")
        )
        video_nodes.append(node)

    joined = ffmpeg.concat(*video_nodes, n=len(video_nodes), v=1, a=0)
    joined = joined.filter("trim", duration=target).filter("setpts", "PTS-STARTPTS")

    audio = inputs[0].audio.filter("atrim", duration=target).filter("asetpts", "PTS-STARTPTS")

    out = (
        ffmpeg.output(
            joined,
            audio,
            output,
            vcodec=CODEC,
            crf=20,
            preset="medium",
            acodec="aac",
            audio_bitrate="192k",
            pix_fmt="yuv420p",
            r=FPS,
            movflags="+faststart",
        )
        .global_args("-shortest")
        .overwrite_output()
    )

    os.makedirs(os.path.dirname(output) or ".", exist_ok=True)
    print("  running ffmpeg (this transcodes 8 min — be patient)…")
    out.run(capture_stdout=True, capture_stderr=True)
    print(f"  done -> {output}")


def main():
    ap = argparse.ArgumentParser(description="Cinematic B-roll stitcher")
    ap.add_argument("--master", help="single master MP4 (provides audio + duration)")
    ap.add_argument("--broll", help="folder of B-roll .mp4 clips")
    ap.add_argument("--output", help="output path for the cinematic MP4")
    ap.add_argument("--all", action="store_true", help="process every master in --masters dir")
    ap.add_argument("--masters", default="public/videos", help="masters dir (with --all)")
    ap.add_argument("--outdir", default="out", help="output dir (with --all)")
    ap.add_argument("--duration", type=float, default=None, help="override target seconds")
    ap.add_argument("--seed", type=int, default=None, help="reproducible random order")
    args = ap.parse_args()

    if args.all:
        masters = sorted(glob.glob(os.path.join(args.masters, "*.mp4")))
        if not masters:
            raise SystemExit(f"No masters found in {args.masters}")
        for m in masters:
            out = os.path.join(args.outdir, f"{os.path.splitext(os.path.basename(m))[0]}-cinematic.mp4")
            build_one(m, args.broll, out, args.duration, args.seed)
        print(f"\nProcessed {len(masters)} masters.")
        return

    if not (args.master and args.broll and args.output):
        raise SystemExit("Provide --master/--broll/--output, or use --all --masters --broll --outdir")

    build_one(args.master, args.broll, args.output, args.duration, args.seed)


if __name__ == "__main__":
    main()
