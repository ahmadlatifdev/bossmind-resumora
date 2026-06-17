# Deploy bossmind-resumora to Firebase Hosting + create GCS bucket
# Run as privategate777@gmail.com after: gcloud auth login && firebase login --no-localhost

$ErrorActionPreference = "Stop"
$ProjectId = "key-journal-378204"
$Bucket = "bossmind-storage-10gb"
$Region = "us-central1"

$gcloud = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
if (-not (Test-Path $gcloud)) { $gcloud = "gcloud" }

Write-Host "=== Auth check ===" -ForegroundColor Cyan
& $gcloud auth list
firebase login:list

Write-Host "=== Build ===" -ForegroundColor Cyan
Set-Location $PSScriptRoot
npm install
npm run build
if (-not (Test-Path dist)) { throw "dist/ missing" }

Write-Host "=== Firebase Hosting deploy ===" -ForegroundColor Cyan
firebase deploy --only hosting --project $ProjectId

Write-Host "=== GCS bucket ===" -ForegroundColor Cyan
& $gcloud config set project $ProjectId
$exists = & $gcloud storage buckets describe "gs://$Bucket" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Bucket already exists: gs://$Bucket"
} else {
    & $gcloud storage buckets create "gs://$Bucket" --project=$ProjectId --location=$Region --uniform-bucket-level-access
}

Write-Host "`nHosting: https://${ProjectId}.web.app" -ForegroundColor Green
Write-Host "Bucket:  gs://$Bucket" -ForegroundColor Green
