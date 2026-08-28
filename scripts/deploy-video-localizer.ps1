<#
.SYNOPSIS
  Step-by-step production deploy for resumora-live video-localizer.

.DESCRIPTION
  Deploys from services/video-localizer (NOT repo root).
  Does not print secret values.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\deploy-video-localizer.ps1
#>

[CmdletBinding()]
param(
  [string]$Project = "resumora-live",
  [string]$Region = "us-central1",
  [string]$Service = "video-localizer",
  [string]$Bucket = "resumora-videos",
  [int]$TimeoutSec = 3600,
  [switch]$SkipIam
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ServiceDir = Join-Path $RepoRoot "services\video-localizer"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host ("==> " + $Message) -ForegroundColor Cyan
}

function Invoke-GcloudCmd {
  param([Parameter(Mandatory = $true)][string[]]$ArgumentList)
  & gcloud @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw ("gcloud exit " + $LASTEXITCODE + " : " + ($ArgumentList -join " "))
  }
}

Write-Step "0) Preconditions"
if (-not (Test-Path (Join-Path $ServiceDir "Dockerfile"))) { throw "Missing Dockerfile" }
if (-not (Test-Path (Join-Path $ServiceDir "app.py")) ) { throw "Missing app.py" }
if (-not (Test-Path (Join-Path $ServiceDir "localizer_engine.py"))) { throw "Missing localizer_engine.py" }
Invoke-GcloudCmd -ArgumentList @("config", "set", "project", $Project)
$projectNumber = (gcloud projects describe $Project --format="value(projectNumber)")
$computeSa = "$projectNumber-compute@developer.gserviceaccount.com"
Write-Host "compute SA: $computeSa"

Write-Step "1) Enable APIs"
Invoke-GcloudCmd -ArgumentList @(
  "services", "enable",
  "run.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
  "secretmanager.googleapis.com",
  "storage.googleapis.com",
  "firestore.googleapis.com",
  "--project=$Project"
)

Write-Step "2) GCS bucket"
$bucketUri = "gs://{0}" -f $Bucket
$bucketMissing = $true
try {
  $null = cmd /c "gcloud storage buckets describe $bucketUri --project=$Project 1>nul 2>nul"
  if ($LASTEXITCODE -eq 0) { $bucketMissing = $false }
} catch {
  $bucketMissing = $true
}
if ($bucketMissing) {
  Invoke-GcloudCmd -ArgumentList @(
    "storage", "buckets", "create", $bucketUri,
    "--project=$Project",
    "--location=$Region",
    "--uniform-bucket-level-access"
  )
} else {
  Write-Host "Bucket exists - skip"
}

Write-Step "3) Secret LOCALIZER_SHARED_SECRET"
$secretMissing = $true
try {
  $null = cmd /c "gcloud secrets describe LOCALIZER_SHARED_SECRET --project=$Project 1>nul 2>nul"
  if ($LASTEXITCODE -eq 0) { $secretMissing = $false }
} catch {
  $secretMissing = $true
}
if ($secretMissing) {
  Invoke-GcloudCmd -ArgumentList @(
    "secrets", "create", "LOCALIZER_SHARED_SECRET",
    "--project=$Project",
    "--replication-policy=automatic"
  )
  $tmp = Join-Path $env:TEMP ("localizer-sec-" + [guid]::NewGuid().ToString("N").Substring(0, 8) + ".txt")
  try {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    Set-Content -Path $tmp -Value ([Convert]::ToBase64String($bytes)) -NoNewline -Encoding ascii
    Invoke-GcloudCmd -ArgumentList @(
      "secrets", "versions", "add", "LOCALIZER_SHARED_SECRET",
      "--project=$Project",
      "--data-file=$tmp"
    )
  } finally {
    if (Test-Path $tmp) { Remove-Item $tmp -Force }
  }
} else {
  Write-Host "Secret exists - keep current version"
}

