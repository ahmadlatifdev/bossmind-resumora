#Requires -Version 5.1
<#
.SYNOPSIS
  Bootstrap / heal GitHub Actions secrets for Resumora CI (local machine).

.DESCRIPTION
  - Ensures firebase-service-account.json exists locally (non-empty).
  - Uploads FIREBASE_SERVICE_ACCOUNT via gh when the secret name is missing
    OR when -ForceRefresh is set OR when the local file is valid (heals empty values).
  - Validates BILIBILI_SESSDATA length in bilibili_secrets.env (>= 40) without printing values.
  Never prints secret JSON, SESSDATA, sk_live_, whsec_, pk_live_, or price_ IDs.

.PARAMETER ForceRefresh
  Always re-upload FIREBASE_SERVICE_ACCOUNT from the local JSON file.

.PARAMETER SkipBilibili
  Skip BILIBILI_SESSDATA length check.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-secrets.ps1
#>
param(
  [switch]$ForceRefresh,
  [switch]$SkipBilibili,
  [string]$Repo = 'ahmadlatifdev/bossmind-resumora',
  [string]$ServiceAccountPath = ''
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Status([string]$Message, [string]$Level = 'Info') {
  $color = switch ($Level) {
    'OK' { 'Green' }
    'Warn' { 'Yellow' }
    'Fail' { 'Red' }
    default { 'Cyan' }
  }
  Write-Host ("[bootstrap-secrets] {0}" -f $Message) -ForegroundColor $color
}

try {
  Write-Status "Repo root: $Root"
  Write-Status "Target repo: $Repo"

  if (-not $ServiceAccountPath) {
    $ServiceAccountPath = Join-Path $Root 'firebase-service-account.json'
  }

  if (-not (Test-Path -LiteralPath $ServiceAccountPath)) {
    Write-Status "MISSING local file: firebase-service-account.json" 'Fail'
    Write-Status "Download a JSON key from GCP IAM (resumora-live) and save it as firebase-service-account.json in the repo root." 'Warn'
    throw "bootstrap-secrets failed: local service account file missing"
  }

  $saItem = Get-Item -LiteralPath $ServiceAccountPath
  if ($saItem.Length -lt 200) {
    Write-Status ("REJECTED {0} - file too small ({1} bytes). Refusing to upload empty/placeholder." -f $saItem.Name, $saItem.Length) 'Fail'
    throw "bootstrap-secrets failed: service account file empty or invalid size"
  }
  Write-Status ("OK local file present: {0} ({1} bytes)" -f $saItem.Name, $saItem.Length) 'OK'

  # --- GitHub secret presence (names only) ---
  $secretNames = @()
  try {
    $listOut = gh secret list --repo $Repo 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw ("gh secret list failed: {0}" -f $listOut)
    }
    foreach ($line in ($listOut | Out-String) -split "`r?`n") {
      if ($line -match '^([A-Za-z0-9_]+)\t') {
        $secretNames += $Matches[1]
      }
    }
  }
  catch {
    Write-Status "gh CLI required and must be authenticated (gh auth status)." 'Fail'
    throw
  }

  $hasSaSecret = $secretNames -contains 'FIREBASE_SERVICE_ACCOUNT'
  Write-Status ("GitHub secret FIREBASE_SERVICE_ACCOUNT name present: {0}" -f $hasSaSecret) 'Info'

  # Always refresh from a valid local file. gh secret list cannot detect empty values;
  # CI previously failed with a named-but-empty FIREBASE_SERVICE_ACCOUNT.
  Write-Status "Uploading FIREBASE_SERVICE_ACCOUNT from local JSON via gh (value not printed)..." 'Warn'
  cmd /c "gh secret set FIREBASE_SERVICE_ACCOUNT --repo $Repo < `"$ServiceAccountPath`""
  if ($LASTEXITCODE -ne 0) {
    throw "gh secret set FIREBASE_SERVICE_ACCOUNT failed"
  }
  Write-Status "OK FIREBASE_SERVICE_ACCOUNT uploaded/refreshed" 'OK'

  cmd /c "gh secret set FIREBASE_SERVICE_ACCOUNT_BACKUP --repo $Repo < `"$ServiceAccountPath`""
  if ($LASTEXITCODE -ne 0) {
    Write-Status "WARN could not set FIREBASE_SERVICE_ACCOUNT_BACKUP (non-fatal)" 'Warn'
  }
  else {
    Write-Status "OK FIREBASE_SERVICE_ACCOUNT_BACKUP uploaded/refreshed" 'OK'
  }

  if ($ForceRefresh) {
    Write-Status "ForceRefresh requested - upload already completed" 'Info'
  }

  # --- Bilibili SESSDATA length (no value printed) ---
  if (-not $SkipBilibili) {
    $biliPath = Join-Path $Root 'bilibili_secrets.env'
    if (-not (Test-Path -LiteralPath $biliPath)) {
      Write-Status "WARN bilibili_secrets.env not found - skipping SESSDATA length check" 'Warn'
    }
    else {
      $sessLen = 0
      foreach ($line in Get-Content -LiteralPath $biliPath -ErrorAction Stop) {
        if ($line -match '^\s*BILIBILI_SESSDATA\s*=\s*(.*)\s*$') {
          $raw = $Matches[1].Trim().Trim('"').Trim("'")
          $sessLen = $raw.Length
          break
        }
      }
      if ($sessLen -lt 40) {
        Write-Status ("FAIL BILIBILI_SESSDATA length={0} (need >= 40). File: bilibili_secrets.env" -f $sessLen) 'Fail'
        throw "bootstrap-secrets failed: BILIBILI_SESSDATA too short"
      }
      Write-Status ("OK BILIBILI_SESSDATA length={0} (>= 40)" -f $sessLen) 'OK'
    }
  }

  Write-Status "Bootstrap complete." 'OK'
  return
}
catch {
  Write-Status $_.Exception.Message 'Fail'
  # Non-zero for callers without closing the host via exit
  $global:LASTEXITCODE = 1
  throw
}
