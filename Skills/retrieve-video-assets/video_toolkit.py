#!/usr/bin/env python3
"""
Video asset toolkit — queries Resumora videocatalog (no new deps).

Usage:
  python skills/retrieve-video-assets/video_toolkit.py
  VIDEO_CATALOG_URL=https://resumora.net/api/video/catalog python skills/retrieve-video-assets/video_toolkit.py

Prints title, status, and bucket path only (never secrets).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


DEFAULT_URL = "https://resumora.net/api/video/catalog"


def _bucket_path(video: dict) -> str:
    for key in (
        "bucket_path",
        "gcs_path",
        "gs_uri",
        "storagePath",
        "storage_path",
        "master_path",
        "url_mp4_en",
        "url_mp4",
        "url",
    ):
        val = video.get(key)
        if val:
            return str(val)
    vid = video.get("video_id") or video.get("id") or ""
    if vid:
        return f"gs://resumora-videos/masters/{vid}"
    return "—"


def _title(video: dict) -> str:
    return str(
        video.get("title_EN")
        or video.get("title")
        or video.get("name")
        or video.get("video_id")
        or video.get("id")
        or "untitled"
    )


def _status(video: dict) -> str:
    return str(
        video.get("status")
        or video.get("publish_status")
        or video.get("state")
        or ("fallback" if video.get("source") == "fallback" else "available")
    )


def fetch_catalog(url: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "resumora-video-toolkit/1.0"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode("utf-8", errors="replace")
    return json.loads(body)


def list_assets(url: str | None = None) -> list[dict]:
    catalog_url = url or os.environ.get("VIDEO_CATALOG_URL") or DEFAULT_URL
    data = fetch_catalog(catalog_url)
    videos = data.get("videos") if isinstance(data, dict) else data
    if not isinstance(videos, list):
        videos = []
    rows = []
    for v in videos:
        if not isinstance(v, dict):
            continue
        rows.append(
            {
                "title": _title(v),
                "status": _status(v),
                "bucket_path": _bucket_path(v),
                "video_id": str(v.get("video_id") or v.get("id") or ""),
            }
        )
    return rows


def main() -> int:
    url = os.environ.get("VIDEO_CATALOG_URL") or DEFAULT_URL
    try:
        rows = list_assets(url)
    except urllib.error.HTTPError as err:
        print(f"ERROR: HTTP {err.code} from catalog", file=sys.stderr)
        return 1
    except Exception as err:  # noqa: BLE001 — CLI surface
        print(f"ERROR: {err}", file=sys.stderr)
        return 1

    print(f"# videocatalog ({len(rows)} videos)")
    print(f"{'TITLE':<48} {'STATUS':<14} BUCKET_PATH")
    print("-" * 100)
    for row in rows:
        title = (row["title"][:45] + "…") if len(row["title"]) > 46 else row["title"]
        print(f"{title:<48} {row['status']:<14} {row['bucket_path']}")
    print(json.dumps({"ok": True, "count": len(rows), "videos": rows}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
