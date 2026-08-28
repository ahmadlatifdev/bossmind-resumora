"""
Resumora Video Localizer — Cloud Run HTTP API.

Wraps Global Video Localizer engine (Whisper → deep-translator → EdgeTTS → ffmpeg)
from MCP-1st-Birthday/video-dubber (MIT). ElevenLabs is optional and unused by default.
"""

from __future__ import annotations

import logging
import os
import shutil
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import requests
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

# Force open-source TTS path (no ElevenLabs) unless explicitly enabled
os.environ.setdefault("FORCE_EDGE_TTS", "1")
if os.environ.get("FORCE_EDGE_TTS", "1") == "1":
    os.environ.pop("ELEVENLABS_API_KEY", None)

import localizer_engine as engine  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("video-localizer")

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCP_PROJECT") or "resumora-live"
GCS_BUCKET = os.environ.get("GCS_BUCKET_NAME") or os.environ.get("VEO_OUTPUT_BUCKET") or "resumora-videos"
SHARED_SECRET = os.environ.get("LOCALIZER_SHARED_SECRET", "").strip()
PUBLIC_BASE = os.environ.get("PUBLIC_STORAGE_BASE", f"https://storage.googleapis.com/{GCS_BUCKET}")

app = FastAPI(title="Resumora Video Localizer", version="1.0.0")

# In-memory job mirror (Cloud Run single instance OK; Firestore is source of truth)
_JOBS: dict[str, dict[str, Any]] = {}
_LOCK = threading.Lock()


class LocalizeRequest(BaseModel):
    video_id: str = Field(..., min_length=2)
    target_language: str = Field(..., description="fr or es")
    source_url: str = Field(..., description="HTTPS URL of source EN MP4")
    update_firestore: bool = True


def _check_auth(authorization: Optional[str], x_localizer_secret: Optional[str]) -> None:
    if not SHARED_SECRET:
        return  # local/dev
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif x_localizer_secret:
        token = x_localizer_secret.strip()
    if token != SHARED_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _norm_lang(code: str) -> str:
    c = (code or "").strip().lower()[:2]
    if c not in ("fr", "es"):
        raise HTTPException(status_code=400, detail="target_language must be fr or es")
    return c


def _download(url: str, dest: Path) -> None:
    with requests.get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 256):
                if chunk:
                    f.write(chunk)


def _upload_gcs(local_path: Path, object_name: str) -> str:
    from google.cloud import storage

    client = storage.Client(project=PROJECT_ID)
    bucket = client.bucket(GCS_BUCKET)
    blob = bucket.blob(object_name)
    blob.upload_from_filename(str(local_path), content_type="video/mp4")
    try:
        blob.make_public()
    except Exception as exc:  # noqa: BLE001
        logger.warning("make_public skipped: %s", exc)
    return f"{PUBLIC_BASE.rstrip('/')}/{object_name}"


def _update_firestore(video_id: str, lang: str, video_url: str, job_id: str) -> None:
    from google.cloud import firestore

    db = firestore.Client(project=PROJECT_ID)
    field = f"url_mp4_{lang}"
    db.collection("videos").document(video_id).set(
        {
            field: video_url,
            f"localize_status_{lang}": "ready",
            f"localize_job_{lang}": job_id,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        },
        merge=True,
    )
    db.collection("video_localize_jobs").document(job_id).set(
        {
            "status": "completed",
            "video_id": video_id,
            "target_language": lang,
            "output_url": video_url,
            "finishedAt": datetime.now(timezone.utc).isoformat(),
        },
        merge=True,
    )


def _set_job(job_id: str, **fields: Any) -> None:
    with _LOCK:
        job = _JOBS.get(job_id, {})
        job.update(fields)
        _JOBS[job_id] = job
    try:
        from google.cloud import firestore

        db = firestore.Client(project=PROJECT_ID)
        db.collection("video_localize_jobs").document(job_id).set(fields, merge=True)
    except Exception as exc:  # noqa: BLE001
        logger.warning("firestore job update skipped: %s", exc)


def _run_job(job_id: str, video_id: str, lang: str, source_url: str, update_firestore: bool) -> None:
    work = Path(tempfile.mkdtemp(prefix="localize-"))
    try:
        _set_job(job_id, status="processing", progress="download")
        src = work / "source.mp4"
        _download(source_url, src)

        _set_job(job_id, progress="whisper_translate_tts")
        # Engine returns (output_path, original_text, translated_text)
        out_path, original_text, translated_text = engine.process_video(str(src), lang)
        out_file = Path(out_path)
        if not out_file.exists():
            raise FileNotFoundError(f"Engine output missing: {out_path}")

        _set_job(job_id, progress="upload_gcs")
        object_name = f"localized/{video_id}/{lang}/{job_id}.mp4"
        public_url = _upload_gcs(out_file, object_name)

        if update_firestore:
            _update_firestore(video_id, lang, public_url, job_id)

        _set_job(
            job_id,
            status="completed",
            progress="done",
            output_url=public_url,
            original_chars=len(original_text or ""),
            translated_chars=len(translated_text or ""),
            finishedAt=datetime.now(timezone.utc).isoformat(),
        )
        logger.info("job %s completed → %s", job_id, public_url)
    except Exception as exc:  # noqa: BLE001
        logger.exception("job %s failed", job_id)
        _set_job(
            job_id,
            status="failed",
            error=str(exc)[:500],
            finishedAt=datetime.now(timezone.utc).isoformat(),
        )
    finally:
        shutil.rmtree(work, ignore_errors=True)


# Note: Cloud Run reserves paths ending in "z" (e.g. /healthz). Use /health.
@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "engine": "video-dubber/edge-tts", "project": PROJECT_ID}


@app.post("/v1/localize")
def localize(
    body: LocalizeRequest,
    authorization: Optional[str] = Header(default=None),
    x_localizer_secret: Optional[str] = Header(default=None, alias="X-Localizer-Secret"),
) -> dict[str, Any]:
    _check_auth(authorization, x_localizer_secret)
    lang = _norm_lang(body.target_language)
    if not body.source_url.startswith("https://"):
        raise HTTPException(status_code=400, detail="source_url must be https")

    job_id = uuid.uuid4().hex
    _set_job(
        job_id,
        status="queued",
        video_id=body.video_id,
        target_language=lang,
        source_url=body.source_url,
        createdAt=datetime.now(timezone.utc).isoformat(),
    )
    thread = threading.Thread(
        target=_run_job,
        args=(job_id, body.video_id, lang, body.source_url, body.update_firestore),
        daemon=True,
    )
    thread.start()
    return {"jobId": job_id, "status": "queued", "target_language": lang, "video_id": body.video_id}


@app.get("/v1/jobs/{job_id}")
def job_status(
    job_id: str,
    authorization: Optional[str] = Header(default=None),
    x_localizer_secret: Optional[str] = Header(default=None, alias="X-Localizer-Secret"),
) -> dict[str, Any]:
    _check_auth(authorization, x_localizer_secret)
    with _LOCK:
        job = _JOBS.get(job_id)
    if job:
        return {"jobId": job_id, **job}
    try:
        from google.cloud import firestore

        snap = firestore.Client(project=PROJECT_ID).collection("video_localize_jobs").document(job_id).get()
        if snap.exists:
            return {"jobId": job_id, **(snap.to_dict() or {})}
    except Exception as exc:  # noqa: BLE001
        logger.warning("firestore read failed: %s", exc)
    raise HTTPException(status_code=404, detail="Job not found")
