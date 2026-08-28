# Roll back Firebase Hosting (live client UI) to a prior release version.
# Never prints secret values.
#
# Note: current Firebase CLI has no `hosting:rollback` command. This script uses the
# official equivalent: clone a prior VERSION_ID onto the live channel (same as Console rollback).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\rollback-frontend.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\rollback-frontend.ps1 -VersionId abc123def

param(
  [string]$Project = "resumora-live",
  [string]$Site = "client-resumora-live",
  [string]$Channel = "live",
  [string]$VersionId = "",
  [int]$ListLimit = 5
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Info([string]$msg) {
  Write-Host "[rollback-frontend] $msg"
}

function Get-GcloudCmdPath {
  $cmd = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }
  $fallback = Join-Path $env:LOCALAPPDATA "Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
  if (Test-Path -LiteralPath $fallback) { return $fallback }
  return $null
}

function Get-AccessToken {
  $gcloud = Get-GcloudCmdPath
  if ($gcloud) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $gcloud
    $psi.Arguments = "auth print-access-token"
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $proc = [System.Diagnostics.Process]::Start($psi)
    $out = ($proc.StandardOutput.ReadToEnd()).Trim()
    $null = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()
    if ($proc.ExitCode -eq 0 -and $out) { return $out }
  }
  return ""
}

function Get-HostingReleases {
  param([int]$Limit = 5)
  $token = Get-AccessToken
  if (-not $token) {
    throw "Could not obtain gcloud access token. Run: gcloud auth login"
  }
  $uri = "https://firebasehosting.googleapis.com/v1beta1/sites/$Site/releases?pageSize=$Limit"
  $headers = @{
    Authorization = "Bearer $token"
    Accept        = "application/json"
  }
  try {
    $resp = Invoke-RestMethod -Uri $uri -Headers $headers -Method Get
  } catch {
    throw "Failed to list Hosting releases (need Firebase Hosting Admin). $($_.Exception.Message)"
  }
  $items = @()
  foreach ($rel in @($resp.releases)) {
    $verName = [string]$rel.version.name
    $verId = if ($verName -match '/versions/([^/]+)$') { $Matches[1] } else { "" }
    if (-not $verId) { continue }
    $items += [PSCustomObject]@{
      VersionId   = $verId
      CreateTime  = [string]$rel.createTime
      Message     = [string]$rel.message
      ReleaseName = [string]$rel.name
    }
  }
  return $items
}

function Invoke-HostingRollbackClone {
  param([Parameter(Mandatory = $true)][string]$TargetVersionId)
  $source = "$Site" + ":@" + $TargetVersionId
  $target = "$Site" + ":" + $Channel
  Write-Info "Cloning version $TargetVersionId to live channel (Hosting rollback)..."
  Write-Info "Command: firebase hosting:clone $source $target --project $Project"
  firebase hosting:clone $source $target --project $Project
  if ($LASTEXITCODE -ne 0) {
    throw "firebase hosting:clone failed (exit $LASTEXITCODE)"
  }
}

Write-Host ""
Write-Host "=== Resumora frontend Hosting rollback ===" -ForegroundColor Yellow
Write-Host "Site: $Site | Channel: $Channel | Project: $Project"
Write-Host ""

$releases = Get-HostingReleases -Limit $ListLimit
if ($releases.Count -lt 1) {
  throw "No Hosting releases found for site $Site"
}

Write-Host "Last $($releases.Count) live releases (newest first):" -ForegroundColor Cyan
for ($i = 0; $i -lt $releases.Count; $i++) {
  $r = $releases[$i]
  $when = if ($r.CreateTime) { $r.CreateTime } else { "unknown time" }
  $msg = if ($r.Message) { " — $($r.Message)" } else { "" }
  Write-Host ("  [{0}] version={1}  {2}{3}" -f $i, $r.VersionId, $when, $msg)
}

if (-not $VersionId) {
  $defaultIdx = 1
  if ($releases.Count -lt 2) {
    throw "Only one release exists — nothing to roll back to."
  }
  $pick = Read-Host "Pick index to roll back to (default $defaultIdx = previous release)"
  if ([string]::IsNullOrWhiteSpace($pick)) { $pick = $defaultIdx }
  if ($pick -notmatch '^\d+$') { throw "Invalid index" }
  $idx = [int]$pick
  if ($idx -lt 0 -or $idx -ge $releases.Count) { throw "Index out of range" }
  $VersionId = $releases[$idx].VersionId
}

Write-Host ""
Write-Host "Will roll back live Hosting to version:" -ForegroundColor Yellow
Write-Host "  $VersionId"
Write-Host ""
Write-Host "Type ROLLBACK UI to confirm:" -ForegroundColor Cyan
$confirm = Read-Host "Confirm"
if ($confirm -ne "ROLLBACK UI") {
  Write-Info "Aborted — confirmation did not match ROLLBACK UI."
  exit 1
}

# Roll back via official Hosting clone (equivalent to Console "Roll back"):
#   firebase hosting:clone SITE:@VERSION_ID SITE:live
Invoke-HostingRollbackClone -TargetVersionId $VersionId
Write-Info "SUCCESS: live client UI now serves version $VersionId"
