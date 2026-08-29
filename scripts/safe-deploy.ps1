#Requires -Version 5.1
<#
.SYNOPSIS
  Safe deploy entrypoint - never deploys locally; guides git push -> Actions.

.PARAMETER WhatIf
  Print the approved path only.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\safe-deploy.ps1 -WhatIf
#>
param(
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

try {
  Write-Host "=== Resumora safe-deploy ===" -ForegroundColor Cyan
  Write-Host "Manual firebase deploy / gcloud run: BLOCKED"
  Write-Host "Approved path: PR merge -> GitHub Actions -> production environment approval (~10 min)"

  if ($WhatIf) {
    Write-Host ""
    Write-Host "WhatIf plan:"
    Write-Host "  1. Run master-pipeline.ps1 -Mode Validate"
    Write-Host "  2. Commit only patched files on a feature branch"
    Write-Host "  3. git push -u origin HEAD"
    Write-Host "  4. Open/merge PR (ui-regression.yml must pass)"
    Write-Host "  5. Approve production environment in GitHub Actions"
    Write-Host "  6. Verify https://resumora.net"
    return
  }

  & (Join-Path $PSScriptRoot 'master-pipeline.ps1') -Mode Validate

  Write-Host ""
  Write-Host "SAFE-DEPLOY: validation passed." -ForegroundColor Green
  Write-Host "Next actions (human):"
  Write-Host "  git push -u origin HEAD"
  Write-Host "  # then merge PR and approve the production environment gate"
  Write-Host "This script intentionally does not call firebase or gcloud."
  return
}
catch {
  Write-Host ("FAILURE: {0}" -f $_.Exception.Message) -ForegroundColor Red
  throw
}
