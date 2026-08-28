<#
.SYNOPSIS
  Idempotent one-shot setup for Google Veo 3 on resumora-live.

.DESCRIPTION
  - Sets gcloud project
  - Creates veo-video-runner SA (if missing)
  - Binds aiplatform.user + storage.objectAdmin (SA + default compute SA)
  - Creates GCS bucket resumora-videos (if missing)
  - Creates/rotates Secret Manager VEO_SERVICE_ACCOUNT_KEY from a temp JSON key
  - Grants secretAccessor to default compute SA
  - Deletes local key file immediately after upload
  - Deploys generateGoogleVideo + googleVideoStatus via Firebase
  - Updates Cloud Run env/secrets + --no-invoker-iam-check

.NOTES
  Does NOT print secret JSON or key material.
  Do NOT use gcloud run deploy createCheckoutSession --source . (wrong service + wrong source).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File D:\BossMind\bossmind-resumora\scripts\setup-veo.ps1
#>

[CmdletBinding()]
param(
  [switch]$SkipDeploy,
  [switch]$SkipKeyRotation
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# ---------------------------------------------------------------------------
# 1) Variables
# ---------------------------------------------------------------------------
$PROJECT = "resumora-live"
$SA_ID = "veo-video-runner"
$REGION = "us-central1"
$GCS_BUCKET = "resumora-videos"
$SECRET_NAME = "VEO_SERVICE_ACCOUNT_KEY"
$SA_EMAIL = "$SA_ID@$PROJECT.iam.gserviceaccount.com"
$REPO_ROOT = Split-Path -Parent $PSScriptRoot
$KEY_FILE = Join-Path $env:TEMP "veo-key-$([guid]::NewGuid().ToString('N').Substring(0,8)).json"
$VEO_SERVICES = @("generategooglevideo", "googlevideostatus")

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found on PATH: $Name"
  }
}

function Invoke-GcloudChecked {
  param([Parameter(Mandatory = $true)][string[]]$ArgumentList)
  & gcloud @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw ("gcloud failed (exit " + $LASTEXITCODE + "): gcloud " + ($ArgumentList -join " "))
  }
}

function Test-ServiceAccountExists([string]$Email) {
  gcloud iam service-accounts describe $Email --project=$PROJECT 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}

function Test-SecretExists([string]$Name) {
  gcloud secrets describe $Name --project=$PROJECT 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}

function Test-BucketExists([string]$Bucket) {
  gcloud storage buckets describe "gs://$Bucket" --project=$PROJECT 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}

function Ensure-ProjectIamBinding {
  param(
    [Parameter(Mandatory = $true)][string]$Member,
    [Parameter(Mandatory = $true)][string]$Role
  )
  # Idempotent: gcloud add-iam-policy-binding is safe to re-run
  Invoke-GcloudChecked @(
    "projects", "add-iam-policy-binding", $PROJECT,
    "--member=$Member",
    "--role=$Role",
    "--condition=None"
  ) | Out-Null
}

