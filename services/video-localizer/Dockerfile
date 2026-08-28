# syntax=docker/dockerfile:1
# Heavy CPU worker for Global Video Localizer (Whisper + EdgeTTS + ffmpeg).
FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    WHISPER_MODEL=base \
    FORCE_EDGE_TTS=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY localizer_engine.py .
COPY app.py .
COPY ATTRIBUTION.md .

# Pre-warm Whisper base (~150MB) at build time for faster cold starts
RUN python -c "import whisper; whisper.load_model('base')"

ENV PORT=8080
EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--timeout-keep-alive", "75"]
