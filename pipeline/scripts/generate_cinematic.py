#!/usr/bin/env python3
"""
Chunked Conversational Video Pipeline (wan-2.2-s2v).

Processes an interview script in small per-turn chunks to avoid timeouts:

  1. Dialogue engine — reads turns (JSON or markdown), mapping Coach->Interviewer
     and Job Seeker->Candidate.
  2. TTS — Edge-TTS per turn -> pipeline/assets/audio/turn_XXX.mp3.
  3. Caching — skip a turn if pipeline/outputs/segments/turn_XXX.mp4 exists.
  4. Video — wan-2.2-s2v lip-sync from a speaker image + audio (retry + chunking).
  5. Stitch — FFmpeg concat of all segments -> final_interview.mp4.
  6. Upload — Firebase Storage masters/interview-series-v1/.

HEAVY-STEP TODOs (this script prints these instead of failing):
  * wan-2.2-s2v model — install locally or use Replicate/Fal.ai (see generate_turn_video).
  * Reference images — pipeline/assets/images/interviewer.png + candidate.png.
  * Firebase upload — pip install google-cloud-storage + GOOGLE_APPLICATION_CREDENTIALS.

Usage:
  python pipeline/scripts/generate_cinematic.py
  python pipeline/scripts/generate_cinematic.py --script docs/interview-series/01_build_strong_resume.md
  python pipeline/scripts/generate_cinematic.py --json pipeline/assets/turns.json
"""

import argparse
import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = ROOT / "docs" / "interview-series"
PIPELINE = ROOT / "pipeline"
AUDIO_DIR = PIPELINE / "assets" / "audio"
IMAGES_DIR = PIPELINE / "assets" / "images"
SEGMENTS_DIR = PIPELINE / "outputs" / "segments"
OUTPUTS_DIR = PIPELINE / "outputs"

VOICES = {
    "Interviewer": "en-US-ChristopherNeural",
    "Candidate": "en-US-GuyNeural",
}
SPEAKER_MAP = {
    "Coach": "Interviewer",
    "Job Seeker": "Candidate",
    "Interviewer": "Interviewer",
    "Candidate": "Candidate",
}
SPEAKER_IMAGE = {
    "Interviewer": "interviewer.png",
    "Candidate": "candidate.png",
}

MAX_CHUNK_SECONDS = 10
RETRY_ATTEMPTS = 3


# --------------------------------------------------------------------------- #
# Dialogue engine
# --------------------------------------------------------------------------- #
def parse_turn_list(raw):
    """Accept a list of {speaker|role, text} or a {"turns": [...]} wrapper."""
    if isinstance(raw, dict) and "turns" in raw:
        raw = raw["turns"]
    turns = []
    for item in raw:
        speaker = item.get("speaker") or item.get("role") or ""
        text = (item.get("text") or "").strip()
        if speaker and text:
            turns.append((speaker, text))
    return turns


def extract_turns_from_markdown(path: Path):
    turns = []
    for line in path.read_text(encoding="utf-8").splitlines():
        for label in SPEAKER_MAP:
            if line.startswith(f"{label}:"):
                text = line.split(":", 1)[1].strip()
                if text:
                    turns.append((label, text))
                break
    return turns


def load_turns(json_path, markdown_path):
    if json_path and Path(json_path).exists():
        try:
            raw = json.loads(Path(json_path).read_text(encoding="utf-8"))
            turns = parse_turn_list(raw)
            if turns:
                print(f"[dialogue] loaded {len(turns)} turns from {json_path}")
                return turns
        except (json.JSONDecodeError, TypeError):
            print(f"[WARN] {json_path} is not valid JSON — falling back to markdown")

    if markdown_path and Path(markdown_path).exists():
        turns = extract_turns_from_markdown(Path(markdown_path))
        print(f"[dialogue] extracted {len(turns)} turns from {markdown_path}")
        return turns

    print("[ERROR] No dialogue source found. Pass --script or --json.")
    sys.exit(1)


def normalize_turns(turns):
    """Map Coach->Interviewer, Job Seeker->Candidate."""
    out = []
    for speaker, text in turns:
        out.append((SPEAKER_MAP.get(speaker, "Interviewer"), text))
    return out


# --------------------------------------------------------------------------- #
# TTS (Edge-TTS)
# --------------------------------------------------------------------------- #
def audio_duration(path: Path) -> float:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(path)],
            check=True, capture_output=True, text=True,
        )
        return float(out.stdout.strip())
    except Exception:
        return 0.0


