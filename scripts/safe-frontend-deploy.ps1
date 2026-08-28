# Safe production FRONTEND (Hosting-only) deploy — requires typing DEPLOY UI.
# Build must succeed before any deploy runs. Never prints secret values.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\safe-frontend-deploy.ps1

param(
  [string]$Project = "resumora-live",
  [string]$ConfirmWord = "DEPLOY UI"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Info([string]$msg) {
  Write-Host "[safe-frontend-deploy] $msg"
}

Write-Host ""
Write-Host "=== Resumora safe FRONTEND deploy (Hosting only) ===" -ForegroundColor Yellow
Write-Host "Project: $Project"
Write-Host "Step 1: npm run build"
Write-Host "Step 2: firebase deploy --only hosting --project $Project"
Write-Host ""
Write-Host "Type exactly: $ConfirmWord" -ForegroundColor Cyan
Write-Host "(anything else aborts)"
$typed = Read-Host "Confirm"

if ($typed -ne $ConfirmWord) {
  Write-Info "Aborted — confirmation did not match '$ConfirmWord'."
  exit 1
}

$lockScript = Join-Path $PSScriptRoot "verify-firebase-deploy-lock.ps1"
if (Test-Path -LiteralPath $lockScript) {
  Write-Info "Checking Firebase deploy lock..."
  & powershell -NoProfile -ExecutionPolicy Bypass -File $lockScript
  if ($LASTEXITCODE -ne 0) {
    throw "Firebase deploy lock check failed"
  }
}

Write-Info "Running npm run build..."
npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Info "BUILD FAILED — deployment aborted (live client UI unchanged)."
  exit $LASTEXITCODE
}

Write-Info "Build OK. Deploying hosting to $Project..."
firebase deploy --only hosting --project $Project
if ($LASTEXITCODE -ne 0) {
  throw "firebase deploy failed (exit $LASTEXITCODE)"
}

Write-Info "SUCCESS: frontend hosting deploy complete for $Project"
