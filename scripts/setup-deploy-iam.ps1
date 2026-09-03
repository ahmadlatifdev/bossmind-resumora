#Requires -Version 5.1
<#
.SYNOPSIS
  Idempotent IAM baseline for declarative Cloud Run / Cloud Deploy (resumora-live).

.DESCRIPTION
  Grants deployment service account roles required for first-try Skaffold + Cloud Deploy
  releases and Firebase Functions Gen2 (Secret Manager metadata + version access).

  Never prints sk_live_, whsec_, pk_live_, price_ IDs, JSON keys, or secret values.

.PARAMETER ProjectId
  GCP project (default resumora-live).

.PARAMETER ServiceAccountId
  Deploy SA short id (default gh-oidc-sa). Use -CreateDedicatedDeploySa for a new SA.

.PARAMETER CreateDedicatedDeploySa
  Create resumora-deploy-sa@PROJECT instead of using gh-oidc-sa.

.PARAMETER WhatIf
  Print planned gcloud commands without executing.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\setup-deploy-iam.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\setup-deploy-iam.ps1 -CreateDedicatedDeploySa

.EXAMPLE
  # Verify bindings after apply:
  gcloud projects get-iam-policy resumora-live `
    --flatten="bindings[].members" `
    --filter="bindings.members:serviceAccount:gh-oidc-sa@resumora-live.iam.gserviceaccount.com" `
    --format="table(bindings.role)"
#>
param(
  [string]$ProjectId = 'resumora-live',
  [string]$ServiceAccountId = 'gh-oidc-sa',
  [switch]$CreateDedicatedDeploySa,
  [switch]$SkipCloudDeployRoles,
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if ($CreateDedicatedDeploySa) {
  $ServiceAccountId = 'resumora-deploy-sa'
}

$SaEmail = "$ServiceAccountId@$ProjectId.iam.gserviceaccount.com"

function Write-Step { param([string]$Message) Write-Host "[setup-deploy-iam] $Message" -ForegroundColor Cyan }
function Write-Ok { param([string]$Message) Write-Host "[setup-deploy-iam] OK $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "[setup-deploy-iam] WARN $Message" -ForegroundColor Yellow }

function Invoke-GcloudRaw {
  param([string[]]$GcloudArgs)
  $argLine = ($GcloudArgs | ForEach-Object { if ($_ -match '\s') { "`"$_`"" } else { $_ } }) -join ' '
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  try {
    $out = cmd.exe /c "gcloud $argLine 2>&1" | Out-String
    return @{ Output = $out; ExitCode = $LASTEXITCODE }
  }
  finally { $ErrorActionPreference = $prev }
}

function Invoke-Gcloud {
  param([string[]]$GcloudArgs, [string]$Label, [switch]$AllowExists)
  Write-Step $Label
  if ($WhatIf) {
    Write-Host "  gcloud $($GcloudArgs -join ' ')" -ForegroundColor DarkGray
    return
  }
  $r = Invoke-GcloudRaw -GcloudArgs $GcloudArgs
  if ($r.ExitCode -eq 0) { return }
  if ($AllowExists -and $r.Output -match 'already exists|ALREADY_EXISTS|duplicate|Policy update access denied') {
    Write-Warn "$Label (already exists or unchanged)"
    return
  }
  Write-Host $r.Output
  throw "gcloud failed: $Label (exit $($r.ExitCode))"
}

function Test-SaHasRole {
  param([string]$Role)
  if ($WhatIf) { return $true }
  $r = Invoke-GcloudRaw @(
    'projects', 'get-iam-policy', $ProjectId,
    '--flatten=bindings[].members',
    "--filter=bindings.members:serviceAccount:$SaEmail AND bindings.role:$Role",
    '--format=value(bindings.role)'
  )
  return ($r.ExitCode -eq 0 -and $r.Output.Trim() -eq $Role)
}