async def synth_turn(text: str, voice: str, out: Path):
    import edge_tts

    last = None
    for attempt in range(3):
        try:
            await edge_tts.Communicate(text, voice).save(str(out))
            return
        except Exception as exc:  # NoAudioReceived / network
            last = exc
            await asyncio.sleep(2 * (attempt + 1))
    raise last


# --------------------------------------------------------------------------- #
# Video generation (wan-2.2-s2v) — placeholder backend + retry + chunking
# --------------------------------------------------------------------------- #
def chunk_audio(audio_path: Path):
    """Split audio into <=10s chunks to avoid memory/timeout crashes."""
    dur = audio_duration(audio_path)
    if dur <= MAX_CHUNK_SECONDS:
        return [audio_path]
    n = int(dur // MAX_CHUNK_SECONDS) + 1
    chunks = []
    for i in range(n):
        out = audio_path.with_name(f"{audio_path.stem}_chunk{i}.mp3")
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(i * MAX_CHUNK_SECONDS),
             "-t", str(MAX_CHUNK_SECONDS), "-i", str(audio_path),
             "-c", "copy", str(out)],
            check=True, capture_output=True,
        )
        chunks.append(out)
    return chunks


def _backend():
    """Return the configured wan-2.2-s2v backend, or None."""
    if os.environ.get("WAN_S2V_API_URL"):
        return ("local", os.environ["WAN_S2V_API_URL"])
    token = os.environ.get("REPLICATE_API_TOKEN", "").strip()
    if token and token != "your_token_here":
        return ("replicate", token)
    if os.environ.get("FAL_KEY"):
        return ("fal", os.environ["FAL_KEY"])
    return None


def _download_url(url: str, out_path: Path) -> bool:
    req = urllib.request.Request(url, headers={"User-Agent": "resumora-pipeline/1.0"})
    with urllib.request.urlopen(req, timeout=600) as resp, open(out_path, "wb") as f:
        shutil.copyfileobj(resp, f)
    return out_path.exists() and out_path.stat().st_size > 0


def _run_replicate(image_path: Path, audio_path: Path):
    import httpx
    import replicate
    from replicate.exceptions import ReplicateError

    # Default SDK read timeout is 30s, which is too short for video generation.
    client = replicate.Client(
        timeout=httpx.Timeout(connect=10.0, read=1800.0, write=60.0, pool=10.0)
    )

    # Try slugs in order; fall back to the next one only on a 404 (renamed/moved model).
    model_slugs = [
        "wan-video/wan-2.2-s2v",
        "wan-ai/wan-2.2-s2v",
        "replicate-pruna/wan-2.2-s2v",
    ]

    last_error = None
    for slug in model_slugs:
        with open(image_path, "rb") as img, open(audio_path, "rb") as aud:
            input_data = {
                "image": img,
                "audio": aud,
                "prompt": (
                    "A professional career coach speaking clearly to the camera, "
                    "cinematic lighting, realistic."
                ),
                "interpolate": False,
            }
            try:
                output = client.run(slug, input=input_data)
            except ReplicateError as exc:
                if exc.status == 404:
                    last_error = exc
                    print(f"  [replicate] {slug} not found (404); trying next slug")
                    continue
                raise

        if isinstance(output, list):
            output = output[0] if output else None
        if output is None:
            return None
        return getattr(output, "url", None) or str(output)

    raise last_error


def generate_turn_video(audio_path: Path, image_path: Path, out_path: Path) -> bool:
    backend = _backend()
    if backend is None:
        print(
            "[TODO] wan-2.2-s2v backend not configured. Set ONE of:\n"
            "  * Local:  download the wan-2.2-s2v weights and run a local server, then\n"
            "            set WAN_S2V_API_URL=http://127.0.0.1:8000\n"
            "  * Replicate: pip install replicate, set REPLICATE_API_TOKEN, and call the\n"
            "            wan-2.2-s2v model (owner/name from the Replicate model page).\n"
            "  * Fal.ai:   set FAL_KEY and call the fal wan-2.2-s2v endpoint.\n"
            "  Skipping video generation for this turn."
        )
        return False

    if not image_path.exists():
        print(f"[TODO] missing speaker image {image_path} — skipping.")
        return False

    # Chunk long audio to prevent crashes.
    chunks = chunk_audio(audio_path)

    for attempt in range(1, RETRY_ATTEMPTS + 1):
        try:
            print(
                f"  [replicate] (attempt {attempt}/{RETRY_ATTEMPTS}) generating "
                f"{out_path.name} from {audio_path.name} ({len(chunks)} chunk(s))"
            )
            url = _run_replicate(image_path, chunks[0])
            if not url:
                print("  [replicate] no output URL returned")
                return False
            _download_url(url, out_path)
            print(f"  [replicate] done -> {out_path.name}")
            return True
        except Exception as exc:
            wait = 2 ** attempt
            print(f"  [retry] attempt {attempt} failed ({exc}); waiting {wait}s")
            time.sleep(wait)

    print(f"  [ERROR] generation failed after {RETRY_ATTEMPTS} attempts for {out_path.name}")
    return False


