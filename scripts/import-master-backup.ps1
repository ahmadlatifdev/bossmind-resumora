#Requires -Version 5.1
<#
.SYNOPSIS
  Decrypt a System Master Backup and restore secret files into the project root.

.DESCRIPTION
  Decrypts AES-256 ciphertext, extracts to a temp folder, moves files into
  D:\BossMind\bossmind-resumora (or current repo root), then wipes temp files.
  Overwrites existing files only after explicit confirmation.
  Never prints secret values or passwords.

.PARAMETER EncPath
  Path to BossMind_Master_Backup.enc

.PARAMETER Force
  Overwrite existing files without prompting (use only on a trusted new device).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\import-master-backup.ps1
#>
param(
  [string]$EncPath = '',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

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

function Write-Step { param([string]$Message) Write-Host "[import-master-backup] $Message" -ForegroundColor Cyan }
function Write-Ok { param([string]$Message) Write-Host "[import-master-backup] OK $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "[import-master-backup] WARN $Message" -ForegroundColor Yellow }

function Test-GitIgnored {
  param([string]$RelPath)
  $gitignore = Join-Path $Root '.gitignore'
  if (-not (Test-Path -LiteralPath $gitignore)) { return $false }
  $git = Get-Command git -ErrorAction SilentlyContinue
  if ($git) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    git -C $Root check-ignore -q -- $RelPath 2>$null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -eq 0) { return $true }
  }
  $name = Split-Path -Leaf $RelPath
  $patterns = Get-Content -LiteralPath $gitignore -ErrorAction SilentlyContinue
  foreach ($p in $patterns) {
    $t = $p.Trim()
    if (-not $t -or $t.StartsWith('#')) { continue }
    if ($t -eq $RelPath -or $t -eq $name -or $t -eq ($RelPath -replace '\\', '/')) { return $true }
    if ($t -eq '.env' -and $RelPath -match '\.env') { return $true }
    if ($t -eq 'bilibili_secrets.env' -and $name -eq 'bilibili_secrets.env') { return $true }
    if ($t -eq 'firebase-service-account.json' -and $name -eq 'firebase-service-account.json') { return $true }
  }
  return $false
}

$AllowedRel = @(
  '.env.local',
  '.env',
  'functions\.env',
  'functions\.env.local',
  'bilibili_secrets.env',
  'firebase-service-account.json',
  'MANIFEST.json'
)

$tempRoot = $null
$zipPath = $null
$extractDir = $null
$pwdBytes = $null

try {
  Write-Host '=== Resumora System Master Backup (import) ===' -ForegroundColor Yellow
  Write-Step "Project root: $Root"

  if (-not $EncPath) {
    $EncPath = Read-Host 'Path to BossMind_Master_Backup.enc'
  }
  $EncPath = $EncPath.Trim('"')
  if (-not (Test-Path -LiteralPath $EncPath -PathType Leaf)) {
    throw "Encrypted backup not found: $EncPath"
  }

  Write-Step 'Enter the AES-256 encryption password (input hidden).'
  $secure = Read-Host -AsSecureString 'Encryption password'
  $pwdBytes = ConvertFrom-SecureStringToUtf8Bytes -Secure $secure
  if ($pwdBytes.Length -eq 0) { throw 'Password cannot be empty.' }

  $stamp = Get-Date -Format 'yyyyMMddHHmmss'
  $tempRoot = Join-Path $env:TEMP ("resumora-master-restore-$stamp")
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
  $zipPath = Join-Path $tempRoot 'payload.zip'
  $extractDir = Join-Path $tempRoot 'extract'

  Write-Step 'Decrypting archive...'
  Unprotect-MasterBackupFile -EncPath $EncPath -OutPath $zipPath -PasswordBytes $pwdBytes
  Write-Ok 'Decryption succeeded (working copy is temporary).'

  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force
  Remove-PathSecure -Path $zipPath
  $zipPath = $null
  Write-Ok 'Temporary decrypted zip deleted after extract'

  $moved = 0
  $restoredFiles = @(Get-ChildItem -LiteralPath $extractDir -Recurse -File)
  foreach ($fileItem in $restoredFiles) {
    $rel = $fileItem.FullName.Substring($extractDir.Length).TrimStart([char]92, [char]47)
    $relNorm = $rel -replace '/', '\'
    if ($relNorm -eq 'MANIFEST.json') {
      Write-Ok 'Manifest present (names and sizes only; contents not printed).'
      continue
    }
    $allowed = $false
    foreach ($a in $AllowedRel) {
      if ($relNorm -eq $a) { $allowed = $true; break }
    }
    if (-not $allowed) {
      Write-Warn "Skipped unexpected archive member: $relNorm"
      continue
    }

    $dest = Join-Path $Root $relNorm
    $destDir = Split-Path -Parent $dest
    if (-not (Test-Path -LiteralPath $destDir)) {
      New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    if ((Test-Path -LiteralPath $dest) -and -not $Force) {
      $prompt = 'Overwrite existing ' + $relNorm + '? Type YES to overwrite'
      $ans = Read-Host $prompt
      if ($ans -ne 'YES') {
        Write-Warn "Skipped (kept existing): $relNorm"
        continue
      }
    }

    Copy-Item -LiteralPath $fileItem.FullName -Destination $dest -Force
    $moved++
    Write-Ok ("Restored {0} ({1} bytes)" -f $relNorm, $fileItem.Length)

    if (-not (Test-GitIgnored -RelPath $relNorm)) {
      Write-Warn "$relNorm is not gitignored - appending to .gitignore"
      Add-Content -LiteralPath (Join-Path $Root '.gitignore') -Value "`n$relNorm"
    }
    else {
      Write-Ok "Confirmed gitignored: $relNorm"
    }
  }

  if ($moved -eq 0) {
    throw 'No allowed secret files were restored.'
  }

  Write-Host ''
  Write-Ok 'Import complete. Temporary decrypted files will be wiped.'
  Write-Host ''
  Write-Host 'Post-import bootstrap on this Windows PC (do not paste secrets):' -ForegroundColor Yellow
  Write-Host '  1. gcloud auth login'
  Write-Host '  2. firebase login'
  Write-Host '  3. gh auth login'
  Write-Host '  4. powershell -ExecutionPolicy Bypass -File .\scripts\setup-workload-identity.ps1 -SetGitHubSecrets'
  Write-Host '  5. powershell -ExecutionPolicy Bypass -File .\scripts\setup-deploy-iam.ps1'
  Write-Host '  6. npm ci && npm run build'
  Write-Host '  7. powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-secrets.ps1'
  Write-Host 'See docs/MASTER_BACKUP_GUIDE.md for full restore steps.'
}
catch {
  Write-Host ("FAILURE: {0}" -f $_.Exception.Message) -ForegroundColor Red
  throw
}
finally {
  if ($pwdBytes) { [Array]::Clear($pwdBytes, 0, $pwdBytes.Length) }
  if ($zipPath) { Remove-PathSecure -Path $zipPath }
  if ($extractDir) { Remove-PathSecure -Path $extractDir }
  if ($tempRoot) { Remove-PathSecure -Path $tempRoot }
}