try {
  Write-Host '=== Resumora Declarative Deploy IAM ===' -ForegroundColor Yellow
  Write-Host "Project: $ProjectId | Service account: $SaEmail"

  if (-not $WhatIf) { $null = Get-Command gcloud -ErrorAction Stop }

  Invoke-Gcloud @(
    'services', 'enable',
    'run.googleapis.com',
    'clouddeploy.googleapis.com',
    'secretmanager.googleapis.com',
    'cloudbuild.googleapis.com',
    '--project', $ProjectId
  ) -Label 'Enable Cloud Run, Cloud Deploy, Secret Manager APIs'

  if ($CreateDedicatedDeploySa) {
    Invoke-Gcloud @(
      'iam', 'service-accounts', 'create', $ServiceAccountId,
      '--project', $ProjectId,
      '--display-name', 'Resumora declarative deploy (Cloud Deploy + Skaffold)'
    ) -Label "Create service account $ServiceAccountId" -AllowExists
  }

  # Task 1 — required roles (project level)
  $requiredRoles = @(
    'roles/secretmanager.secretAccessor',
    'roles/run.developer',
    'roles/run.admin'
  )

  # Cloud Deploy + first-try Firebase Functions deploy (secrets.get metadata)
  $cloudDeployRoles = @(
    'roles/secretmanager.viewer',
    'roles/clouddeploy.admin',
    'roles/iam.serviceAccountUser',
    'roles/storage.objectAdmin',
    'roles/storage.admin',
    'roles/resourcemanager.projectIamAdmin',
    'roles/cloudscheduler.admin',
    'roles/eventarc.admin',
    'roles/pubsub.admin'
  )

  $allRoles = $requiredRoles
  if (-not $SkipCloudDeployRoles) { $allRoles += $cloudDeployRoles }

  foreach ($role in $allRoles) {
    Invoke-Gcloud @(
      'projects', 'add-iam-policy-binding', $ProjectId,
      '--member', "serviceAccount:$SaEmail",
      '--role', $role,
      '--condition', 'None'
    ) -Label "Grant $role to $ServiceAccountId" -AllowExists
  }

  # Per-secret accessor (Firebase defineSecret resources)
  $secretIds = @('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'GEMINI_API_KEY', 'ADMIN_REFUND_PASSWORD', 'HERMES_API_KEY', 'HERMES_API_SERVER_KEY', 'API_SERVER_KEY', 'ALPHA_VANTAGE_KEY')
  foreach ($secretId in $secretIds) {
    Write-Step "Grant secretAccessor on secret $secretId"
    if ($WhatIf) {
      Write-Host "  gcloud secrets add-iam-policy-binding $secretId ..." -ForegroundColor DarkGray
      continue
    }
    $r = Invoke-GcloudRaw @(
      'secrets', 'add-iam-policy-binding', $secretId,
      '--project', $ProjectId,
      '--member', "serviceAccount:$SaEmail",
      '--role', 'roles/secretmanager.secretAccessor'
    )
    if ($r.ExitCode -ne 0 -and $r.Output -notmatch 'NOT_FOUND') {
      Write-Warn "Secret $secretId binding skipped or failed (create secret in Secret Manager if missing)"
    }
  }

  Write-Host ''
  Write-Host '=== Verification ===' -ForegroundColor Yellow
  $verifyCmd = @(
    'gcloud projects get-iam-policy', $ProjectId,
    '--flatten=bindings[].members',
    "--filter=bindings.members:serviceAccount:$SaEmail",
    '--format=table(bindings.role)'
  ) -join ' '
  Write-Host "Run this command to confirm IAM bindings are active:" -ForegroundColor White
  Write-Host $verifyCmd -ForegroundColor Gray

  if (-not $WhatIf) {
    Write-Step 'Live verification (roles on deploy SA)'
    $r = Invoke-GcloudRaw @(
      'projects', 'get-iam-policy', $ProjectId,
      '--flatten=bindings[].members',
      "--filter=bindings.members:serviceAccount:$SaEmail",
      '--format=table(bindings.role)'
    )
    Write-Host $r.Output

    $missing = @()
    foreach ($role in $requiredRoles) {
      if (-not (Test-SaHasRole -Role $role)) { $missing += $role }
    }
    if ($missing.Count -gt 0) {
      throw "Missing required roles after apply: $($missing -join ', ')"
    }
    Write-Ok "Required roles confirmed for $SaEmail"
  }

  Write-Host ''
  Write-Ok 'Declarative deploy IAM baseline complete'
  Write-Host 'Next: powershell -ExecutionPolicy Bypass -File .\scripts\setup-workload-identity.ps1 (OIDC)'
  Write-Host 'Then: gcloud deploy apply --file=clouddeploy.yaml --region=us-central1 --project=resumora-live'
}
catch {
  Write-Host "FAILURE: $($_.Exception.Message)" -ForegroundColor Red
  throw
}
