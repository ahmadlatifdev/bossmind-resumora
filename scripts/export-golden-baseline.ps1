#Requires -Version 5.1
<#
.SYNOPSIS
  Build, capture chrome screenshots, write artifacts/golden-baseline for v1.0.0-design-locked.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\export-golden-baseline.ps1
#>
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

try {
  Write-Host "Exporting golden baseline chrome captures..." -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "build failed" }

  node scripts/ui-consistency-check.js --serve --write-baseline artifacts/golden-baseline
  if ($LASTEXITCODE -ne 0) { throw "ui-consistency failed" }

  Write-Host "Wrote artifacts/golden-baseline - commit these PNGs when locking or intentionally updating design." -ForegroundColor Green
  Write-Host "Tag reminder: only move v1.0.0-design-locked with explicit user approval."
  return
}
catch {
  Write-Host ("FAILURE: {0}" -f $_.Exception.Message) -ForegroundColor Red
  throw
}
