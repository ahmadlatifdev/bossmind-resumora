#!/usr/bin/env bash
# Firebase Hosting + GCS bucket for bossmind-resumora (run in Replit Shell or local terminal)
set -euo pipefail

PROJECT_ID="key-journal-378204"
BUCKET_NAME="bossmind-resumora-data-${PROJECT_ID}"
REGION="us-central1"

echo "=== Project: $PROJECT_ID ==="
gcloud config set project "$PROJECT_ID"

echo "=== Enable APIs ==="
gcloud services enable \
  firebase.googleapis.com \
  firebasehosting.googleapis.com \
  storage.googleapis.com \
  storage-api.googleapis.com \
  --project="$PROJECT_ID"

echo "=== Link Firebase (skip if already linked) ==="
firebase projects:addfirebase "$PROJECT_ID" 2>/dev/null || true

echo "=== Create storage bucket (10GB+ capacity; pay per use) ==="
if gsutil ls -p "$PROJECT_ID" "gs://${BUCKET_NAME}" >/dev/null 2>&1; then
  echo "Bucket already exists: gs://${BUCKET_NAME}"
else
  gsutil mb -p "$PROJECT_ID" -c STANDARD -l "$REGION" "gs://${BUCKET_NAME}/"
  echo "Created: gs://${BUCKET_NAME}"
fi

echo "=== Build static site ==="
npm ci
npm run build
test -d dist || { echo "dist/ missing after build"; exit 1; }

echo "=== Deploy Firebase Hosting ==="
npx firebase-tools deploy --only hosting --project "$PROJECT_ID"

echo "=== Done ==="
echo "Hosting: https://${PROJECT_ID}.web.app"
echo "Bucket:  gs://${BUCKET_NAME}"
