#Requires -Version 5.1
<#
.SYNOPSIS
  Encrypt a portable System Master Backup of local Resumora secrets (AES-256).

.DESCRIPTION
  Archives gitignored credential files, encrypts the zip with AES-256-CBC
  (PBKDF2-SHA256), then deletes the unencrypted zip immediately.
  Never prints secret values, passwords, sk_live_, whsec_, pk_live_, or price_ IDs.

.PARAMETER OutputPath
  Destination .enc file. Default: %USERPROFILE%\Documents\BossMind\BossMind_Master_Backup.enc

.PARAMETER WhatIf
  Parse helpers, list candidate files, and exit without prompting or encrypting.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\export-master-backup.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\export-master-backup.ps1 -WhatIf
#>
param(
  [string]$OutputPath = '',
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# Prefer scripts\lib\, fall back to scripts\ (some AV products block the lib\master-backup-crypto.ps1 name).
$cryptoHelperCandidates = @(
  (Join-Path $PSScriptRoot 'lib\master-backup-crypto.ps1'),
  (Join-Path $PSScriptRoot 'lib\backup-crypto-helpers.ps1'),
  (Join-Path $PSScriptRoot 'master-backup-crypto.ps1')
)
$cryptoHelper = $cryptoHelperCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $cryptoHelper) {
  throw "Missing crypto helper. Expected one of: $($cryptoHelperCandidates -join '; ')"
}
. $cryptoHelper

function Write-Step { param([string]$Message) Write-Host "[export-master-backup] $Message" -ForegroundColor Cyan }
function Write-Ok { param([string]$Message) Write-Host "[export-master-backup] OK $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "[export-master-backup] WARN $Message" -ForegroundColor Yellow }

$CandidateRel = @(
  '.env.local',
  '.env',
  'functions\.env',
  'functions\.env.local',
  'bilibili_secrets.env',
  'firebase-service-account.json'
)

$staging = $null
$zipPath = $null
$pwdBytes = $null

try {
  Write-Host '=== Resumora System Master Backup (export) ===' -ForegroundColor Yellow
  Write-Step "Project root: $Root"

  $found = New-Object System.Collections.Generic.List[object]
  $missing = New-Object System.Collections.Generic.List[string]
  foreach ($rel in $CandidateRel) {
    $full = Join-Path $Root $rel
    if (Test-Path -LiteralPath $full -PathType Leaf) {
      $item = Get-Item -LiteralPath $full
      $found.Add([pscustomobject]@{ Rel = $rel; Full = $full; Bytes = $item.Length }) | Out-Null
      Write-Ok ("Present {0} ({1} bytes)" -f $rel, $item.Length)
    }
    else {
      $missing.Add($rel) | Out-Null
      Write-Warn "Not found (skipped): $rel"
    }
  }

  if ($found.Count -eq 0) {
    throw 'No secret files found to back up. Nothing to encrypt.'
  }

  if (-not $OutputPath) {
    $OutputPath = Join-Path $env:USERPROFILE 'Documents\BossMind\BossMind_Master_Backup.enc'
  }
  $OutputPath = [IO.Path]::GetFullPath($OutputPath)

  Write-Ok ("Crypto helper loaded from: {0}" -f $cryptoHelper)

  if ($WhatIf) {
    Write-Step 'WhatIf: dry run only (no password prompt, no zip, no encrypt)'
    Write-Host ("Would encrypt {0} file(s) to: {1}" -f $found.Count, $OutputPath) -ForegroundColor DarkGray
    Write-Ok 'WhatIf complete - script parses and helper resolves'
    return
  }

  Write-Step 'Enter a strong encryption password (input hidden).'
  Write-Host 'Requirements: 16+ characters, upper, lower, digit, and symbol.' -ForegroundColor DarkGray
  $secure1 = Read-Host -AsSecureString 'Encryption password'
  $secure2 = Read-Host -AsSecureString 'Confirm encryption password'
  if (-not (Test-SecureStringEqual -A $secure1 -B $secure2)) {
    throw 'Passwords do not match.'
  }
  $pwdBytes = ConvertFrom-SecureStringToUtf8Bytes -Secure $secure1
  $strength = Test-PasswordStrengthBytes -PasswordBytes $pwdBytes
  if (-not $strength.Ok) { throw $strength.Reason }

  $stamp = Get-Date -Format 'yyyyMMddHHmmss'
  $staging = Join-Path $env:TEMP ("resumora-master-backup-stage-$stamp")
  New-Item -ItemType Directory -Path $staging -Force | Out-Null
  foreach ($f in $found) {
    $dest = Join-Path $staging $f.Rel
    $destDir = Split-Path -Parent $dest
    if (-not (Test-Path -LiteralPath $destDir)) {
      New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }
    Copy-Item -LiteralPath $f.Full -Destination $dest -Force
  }

  $manifest = @{
    createdUtc = (Get-Date).ToUniversalTime().ToString('o')
    project    = 'resumora-live'
    files      = @($found | ForEach-Object { @{ name = $_.Rel; bytes = $_.Bytes } })
  }
  $manifestPath = Join-Path $staging 'MANIFEST.json'
  ($manifest | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath $manifestPath -Encoding utf8

  $zipPath = Join-Path $env:TEMP ("resumora-master-backup-$stamp.zip")
  if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
  $stageItems = Get-ChildItem -LiteralPath $staging -Force
  Compress-Archive -Path $stageItems.FullName -DestinationPath $zipPath -Force
  Write-Ok 'Archive created (plaintext zip is temporary).'

  Write-Step 'Encrypting archive with AES-256 (PBKDF2-SHA256)...'
  Protect-MasterBackupFile -PlainPath $zipPath -OutPath $OutputPath -PasswordBytes $pwdBytes
  Write-Ok 'Backup encrypted successfully'

  Remove-PathSecure -Path $zipPath
  $zipPath = $null
  Write-Ok 'Temporary unencrypted zip deleted'

  Write-Host ''
  Write-Host 'Store BOTH of these in a password manager (separate notes if possible):' -ForegroundColor Yellow
  Write-Host "  1) Encrypted file path: $OutputPath"
  Write-Host '  2) The encryption password you just entered (never written to disk by this script).'
  Write-Host 'Never commit BossMind_Master_Backup.enc, never upload it to public cloud, never paste the password in chat.' -ForegroundColor Yellow
  Write-Host 'Restore on a new Windows PC: powershell -ExecutionPolicy Bypass -File .\scripts\import-master-backup.ps1'
}
catch {
  Write-Host ("FAILURE: {0}" -f $_.Exception.Message) -ForegroundColor Red
  throw
}
finally {
  if ($pwdBytes) { [Array]::Clear($pwdBytes, 0, $pwdBytes.Length) }
  if ($zipPath) { Remove-PathSecure -Path $zipPath }
  if ($staging) { Remove-PathSecure -Path $staging }
}
