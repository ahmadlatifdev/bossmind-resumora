# Apply Disaster Recovery protections for resumora-live (idempotent; never prints secrets).
#
# Steps:
#   1. Firestore PITR
#   2. Daily Firestore backup schedule (7d retention)
#   3. GCS object versioning on video bucket
#   4. Stable git tag (optional commit + tag + push)
#   5. Print validation commands
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\apply-disaster-recovery.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\apply-disaster-recovery.ps1 -SkipGit

param(
  [string]$Project = "resumora-live",
  [string]$Database = "(default)",
  [string]$Bucket = "resumora-videos",
  [string]$GitTag = "v1.0.0-stable",
  [string]$GitCommitMessage = "Stable release v1.0.0",
  [string]$GitBranch = "main",
  [switch]$SkipGit
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$script:StepResults = @()

function Write-Info([string]$msg) {
  Write-Host "[apply-disaster-recovery] $msg"
}

function Write-Warn([string]$msg) {
  Write-Host "[apply-disaster-recovery] WARNING: $msg" -ForegroundColor Yellow
}

function Write-Ok([string]$msg) {
  Write-Host "[apply-disaster-recovery] OK: $msg" -ForegroundColor Green
}

function Record-Step([string]$name, [bool]$ok, [string]$detail = "") {
  $script:StepResults += [PSCustomObject]@{ Step = $name; Ok = $ok; Detail = $detail }
}

function Get-GcloudCmdPath {
  $cmd = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }
  $ps1 = Get-Command gcloud -ErrorAction SilentlyContinue
  if ($ps1 -and $ps1.Source) {
    $dir = Split-Path -Parent $ps1.Source
    $candidate = Join-Path $dir "gcloud.cmd"
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  $fallback = Join-Path $env:LOCALAPPDATA "Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
  if (Test-Path -LiteralPath $fallback) { return $fallback }
  return $null
}

function Invoke-GcloudStep {
  param(
    [Parameter(Mandatory = $true)][string]$StepName,
    [Parameter(Mandatory = $true)][string[]]$GcloudArgs
  )
  $gcloud = Get-GcloudCmdPath
  if (-not $gcloud) {
    Write-Warn "$StepName - gcloud.cmd not found on PATH"
    Record-Step $StepName $false "gcloud missing"
    return $false
  }

  $argLine = ($GcloudArgs | ForEach-Object {
      if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
    }) -join ' '

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $gcloud
  $psi.Arguments = $argLine
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $proc = [System.Diagnostics.Process]::Start($psi)
  $stdout = $proc.StandardOutput.ReadToEnd()
  $stderr = $proc.StandardError.ReadToEnd()
  $proc.WaitForExit()
  $code = $proc.ExitCode

  # Only print safe, non-secret summaries (never dump full env or key material).
  $combined = ($stdout + "`n" + $stderr).ToLowerInvariant()
  if ($combined -match 'already|exist|enabled|noop|unchanged') {
    Write-Warn "$StepName - already applied or no change needed (exit $code)"
    Record-Step $StepName $true "already applied"
    return $true
  }
  if ($code -eq 0) {
    Write-Ok $StepName
    Record-Step $StepName $true "success"
    return $true
  }

  Write-Warn "$StepName - gcloud exited $code (continuing)"
  if ($stderr -and $stderr.Length -lt 400) {
    # Short error only; scrub lines that might contain keys
    $safeErr = ($stderr -split "`r?`n" | Where-Object {
        $_ -and $_ -notmatch 'sk_live_|sk_test_|whsec_|pk_live_|price_[A-Za-z0-9]+'
      }) -join " | "
    if ($safeErr) { Write-Warn $safeErr }
  }
  Record-Step $StepName $false "exit $code"
  return $false
}

function Invoke-GitStep {
  param(
    [Parameter(Mandatory = $true)][string]$StepName,
    [Parameter(Mandatory = $true)][string[]]$GitArgs
  )
  $git = Get-Command git -ErrorAction SilentlyContinue
  if (-not $git) {
    Write-Warn "$StepName - git not found"
    Record-Step $StepName $false "git missing"
    return $false
  }

  $argLine = ($GitArgs | ForEach-Object {
      if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
    }) -join ' '

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $git.Source
  $psi.Arguments = $argLine
  $psi.WorkingDirectory = $Root
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $proc = [System.Diagnostics.Process]::Start($psi)
  $stdout = ($proc.StandardOutput.ReadToEnd()).Trim()
  $stderr = ($proc.StandardError.ReadToEnd()).Trim()
  $proc.WaitForExit()
  $code = $proc.ExitCode

  $combined = ($stdout + " " + $stderr).ToLowerInvariant()
  if ($code -eq 0) {
    Write-Ok $StepName
    Record-Step $StepName $true "success"
    return $true
  }
  if ($combined -match 'nothing to commit|already exists|already on') {
    Write-Warn "$StepName - no change needed (exit $code)"
    Record-Step $StepName $true "already applied"
    return $true
  }

  Write-Warn "$StepName - git exited $code (continuing)"
  if ($stderr -and $stderr.Length -lt 300) { Write-Warn $stderr }
  Record-Step $StepName $false "exit $code"
  return $false
}

Write-Host ""
Write-Host "=== Resumora Disaster Recovery apply ===" -ForegroundColor Cyan
Write-Host "Project=$Project Bucket=$Bucket Database=$Database"
Write-Host "Repo=$Root"
Write-Host ""

# --- Step 1: Firestore PITR ---
Write-Info "Step 1/4 - Enable Firestore PITR"
Invoke-GcloudStep -StepName "Firestore PITR" -GcloudArgs @(
  "firestore", "databases", "update",
  "--database=$Database",
  "--enable-pitr",
  "--project=$Project"
) | Out-Null

# --- Step 2: Daily backup schedule ---
Write-Info "Step 2/4 - Daily Firestore backup schedule (7d retention)"
# Always attempt create; idempotent handler treats ALREADY_EXISTS as OK
Invoke-GcloudStep -StepName "Create daily backup schedule" -GcloudArgs @(
  "firestore", "backups", "schedules", "create",
  "--database=$Database",
  "--recurrence=daily",
  "--retention=7d",
  "--project=$Project"
) | Out-Null

# --- Step 3: GCS versioning ---
Write-Info "Step 3/4 - Enable GCS versioning on gs://$Bucket"
Invoke-GcloudStep -StepName "GCS versioning" -GcloudArgs @(
  "storage", "buckets", "update", "gs://$Bucket",
  "--versioning",
  "--project=$Project"
) | Out-Null

# --- Step 4: Git stable tag ---
if ($SkipGit) {
  Write-Warn "Step 4/4 - Skipped (-SkipGit)"
  Record-Step "Git stable tag" $true "skipped"
} else {
  Write-Info "Step 4/4 - Git stable tag ($GitTag on branch $GitBranch)"
  Invoke-GitStep -StepName "git add" -GitArgs @("add", ".") | Out-Null
  Invoke-GitStep -StepName "git commit" -GitArgs @("commit", "-m", $GitCommitMessage) | Out-Null
  Invoke-GitStep -StepName "git tag" -GitArgs @("tag", $GitTag) | Out-Null
  Invoke-GitStep -StepName "git push tag" -GitArgs @("push", "origin", $GitTag) | Out-Null
}

# --- Summary ---
Write-Host ""
Write-Host "=== Step summary ===" -ForegroundColor Cyan
foreach ($r in $script:StepResults) {
  $status = if ($r.Ok) { "OK" } else { "WARN" }
  $detail = if ($r.Detail) { " ($($r.Detail))" } else { "" }
  Write-Host ("  [{0}] {1}{2}" -f $status, $r.Step, $detail)
}

# --- Validation commands (run manually to confirm) ---
Write-Host ""
Write-Host "=== Validation commands (copy/paste to verify) ===" -ForegroundColor Cyan
Write-Host @"
# Firestore PITR
gcloud firestore databases describe --database="$Database" --project=$Project --format="value(pointInTimeRecoveryEnablement)"

# Daily backup schedule
gcloud firestore backups schedules list --database="$Database" --project=$Project

# GCS versioning on $Bucket
gcloud storage buckets describe gs://$Bucket --project=$Project --format="value(versioning.enabled)"

# Git stable tag
git tag --list $GitTag
"@

Write-Host ""
Write-Info "Done. Use scripts/safe-deploy.ps1 for gated hosting deploys and scripts/rollback.ps1 for Cloud Run recovery."