# --------------------------------------------------------------------------- #
# FFmpeg stitching
# --------------------------------------------------------------------------- #
def stitch(segment_paths, out_path):
    if not segment_paths:
        print("[stitch] no segments to concatenate")
        return False
    concat_file = SEGMENTS_DIR / "concat.txt"
    concat_file.write_text(
        "".join(f"file '{p.as_posix()}'\n" for p in segment_paths), encoding="utf-8"
    )
    print(f"[stitch] concatenating {len(segment_paths)} segments -> {out_path}")
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file),
         "-c", "copy", str(out_path)],
        check=True,
    )
    return out_path.exists()


# --------------------------------------------------------------------------- #
# Firebase upload
# --------------------------------------------------------------------------- #
def upload_to_firebase(local_path: Path, destination: str) -> bool:
    try:
        from google.cloud import storage  # noqa: F401
    except ImportError:
        print(
            "[TODO] google-cloud-storage (Python) is not installed. Run:\n"
            "  pip install google-cloud-storage\n"
            "  set GOOGLE_APPLICATION_CREDENTIALS=<path-to-service-account.json>\n"
            f"  then upload {local_path.name} to gs://<bucket>/{destination}"
        )
        return False

    bucket_name = os.environ.get("STORAGE_BUCKET", "resumora-videos")
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(destination)
    blob.upload_from_filename(str(local_path), content_type="video/mp4")
    print(f"[upload] gs://{bucket_name}/{destination}")
    return True


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
async def process_turn(index, speaker, text):
    turn = index + 1
    audio_path = AUDIO_DIR / f"turn_{turn:03d}.mp3"
    segment_path = SEGMENTS_DIR / f"turn_{turn:03d}.mp4"

    if segment_path.exists():
        print(f"[Skipping] Turn {turn} already exists")
        return segment_path

    print(f"[turn {turn}] ({speaker}) {text[:60]}…")

    # 1. TTS
    if not audio_path.exists():
        await synth_turn(text, VOICES[speaker], audio_path)
        print(f"  [tts] {audio_path.name}")

    # 2. Video generation (cached + retry + chunking)
    image_path = IMAGES_DIR / SPEAKER_IMAGE.get(speaker, "interviewer.png")
    if not generate_turn_video(audio_path, image_path, segment_path):
        return None

    return segment_path


async def main():
    parser = argparse.ArgumentParser(description="Chunked conversational video pipeline")
    parser.add_argument("--script", default=str(SCRIPTS_DIR / "01_build_strong_resume.md"))
    parser.add_argument("--json", default=None)
    parser.add_argument("--limit", type=int, default=0, help="Process only the first N turns (0 = all)")
    args = parser.parse_args()

    load_dotenv(ROOT / ".env")

    token = os.environ.get("REPLICATE_API_TOKEN", "").strip()
    if token == "your_token_here":
        print("=" * 64)
        print("[ACTION REQUIRED] REPLICATE_API_TOKEN is still the placeholder.")
        print("  Paste your real token into the root .env file, replacing")
        print("  'your_token_here', then re-run this script.")
        print("=" * 64)

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    SEGMENTS_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

    turns = normalize_turns(load_turns(args.json, args.script))
    if args.limit > 0:
        turns = turns[: args.limit]
    print(f"Total turns: {len(turns)}")

    segments = []
    for index, (speaker, text) in enumerate(turns):
        segment = await process_turn(index, speaker, text)
        if segment:
            segments.append(segment)

    final = OUTPUTS_DIR / "final_interview.mp4"
    if stitch(segments, final):
        upload_to_firebase(final, "masters/interview-series-v1/final_interview.mp4")
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