try {
  Assert-Command "gcloud"
  Assert-Command "firebase"
  Assert-Command "npm"
  Assert-Command "node"

  # ---------------------------------------------------------------------------
  # 2) Set project
  # ---------------------------------------------------------------------------
  Write-Step "Set gcloud project to $PROJECT"
  Invoke-GcloudChecked @("config", "set", "project", $PROJECT)

  $PROJECT_NUMBER = (gcloud projects describe $PROJECT --format="value(projectNumber)" 2>$null)
  if (-not $PROJECT_NUMBER) { throw "Unable to resolve project number for $PROJECT" }
  $COMPUTE_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
  Write-Host "Project number: $PROJECT_NUMBER"
  Write-Host "Compute SA: $COMPUTE_SA"
  Write-Host "Veo SA: $SA_EMAIL"

  # ---------------------------------------------------------------------------
  # 3) Create service account (idempotent)
  # ---------------------------------------------------------------------------
  Write-Step "Ensure service account $SA_ID exists"
  if (Test-ServiceAccountExists $SA_EMAIL) {
    Write-Host "Service account already exists — skip create"
  } else {
    Invoke-GcloudChecked @(
      "iam", "service-accounts", "create", $SA_ID,
      "--display-name=Veo video runner",
      "--project=$PROJECT"
    )
    Write-Host "Created service account $SA_EMAIL"
  }

  # ---------------------------------------------------------------------------
  # 4) Bind IAM roles (SA + compute SA for ADC fallback)
  # ---------------------------------------------------------------------------
  Write-Step "Bind IAM roles (aiplatform.user + storage.objectAdmin)"
  foreach ($role in @("roles/aiplatform.user", "roles/storage.objectAdmin")) {
    Ensure-ProjectIamBinding -Member "serviceAccount:$SA_EMAIL" -Role $role
    Ensure-ProjectIamBinding -Member "serviceAccount:$COMPUTE_SA" -Role $role
    Write-Host "OK $role"
  }

  # ---------------------------------------------------------------------------
  # 5) Create GCS bucket (idempotent)
  # ---------------------------------------------------------------------------
  Write-Step "Ensure GCS bucket gs://$GCS_BUCKET ($REGION)"
  if (Test-BucketExists $GCS_BUCKET) {
    Write-Host "Bucket already exists - skip create"
  } else {
    # Prefer gcloud storage (gsutil mb alternative)
    $createOut = gcloud storage buckets create "gs://$GCS_BUCKET" `
      --project=$PROJECT `
      --location=$REGION `
      --uniform-bucket-level-access 2>&1
    if ($LASTEXITCODE -ne 0) {
      $joined = ($createOut | Out-String)
      if ($joined -match "already exists|Conflict|409") {
        Write-Host "Bucket already exists (race) - continue"
      } else {
        throw "Failed to create bucket gs://$GCS_BUCKET : $joined"
      }
    } else {
      Write-Host "Created gs://$GCS_BUCKET"
    }
  }

  # ---------------------------------------------------------------------------
  # 6) Generate & store secret (optional skip for re-runs)
  # ---------------------------------------------------------------------------
  Write-Step "Secret Manager: $SECRET_NAME"
  if (-not (Test-SecretExists $SECRET_NAME)) {
    Invoke-GcloudChecked @(
      "secrets", "create", $SECRET_NAME,
      "--project=$PROJECT",
      "--replication-policy=automatic"
    )
    Write-Host "Created secret $SECRET_NAME"
  } else {
    Write-Host "Secret already exists - will add new version unless -SkipKeyRotation"
  }

  if (-not $SkipKeyRotation) {
    try {
      Write-Host "Creating temporary SA key (path redacted)..."
      Invoke-GcloudChecked @(
        "iam", "service-accounts", "keys", "create", $KEY_FILE,
        "--iam-account=$SA_EMAIL",
        "--project=$PROJECT"
      )
      if (-not (Test-Path -LiteralPath $KEY_FILE)) {
        throw "Key file was not created"
      }

      Invoke-GcloudChecked @(
        "secrets", "versions", "add", $SECRET_NAME,
        "--project=$PROJECT",
        "--data-file=$KEY_FILE"
      )
      Write-Host "Uploaded new secret version for $SECRET_NAME"
    }
    finally {
      # CRITICAL: delete local key immediately
      if (Test-Path -LiteralPath $KEY_FILE) {
        Remove-Item -LiteralPath $KEY_FILE -Force -ErrorAction SilentlyContinue
        Write-Host "Deleted local key file"
      }
    }
  } else {
    Write-Host "SkipKeyRotation set - not creating a new SA key"
  }

  Write-Step "Grant secretAccessor on $SECRET_NAME to compute SA"
  Invoke-GcloudChecked @(
    "secrets", "add-iam-policy-binding", $SECRET_NAME,
    "--project=$PROJECT",
    "--member=serviceAccount:$COMPUTE_SA",
    "--role=roles/secretmanager.secretAccessor"
  ) | Out-Null

  # ---------------------------------------------------------------------------
  # 7) Deploy Veo Cloud Functions (NOT createCheckoutSession / NOT --source .)
  # ---------------------------------------------------------------------------
  if ($SkipDeploy) {
    Write-Step "SkipDeploy set — skipping Firebase/Cloud Run deploy"
  } else {
    Write-Step "Install functions dependencies"
    Push-Location (Join-Path $REPO_ROOT "functions")
    try {
      npm install --no-fund --no-audit
      if ($LASTEXITCODE -ne 0) { throw "npm install failed in functions/" }
    }
    finally {
      Pop-Location
    }

    Write-Step "Firebase deploy generateGoogleVideo + googleVideoStatus"
    Push-Location $REPO_ROOT
    try {
      # IAM invoker set often fails under org policy; treat as soft if URLs printed
      firebase deploy `
        --only "functions:resumora-checkout:generateGoogleVideo,functions:resumora-checkout:googleVideoStatus" `
        --project $PROJECT
      $fbExit = $LASTEXITCODE
      if ($fbExit -ne 0) {
        Write-Warning "firebase deploy exited $fbExit (often invoker IAM). Checking whether services exist…"
      }
    }
    finally {
      Pop-Location
    }

    Write-Step "Bind secrets/env + disable invoker IAM check on Veo services"
    $envVars = "GCS_BUCKET_NAME=$GCS_BUCKET,VEO_OUTPUT_BUCKET=$GCS_BUCKET,VEO_MODEL_ID=veo-3.1-fast-generate-001,VEO_LOCATION=$REGION"
    foreach ($svc in $VEO_SERVICES) {
      gcloud run services describe $svc --project=$PROJECT --region=$REGION 2>$null | Out-Null
      if ($LASTEXITCODE -ne 0) {
        throw "Cloud Run service '$svc' not found after deploy. Fix firebase deploy, then re-run this script."
      }

      Invoke-GcloudChecked @(
        "run", "services", "update", $svc,
        "--project=$PROJECT",
        "--region=$REGION",
        "--no-invoker-iam-check",
        "--update-env-vars=$envVars",
        "--update-secrets=${SECRET_NAME}=${SECRET_NAME}:latest"
      )
      Write-Host "Updated Cloud Run service: $svc"
    }
  }

  Write-Step "DONE — Veo setup complete"
  Write-Host "Project:  $PROJECT"
  Write-Host "Bucket:   gs://$GCS_BUCKET"
  Write-Host "Secret:   $SECRET_NAME (value not printed)"
  Write-Host "SA:       $SA_EMAIL"
  Write-Host "Services: $($VEO_SERVICES -join ', ')"
  Write-Host ""
  Write-Host "Next: npm run build ; firebase deploy --only hosting --project $PROJECT"
  Write-Host "Or:   node scripts/deploy-hosting-api.mjs"
  Write-Host "Generate library masters:"
  Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\generate-library-masters-veo.ps1"
  exit 0
}
catch {
  Write-Host ""
  Write-Host ("SETUP FAILED: " + $_.Exception.Message) -ForegroundColor Red
  if (Test-Path -LiteralPath $KEY_FILE) {
    Remove-Item -LiteralPath $KEY_FILE -Force -ErrorAction SilentlyContinue
    Write-Host "Cleaned up local key file after failure"
  }
  exit 1
}
