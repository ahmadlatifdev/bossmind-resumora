#Requires -Version 5.1
<#
.SYNOPSIS
  Validates PowerShell script syntax under scripts/ (no window-closing exit).

.DESCRIPTION
  Parses *.ps1 files with the PowerShell AST parser. Never calls exit -
  uses throw / return so an interactive PowerShell session stays open.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\validate-ps-syntax.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\validate-ps-syntax.ps1 -Pause
#>
param(
  [switch]$Pause
)

Write-Host "To run this script, type: powershell -ExecutionPolicy Bypass -File .\scripts\validate-ps-syntax.ps1" -ForegroundColor Cyan

$ErrorActionPreference = 'Stop'
$script:Failed = $false
$script:Checked = 0
$script:Errors = New-Object System.Collections.Generic.List[string]

try {
  $repoRoot = Split-Path -Parent $PSScriptRoot
  if (-not $repoRoot -or -not (Test-Path -LiteralPath $repoRoot)) {
    throw "Could not resolve repository root from PSScriptRoot."
  }

  Set-Location -LiteralPath $repoRoot
  Write-Host "Repo root: $repoRoot" -ForegroundColor DarkGray

  $targets = @(
    Get-ChildItem -LiteralPath (Join-Path $repoRoot 'scripts') -Filter '*.ps1' -File -ErrorAction Stop
  )

  if ($targets.Count -eq 0) {
    throw "No .ps1 files found under scripts\."
  }

  Write-Host ("Validating {0} PowerShell script(s)..." -f $targets.Count) -ForegroundColor Yellow

  foreach ($file in $targets) {
    $script:Checked++
    $tokens = $null
    $parseErrors = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile(
      $file.FullName,
      [ref]$tokens,
      [ref]$parseErrors
    )

    if ($parseErrors -and $parseErrors.Count -gt 0) {
      $script:Failed = $true
      foreach ($err in $parseErrors) {
        $line = $err.Extent.StartLineNumber
        $msg = "FAIL  $($file.Name):${line} - $($err.Message)"
        $script:Errors.Add($msg) | Out-Null
        Write-Host $msg -ForegroundColor Red
      }
    }
    else {
      Write-Host ("OK    {0}" -f $file.Name) -ForegroundColor Green
    }
  }

  if ($script:Failed) {
    Write-Host ""
    Write-Host ("FAILURE: {0} syntax error(s) across {1} file(s) checked." -f $script:Errors.Count, $script:Checked) -ForegroundColor Red
    Write-Host "Fix the listed scripts, then re-run with -File (do not paste script body into the terminal)." -ForegroundColor Yellow
    # Do NOT call exit - propagate failure without closing the host window.
    throw ("validate-ps-syntax failed with {0} error(s)." -f $script:Errors.Count)
  }

  Write-Host ""
  Write-Host ("SUCCESS: All {0} PowerShell script(s) passed syntax validation." -f $script:Checked) -ForegroundColor Green
  Write-Host "Tip: Always run via -File. Pasting code into the prompt can trap you in >> continuation mode." -ForegroundColor DarkGray
  return
}
catch {
  Write-Host ""
  Write-Host ("FAILURE: {0}" -f $_.Exception.Message) -ForegroundColor Red
  # Re-throw so callers (CI / master-pipeline) see a non-success path without exit.
  throw
}
finally {
  if ($Pause) {
    Write-Host ""
    Read-Host "Press Enter to continue (window stays open - this script never calls exit)"
  }
}
