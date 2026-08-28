# Roll back a Cloud Run service (Firebase Functions 2nd gen) to a prior revision.
# Never prints secret values.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\rollback.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\rollback.ps1 -Service generategooglevideo
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\rollback.ps1 -Service generategooglevideo -Revision generategooglevideo-00042-abc

param(
  [string]$Project = "resumora-live",
  [string]$Region = "us-central1",
  [string]$Service = "",
  [string]$Revision = "",
  [int]$ListLimit = 8
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Info([string]$msg) {
  Write-Host "[rollback] $msg"
}

function Get-GcloudCmdPath {
  $cmd = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }
  $fallback = Join-Path $env:LOCALAPPDATA "Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
  if (Test-Path -LiteralPath $fallback) { return $fallback }
  throw "gcloud.cmd not found on PATH"
}

$GcloudCmd = Get-GcloudCmdPath

function Invoke-Gcloud {
  param([Parameter(Mandatory = $true)][string[]]$GcloudArgs)
  $argLine = ($GcloudArgs | ForEach-Object {
      if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
    }) -join ' '
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $GcloudCmd
  $psi.Arguments = $argLine
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $proc = [System.Diagnostics.Process]::Start($psi)
  $stdout = $proc.StandardOutput.ReadToEnd()
  $stderr = $proc.StandardError.ReadToEnd()
  $proc.WaitForExit()
  return [PSCustomObject]@{
    ExitCode = $proc.ExitCode
    StdOut   = $stdout
    StdErr   = $stderr
  }
}

if (-not $Service) {
  Write-Host ""
  Write-Host "Cloud Run services in $Region ($Project):" -ForegroundColor Cyan
  $list = Invoke-Gcloud -GcloudArgs @(
    "run", "services", "list",
    "--project=$Project",
    "--region=$Region",
    "--format=table(metadata.name,status.url)"
  )
  if ($list.ExitCode -ne 0) {
    Write-Host $list.StdErr
    throw "Failed to list Cloud Run services"
  }
  Write-Host $list.StdOut
  $Service = (Read-Host "Service name to roll back").Trim()
}

if (-not $Service) {
  Write-Info "Aborted — no service specified."
  exit 1
}

Write-Info "Listing recent revisions for $Service..."
$revs = Invoke-Gcloud -GcloudArgs @(
  "run", "revisions", "list",
  "--service=$Service",
  "--region=$Region",
  "--project=$Project",
  "--format=value(metadata.name)",
  "--limit=$ListLimit",
  "--sort-by=~metadata.creationTimestamp"
)
if ($revs.ExitCode -ne 0) {
  Write-Host $revs.StdErr
  throw "Failed to list revisions for $Service"
}

$revisionNames = @($revs.StdOut -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($revisionNames.Count -lt 1) {
  throw "No revisions found for service $Service"
}

Write-Host ""
Write-Host "Recent revisions (newest first):" -ForegroundColor Cyan
for ($i = 0; $i -lt $revisionNames.Count; $i++) {
  $marker = if ($i -eq 0) { " <- current/latest listed first" } else { "" }
  Write-Host ("  [{0}] {1}{2}" -f $i, $revisionNames[$i], $marker)
}

if (-not $Revision) {
  $defaultIdx = 1
  if ($revisionNames.Count -lt 2) {
    throw "Only one revision exists — nothing to roll back to."
  }
  $pick = Read-Host "Pick index to route 100% traffic to (default $defaultIdx = previous)"
  if ([string]::IsNullOrWhiteSpace($pick)) { $pick = $defaultIdx }
  if ($pick -notmatch '^\d+$') { throw "Invalid index" }
  $idx = [int]$pick
  if ($idx -lt 0 -or $idx -ge $revisionNames.Count) { throw "Index out of range" }
  $Revision = $revisionNames[$idx]
}

Write-Host ""
Write-Host "Will route 100% traffic on $Service to revision:" -ForegroundColor Yellow
Write-Host "  $Revision"
Write-Host ""
Write-Host "Type ROLLBACK to confirm:" -ForegroundColor Cyan
$confirm = Read-Host "Confirm"
if ($confirm -ne "ROLLBACK") {
  Write-Info "Aborted — confirmation did not match ROLLBACK."
  exit 1
}

Write-Info "Updating traffic..."
$traffic = Invoke-Gcloud -GcloudArgs @(
  "run", "services", "update-traffic", $Service,
  "--to-revisions=$Revision=100",
  "--region=$Region",
  "--project=$Project",
  "--quiet"
)
if ($traffic.ExitCode -ne 0) {
  Write-Host $traffic.StdErr
  throw "Traffic update failed (exit $($traffic.ExitCode))"
}

Write-Info "SUCCESS: $Service now serves revision $Revision"
Write-Host $traffic.StdOut
