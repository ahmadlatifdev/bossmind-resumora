#Requires -Version 5.1
<#
.SYNOPSIS
  Resumora master pipeline - single orchestrator for secrets, validation, and CI deploy handoff.

.DESCRIPTION
  Sequential chain (no local firebase deploy):
    [0] bootstrap-secrets.ps1
    [1] preflight vs golden tag
    [2] npm run build
    [3] UI consistency / golden baseline
    [4] optional: print gh workflow dispatch command (Validate mode)

  Modes:
    Validate       - full chain (default)
    Status         - git/tag status only
    BootstrapOnly  - secrets bootstrap only
    Audit          - print automation health commands (read-only)

.PARAMETER Mode
  Validate | Status | BootstrapOnly | Audit

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\master-pipeline.ps1 -Mode Validate
#>
param(
  [ValidateSet('Validate', 'Status', 'BootstrapOnly', 'Audit')]
  [string]$Mode = 'Validate'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

try {
  Write-Host "=== Resumora master-pipeline ($Mode) ===" -ForegroundColor Cyan
  Write-Host "Golden tag expected: v1.0.0-design-locked"
  Write-Host "Deploy policy: git push -> GitHub Actions only (no local firebase/gcloud deploy)"
  Write-Host "Orchestrator: bootstrap -> validate -> (CI) deploy. Emergency script is break-glass only."

  function Assert-NoManualDeployHints {
    Write-Host "Guard: refusing any local firebase deploy / gcloud run from this script."
  }

  Assert-NoManualDeployHints

  if ($Mode -eq 'Audit') {
    Write-Host ""
    Write-Host "=== Automation audit commands (run manually; values never printed) ===" -ForegroundColor Yellow
    Write-Host 'gh run list --workflow=deploy-prod.yml --limit 30 --repo ahmadlatifdev/bossmind-resumora'
    Write-Host 'gh secret list --repo ahmadlatifdev/bossmind-resumora'
    Write-Host 'gcloud secrets list --project=resumora-live'
    Write-Host 'gcloud run services logs read selfhealmonitor --project=resumora-live --region=us-central1 --limit=50'
    Write-Host 'See docs/AUTOMATION_OPTIMIZATION_REPORT.md for scored results.'
    return
  }

  if ($Mode -eq 'Status') {
    git status -sb
    git rev-parse v1.0.0-design-locked 2>$null
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Tag v1.0.0-design-locked not found locally. git fetch --tags"
    }
    else {
      Write-Host "Tag v1.0.0-design-locked OK"
    }
    return
  }

  if (-not (Test-Path (Join-Path $Root 'package.json'))) {
    throw "package.json missing - wrong directory?"
  }

  Write-Host ""
  Write-Host "[0/4] Bootstrap secrets (FIREBASE_SERVICE_ACCOUNT + BILIBILI length)..." -ForegroundColor Yellow
  & (Join-Path $PSScriptRoot 'bootstrap-secrets.ps1')
  if ($LASTEXITCODE -ne 0) {
    throw "bootstrap-secrets.ps1 failed - aborting pipeline"
  }

  if ($Mode -eq 'BootstrapOnly') {
    Write-Host "BootstrapOnly complete." -ForegroundColor Green
    return
  }

  Write-Host ""
  Write-Host "[1/4] Preflight diff vs golden tag (summary)..." -ForegroundColor Yellow
  git rev-parse v1.0.0-design-locked 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    git diff --stat v1.0.0-design-locked -- .
  }
  else {
    Write-Warning "Skipping tag diff - create/fetch v1.0.0-design-locked first."
  }

  Write-Host ""
  Write-Host "[2/4] npm run build..." -ForegroundColor Yellow
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "build failed - abort" }

  Write-Host ""
  Write-Host "[3/4] UI consistency (+ golden baseline if present)..." -ForegroundColor Yellow
  $baseline = Join-Path $Root 'artifacts\golden-baseline'
  if (Test-Path $baseline) {
    node scripts/ui-consistency-check.js --serve --compare-baseline artifacts/golden-baseline
  }
  else {
    Write-Warning "artifacts/golden-baseline missing - cross-page check only"
    node scripts/ui-consistency-check.js --serve
  }
  if ($LASTEXITCODE -ne 0) { throw "ui-consistency failed - abort" }

  Write-Host ""
  Write-Host "VALIDATE OK. Next: commit exact files, tag v1.0.0-design-update-N, git push (10-min prod gate)." -ForegroundColor Green
  Write-Host "Do NOT run firebase deploy locally."
  Write-Host "Unblock CI deploy: gh workflow run `"Deploy Firebase Hosting Production`" --repo ahmadlatifdev/bossmind-resumora"
  return
}
catch {
  Write-Host ("FAILURE: {0}" -f $_.Exception.Message) -ForegroundColor Red
  throw
}
