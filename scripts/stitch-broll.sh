#!/usr/bin/env bash
set -euo pipefail

# Hybrid Cinematic builder — overlay random B-roll over each master's audio.
#
# Usage:
#   ./scripts/stitch-broll.sh
#
# Inputs (override via env):
#   MASTERS_DIR   dir of the 12 master MP4s      (default: public/videos)
#   BROLL_DIR     dir of B-roll .mp4 clips       (default: ./broll)
#   OUT_DIR       output dir                     (default: out)
#   W/H/FPS       target 1920x1080 @ 30fps

MASTERS_DIR="${MASTERS_DIR:-public/videos}"
BROLL_DIR="${BROLL_DIR:-./broll}"
OUT_DIR="${OUT_DIR:-out}"
W="${W:-1920}"
H="${H:-1080}"
FPS="${FPS:-30}"

command -v ffmpeg  >/dev/null 2>&1 || { echo "ERROR: ffmpeg not found"; exit 1; }
command -v ffprobe >/dev/null 2>&1 || { echo "ERROR: ffprobe not found"; exit 1; }
[ -d "$BROLL_DIR" ] || { echo "ERROR: b-roll dir '$BROLL_DIR' not found"; exit 1; }

mkdir -p "$OUT_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1. Normalize every b-roll clip to 1080p (video only) once.
mapfile -t CLIPS < <(find "$BROLL_DIR" -maxdepth 1 -type f -name '*.mp4' | sort -R)
[ "${#CLIPS[@]}" -gt 0 ] || { echo "ERROR: no .mp4 files in '$BROLL_DIR'"; exit 1; }

NORM="$TMP/norm"
mkdir -p "$NORM"
TOTAL=0
for i in "${!CLIPS[@]}"; do
  src="${CLIPS[$i]}"
  n="$NORM/$(printf '%03d' "$i").mp4"
  ffmpeg -y -loglevel error -i "$src" \
    -vf "scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS}" \
    -an -c:v libx264 -crf 18 -preset veryfast -pix_fmt yuv420p "$n"
  d="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$n")"
  TOTAL="$(awk "BEGIN{print $TOTAL + $d}")"
done
echo "Normalized ${#CLIPS[@]} clips — total ${TOTAL}s"
awk "BEGIN{ if ($TOTAL <= 0) exit 1 }" || { echo "ERROR: b-roll clips have zero duration"; exit 1; }

# 2. For each master, build a random concat list covering its duration.
shopt -s nullglob
for master in "$MASTERS_DIR"/*.mp4; do
  name="$(basename "$master" .mp4)"
  out="$OUT_DIR/${name}-cinematic.mp4"
  echo "=== $name ==="

  DUR="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$master")"
  REPS="$(awk "BEGIN{print int($DUR / $TOTAL) + 1}")"

  LIST="$TMP/list.txt"
  : > "$LIST"
  for ((r=0; r<REPS; r++)); do
    for n in "$NORM"/*.mp4; do
      printf "file '%s'\n" "$n" >> "$LIST"
    done
  done

  ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" -t "$DUR" \
    -c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p -r "$FPS" "$TMP/broll.mp4"

  ffmpeg -y -loglevel error -i "$TMP/broll.mp4" -i "$master" \
    -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -movflags +faststart -shortest "$out"

  echo "  done -> $out"
done

echo "All masters processed."
