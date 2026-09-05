#Requires -Version 5.1
<#
.SYNOPSIS
  Locally apply an ACKED harness task (whitelist only). Never prints secrets.

.DESCRIPTION
  Cloud Functions do not run task commands. After Master Admin ACK, run this
  from the repo root. Only allowlisted command prefixes are executed.

.PARAMETER TaskId
  Firestore harness_tasks document id.

.EXAMPLE
  # Export task JSON from dashboard / admin API first, or pass -CommandsJson
  powershell -ExecutionPolicy Bypass -File .\scripts\apply-harness-task-local.ps1 `
    -TaskId "abc" `
    -CommandsJson '["gcloud run services update postadminhermescommand --region=us-central1 --project=resumora-live --update-env-vars=LOG_LEVEL=info"]'
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $TaskId,
  [string] $CommandsJson = '',
  [string] $ProjectId = 'resumora-live',
  [string] $Region = 'us-central1'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "TaskId: $TaskId"
Write-Host "This script does NOT call Firebase Admin. Paste ACKED commands via -CommandsJson."

if (-not $CommandsJson) {
  throw 'Provide -CommandsJson array of commands from the ACKED task (copy from Master Admin Tasks panel).'
}

$commands = $CommandsJson | ConvertFrom-Json
if (-not ($commands -is [System.Array])) { $commands = @($commands) }

function Test-Allowlisted([string]$cmd) {
  $c = $cmd.Trim()
  if ($c -match '^\s*gcloud\s+run\s+services\s+update\s+\S+.*=LOG_LEVEL=') { return $true }
  if ($c -match '^\s*npm\s+run\s+build\s*$') { return $true }
  if ($c -match '^\s*npm\s+run\s+typecheck\s*$') { return $true }
  return $false
}

foreach ($cmd in $commands) {
  $line = [string]$cmd
  if (-not (Test-Allowlisted $line)) {
    Write-Warning "SKIP (not allowlisted): $($line.Substring(0, [Math]::Min(80, $line.Length)))"
    continue
  }
  Write-Host "RUN: $line"
  cmd.exe /c $line
  if ($LASTEXITCODE -ne 0) { throw "Command failed with exit $LASTEXITCODE" }
}

Write-Host "Done. Mark task applied in Master Admin, then optionally:"
Write-Host "  gh workflow run deploy-prod.yml -f task_id=$TaskId"
