# Deploy bossmind-resumora to Firebase Hosting + create GCS bucket
# Run in PowerShell as privategate777@gmail.com (gcloud auth login first)

$ErrorActionPreference = "Stop"
$ProjectId = "key-journal-378204"
$BucketName = "bossmind-resumora-data-$ProjectId"
$Region = "us-central1"

$gcloud = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
if (-not (Test-Path $gcloud)) { $gcloud = "gcloud" }

Write-Host "=== Set project $ProjectId ===" -ForegroundColor Cyan
& $gcloud config set project $ProjectId

Write-Host "=== Enable APIs ===" -ForegroundColor Cyan
& $gcloud services enable firebase.googleapis.com firebasehosting.googleapis.com storage.googleapis.com storage-api.googleapis.com --project=$ProjectId

Write-Host "=== Link Firebase project (ok if already linked) ===" -ForegroundColor Cyan
npx firebase-tools projects:addfirebase $ProjectId 2>$null

Write-Host "=== Create GCS bucket ===" -ForegroundColor Cyan
$exists = & gsutil ls -p $ProjectId "gs://$BucketName" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Bucket exists: gs://$BucketName"
} else {
    & gsutil mb -p $ProjectId -c STANDARD -l $Region "gs://$BucketName/"
    Write-Host "Created: gs://$BucketName"
}

Write-Host "=== Build ===" -ForegroundColor Cyan
npm ci
npm run build
if (-not (Test-Path dist)) { throw "dist/ folder missing after build" }

Write-Host "=== Deploy hosting ===" -ForegroundColor Cyan
npx firebase-tools deploy --only hosting --project $ProjectId

Write-Host "`nLive URL: https://${ProjectId}.web.app" -ForegroundColor Green
Write-Host "Bucket:   gs://$BucketName" -ForegroundColor Green
