# Safe production hosting deploy — requires typing DEPLOY to confirm.
# Never prints secret values.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\safe-deploy.ps1

param(
  [string]$Project = "resumora-live",
  [string]$ConfirmWord = "DEPLOY"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Info([string]$msg) {
  Write-Host "[safe-deploy] $msg"
}

Write-Host ""
Write-Host "=== Resumora safe hosting deploy ===" -ForegroundColor Yellow
Write-Host "Project: $Project"
Write-Host "This will run: npm run build"
Write-Host "           then: firebase deploy --only hosting --project $Project"
Write-Host ""
Write-Host "Type $ConfirmWord to continue (anything else aborts):" -ForegroundColor Cyan
$typed = Read-Host "Confirm"

if ($typed -ne $ConfirmWord) {
  Write-Info "Aborted — confirmation did not match '$ConfirmWord'."
  exit 1
}

# Optional deploy lock (fail fast if wrong Firebase project)
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
  throw "npm run build failed (exit $LASTEXITCODE)"
}

Write-Info "Deploying hosting to $Project..."
firebase deploy --only hosting --project $Project
if ($LASTEXITCODE -ne 0) {
  throw "firebase deploy failed (exit $LASTEXITCODE)"
}

Write-Info "SUCCESS: hosting deploy complete for $Project"