if (-not $SkipIam) {
  Write-Step "4) IAM bindings"
  Invoke-GcloudCmd -ArgumentList @("projects", "add-iam-policy-binding", $Project, "--member=serviceAccount:$computeSa", "--role=roles/storage.objectAdmin", "--condition=None") | Out-Null
  Invoke-GcloudCmd -ArgumentList @("projects", "add-iam-policy-binding", $Project, "--member=serviceAccount:$computeSa", "--role=roles/datastore.user", "--condition=None") | Out-Null
  Invoke-GcloudCmd -ArgumentList @("projects", "add-iam-policy-binding", $Project, "--member=serviceAccount:$computeSa", "--role=roles/aiplatform.user", "--condition=None") | Out-Null
  Invoke-GcloudCmd -ArgumentList @("secrets", "add-iam-policy-binding", "LOCALIZER_SHARED_SECRET", "--project=$Project", "--member=serviceAccount:$computeSa", "--role=roles/secretmanager.secretAccessor") | Out-Null
}

Write-Step "5) Cloud Run deploy video-localizer"
Write-Host "Source dir: $ServiceDir"
# IMPORTANT: never --source . from Vite repo root
Push-Location $ServiceDir
try {
  & gcloud run deploy $Service `
    --project=$Project `
    --region=$Region `
    --source=. `
    --memory=8Gi `
    --cpu=4 `
    --timeout=$TimeoutSec `
    --concurrency=1 `
    --max-instances=2 `
    --cpu-boost `
    --no-cpu-throttling `
    --set-env-vars="GOOGLE_CLOUD_PROJECT=$Project,GCS_BUCKET_NAME=$Bucket,FORCE_EDGE_TTS=1,WHISPER_MODEL=base" `
    --set-secrets="LOCALIZER_SHARED_SECRET=LOCALIZER_SHARED_SECRET:latest" `
    --allow-unauthenticated
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Deploy with --allow-unauthenticated failed; retrying without it"
    Invoke-GcloudCmd -ArgumentList @(
      "run", "deploy", $Service,
      "--project=$Project",
      "--region=$Region",
      "--source=.",
      "--memory=8Gi",
      "--cpu=4",
      "--timeout=$TimeoutSec",
      "--concurrency=1",
      "--max-instances=2",
      "--cpu-boost",
      "--no-cpu-throttling",
      "--set-env-vars=GOOGLE_CLOUD_PROJECT=$Project,GCS_BUCKET_NAME=$Bucket,FORCE_EDGE_TTS=1,WHISPER_MODEL=base",
      "--set-secrets=LOCALIZER_SHARED_SECRET=LOCALIZER_SHARED_SECRET:latest"
    )
  }
} finally {
  Pop-Location
}

Write-Step "6) Invoker IAM workaround"
& gcloud run services update $Service --project=$Project --region=$Region --no-invoker-iam-check
if ($LASTEXITCODE -ne 0) {
  Write-Warning "Could not set --no-invoker-iam-check"
}

Write-Step "7) Smoke /health (not /healthz — reserved by Cloud Run)"
$url = gcloud run services describe $Service --project=$Project --region=$Region --format="value(status.url)"
Write-Host "Service URL: $url"
try {
  $h = Invoke-RestMethod -Uri ($url + "/health") -TimeoutSec 120
  Write-Host ("health: " + ($h | ConvertTo-Json -Compress))
} catch {
  Write-Warning ("health not reachable yet: " + $_.Exception.Message)
}

Write-Host ""
Write-Host "NEXT:"
Write-Host ("  1) Set VIDEO_LOCALIZER_URL on localizevideo functions to: " + $url)
Write-Host "  2) firebase deploy --only functions:resumora-checkout:localizeVideo,functions:resumora-checkout:localizeVideoStatus --project resumora-live"
Write-Host "  3) npm run build && firebase deploy --only hosting --project resumora-live"
Write-Host "DONE"
