<#
.SYNOPSIS
  Deploy Resumora video-localizer Cloud Run worker (Whisper + EdgeTTS).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\setup-video-localizer.ps1
#>

[CmdletBinding()]
param(
  [string]$Project = "resumora-live",
  [string]$Region = "us-central1",
  [string]$Service = "video-localizer",
  [string]$Bucket = "resumora-videos",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ServiceDir = Join-Path $RepoRoot "services\video-localizer"

function Invoke-Gcloud {
  param([string[]]$ArgumentList)
  & gcloud @ArgumentList
  if ($LASTEXITCODE -ne 0) { throw ("gcloud failed: " + ($ArgumentList -join " ")) }
}

if (-not (Test-Path (Join-Path $ServiceDir "Dockerfile"))) {
  throw "Missing Dockerfile at $ServiceDir"
}
if (-not (Test-Path (Join-Path $ServiceDir "localizer_engine.py"))) {
  throw "Missing localizer_engine.py - copy from vendor/ first"
}

Write-Host "==> Project $Project"
Invoke-Gcloud -ArgumentList @("config", "set", "project", $Project)

$projectNumber = (gcloud projects describe $Project --format="value(projectNumber)")
$computeSa = "$projectNumber-compute@developer.gserviceaccount.com"

Write-Host "==> Ensure GCS bucket gs://$Bucket"
$bucketMissing = $true
try {
  $null = cmd /c "gcloud storage buckets describe gs://$Bucket --project=$Project 1>nul 2>nul"
  if ($LASTEXITCODE -eq 0) { $bucketMissing = $false }
} catch {
  $bucketMissing = $true
}
if ($bucketMissing) {
  Invoke-Gcloud -ArgumentList @(
    "storage", "buckets", "create", "gs://$Bucket",
    "--project=$Project", "--location=$Region", "--uniform-bucket-level-access"
  )
}

Write-Host "==> Ensure Secret LOCALIZER_SHARED_SECRET"
$secretMissing = $true
try {
  $null = cmd /c "gcloud secrets describe LOCALIZER_SHARED_SECRET --project=$Project 1>nul 2>nul"
  if ($LASTEXITCODE -eq 0) { $secretMissing = $false }
} catch {
  $secretMissing = $true
}
if ($secretMissing) {
  Invoke-Gcloud -ArgumentList @("secrets", "create", "LOCALIZER_SHARED_SECRET", "--project=$Project", "--replication-policy=automatic")
  $tmp = Join-Path $env:TEMP ("localizer-secret-" + [guid]::NewGuid().ToString("N").Substring(0, 8) + ".txt")
  try {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = [Convert]::ToBase64String($bytes)
    Set-Content -Path $tmp -Value $secret -NoNewline -Encoding ascii
    Invoke-Gcloud -ArgumentList @("secrets", "versions", "add", "LOCALIZER_SHARED_SECRET", "--project=$Project", "--data-file=$tmp")
  }
  finally {
    if (Test-Path $tmp) { Remove-Item $tmp -Force }
  }
}

Write-Host "==> IAM for compute SA"
Invoke-Gcloud -ArgumentList @("projects", "add-iam-policy-binding", $Project, "--member=serviceAccount:$computeSa", "--role=roles/storage.objectAdmin", "--condition=None") | Out-Null
Invoke-Gcloud -ArgumentList @("projects", "add-iam-policy-binding", $Project, "--member=serviceAccount:$computeSa", "--role=roles/datastore.user", "--condition=None") | Out-Null
Invoke-Gcloud -ArgumentList @("secrets", "add-iam-policy-binding", "LOCALIZER_SHARED_SECRET", "--project=$Project", "--member=serviceAccount:$computeSa", "--role=roles/secretmanager.secretAccessor") | Out-Null

if (-not $SkipBuild) {
  Write-Host "==> gcloud run deploy $Service (cpu=4 memory=8Gi timeout=3600)"
  Push-Location $ServiceDir
  try {
    # Prefer explicit args (Windows PowerShell splat edge cases). Org policy: no allUsers.
    & gcloud run deploy $Service `
      --project=$Project `
      --region=$Region `
      --source=. `
      --cpu=4 `
      --memory=8Gi `
      --timeout=3600 `
      --concurrency=1 `
      --max-instances=2 `
      --cpu-boost `
      --no-cpu-throttling `
      --set-env-vars="GOOGLE_CLOUD_PROJECT=$Project,GCS_BUCKET_NAME=$Bucket,FORCE_EDGE_TTS=1,WHISPER_MODEL=base" `
      --set-secrets="LOCALIZER_SHARED_SECRET=LOCALIZER_SHARED_SECRET:latest" `
      --quiet
    if ($LASTEXITCODE -ne 0) {
      throw "gcloud run deploy failed with exit $LASTEXITCODE"
    }
    & gcloud run services update $Service --project=$Project --region=$Region --no-invoker-iam-check --quiet
  }
  finally {
    Pop-Location
  }
}

$url = gcloud run services describe $Service --project=$Project --region=$Region --format="value(status.url)"
Write-Host ""
Write-Host "DONE"
Write-Host "Service URL: $url"
Write-Host "Smoke: curl.exe `$url/health  (do not use /healthz - reserved by Cloud Run)"
Write-Host "Set VIDEO_LOCALIZER_URL on localizevideo / localizevideostatus Cloud Functions (value not a Stripe secret)."
Write-Host "Then: firebase deploy --only functions:resumora-checkout:localizeVideo,functions:resumora-checkout:localizeVideoStatus"
Write-Host ("Frontend: npm run build; firebase deploy --only hosting --project " + $Project)
