# BossMind Stripe Dashboard Repair — Stripe-only purge + isolated runtime profile.
param(
  [switch]$Apply,
  [string]$ChromeProfile = "",
  [switch]$CloseChrome,
  [switch]$SkipIsolatedLaunch
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
$chromeRoot = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"
$isoRoot = Join-Path $repoRoot "windows-heal\stripe-runtime\chrome-user-data"
$report = @{
  ok = $true
  apply = [bool]$Apply
  chromeRoot = $chromeRoot
  isolatedProfileDir = $isoRoot
  chromeRunning = $false
  profiles = @()
  backups = @()
  cookiesRemoved = 0
  storagePathsRemoved = 0
  indexedDbRemoved = 0
  cacheRemoved = 0
  serviceWorkerRemoved = 0
  localStorageRemoved = 0
  sessionStorageRemoved = 0
  isolatedProfile = @{}
  errors = @()
}

function Test-ChromeRunning {
  return (Get-Process -Name chrome -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0
}

function Get-ChromeProfiles {
  param([string]$Root)
  if (-not (Test-Path $Root)) { return @() }
  $names = @("Default")
  $localState = Join-Path $Root "Local State"
  if (Test-Path $localState) {
    try {
      $ls = Get-Content $localState -Raw | ConvertFrom-Json
      if ($ls.profile.info_cache) {
        $names = @($ls.profile.info_cache.PSObject.Properties.Name)
      }
    } catch { }
  }
  $out = @()
  foreach ($n in $names) {
    $dir = Join-Path $Root $n
    if (-not (Test-Path $dir)) { continue }
    $cookies = Join-Path $dir "Network\Cookies"
    if (-not (Test-Path $cookies)) { $cookies = Join-Path $dir "Cookies" }
    $out += [pscustomobject]@{ Name = $n; Dir = $dir; Cookies = $cookies }
  }
  return $out
}

function Backup-FileSafe {
  param([string]$Source, [string]$BackupDir, [string]$Label = "")
  if (-not (Test-Path $Source)) { return $null }
  $base = Split-Path $Source -Leaf
  $dest = if ($Label) { Join-Path $BackupDir "$Label-$base" } else { Join-Path $BackupDir $base }
  Copy-Item -LiteralPath $Source -Destination $dest -Force
  return $dest
}

function Remove-StripeCookiesSqlite {
  param([string]$CookiesPath)
  if (-not (Test-Path $CookiesPath)) { return 0 }
  $nodeScript = Join-Path $PSScriptRoot "bossmind-stripe-cookie-purge.mjs"
  $json = & node $nodeScript "--cookies=$CookiesPath" 2>&1 | Out-String
  $line = ($json -split "`n" | Where-Object { $_ -match '^\{' } | Select-Object -Last 1)
  if (-not $line) { throw "Cookie purge produced no JSON: $json" }
  $parsed = $line | ConvertFrom-Json
  if (-not $parsed.ok) { throw "Cookie purge failed: $($parsed.error)" }
  return [int]($parsed.removed)
}

function Remove-StripePathsRecursive {
  param([string]$ProfileDir)
  $removed = 0
  $roots = @(
    "IndexedDB", "Session Storage", "Local Storage", "Service Worker",
    "Cache", "Code Cache", "GPUCache", "Storage"
  )
  foreach ($rootName in $roots) {
    $root = Join-Path $ProfileDir $rootName
    if (-not (Test-Path $root)) { continue }
    Get-ChildItem -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match 'stripe' } |
      ForEach-Object {
        try {
          if ($_.PSIsContainer) {
            Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop
          } else {
            Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop
          }
          $script:removed++
        } catch { }
      }
  }
  return $removed
}

function Ensure-IsolatedStripeProfile {
  param([string]$IsoDir, [string]$RepoRoot)
  New-Item -ItemType Directory -Force -Path $IsoDir | Out-Null
  $launcher = Join-Path (Split-Path $IsoDir -Parent) "launch-stripe-dashboard.ps1"
  $chromeExe = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
  if (-not (Test-Path $chromeExe)) {
    $chromeExe = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  }
  $launcherContent = @"
# BossMind isolated Stripe dashboard session (separate from main Chrome profiles).
`$iso = "$($IsoDir.Replace('\','\\'))"
`$chrome = "$($chromeExe.Replace('\','\\'))"
if (-not (Test-Path `$chrome)) { Write-Error "Chrome not found"; exit 1 }
Start-Process `$chrome @(
  "--user-data-dir=`$iso",
  "--no-first-run",
  "--disable-sync",
  "--disable-extensions",
  "https://dashboard.stripe.com/"
)
"@
  Set-Content -Path $launcher -Value $launcherContent -Encoding UTF8
  $manifest = @{
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    isolatedUserDataDir = $IsoDir
    launcher = $launcher
    chromeExe = $chromeExe
    note = "Use this profile for Stripe only to avoid corrupted main-profile session state."
  }
  $manifestPath = Join-Path (Split-Path $IsoDir -Parent) "isolated-profile-manifest.json"
  $manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestPath -Encoding UTF8
  return @{
    dir = $IsoDir
    launcher = $launcher
    manifest = $manifestPath
    chromeExe = $chromeExe
  }
}

function Launch-IsolatedStripeDashboard {
  param($IsoInfo)
  if (-not $IsoInfo.chromeExe -or -not (Test-Path $IsoInfo.chromeExe)) { return $false }
  Start-Process $IsoInfo.chromeExe @(
    "--user-data-dir=$($IsoInfo.dir)",
    "--no-first-run",
    "--disable-sync",
    "--disable-extensions",
    "https://dashboard.stripe.com/"
  ) | Out-Null
  return $true
}

$report.chromeRunning = Test-ChromeRunning
if ($report.chromeRunning -and $Apply) {
  if ($CloseChrome -or $env:BOSSMIND_STRIPE_CLOSE_CHROME -eq "1") {
    for ($i = 0; $i -lt 5; $i++) {
      cmd /c "taskkill /F /IM chrome.exe /T 2>nul" | Out-Null
      Get-Process -Name chrome -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 3
      if (-not (Test-ChromeRunning)) { break }
    }
    $report.chromeClosedForRepair = $true
    $report.chromeRunning = Test-ChromeRunning
  }
}
if ($report.chromeRunning -and $Apply) {
  $report.ok = $false
  $report.errors += "Chrome is running. Close Chrome or set BOSSMIND_STRIPE_CLOSE_CHROME=1."
  $report | ConvertTo-Json -Compress -Depth 8
  exit 2
}

$profiles = Get-ChromeProfiles -Root $chromeRoot
if ($ChromeProfile) {
  $profiles = $profiles | Where-Object { $_.Name -eq $ChromeProfile }
}

$backupRoot = Join-Path $repoRoot "windows-heal\stripe-recovery\backups"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $backupRoot $stamp
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$scanScript = Join-Path $PSScriptRoot "bossmind-stripe-profile-scan.mjs"

foreach ($p in $profiles) {
  $entry = @{
    profile = $p.Name
    cookiesRemoved = 0
    storagePathsRemoved = 0
    scanBefore = $null
    backedUp = @()
  }
  if (Test-Path $scanScript) {
    try {
      $scanJson = & node $scanScript "--profile-dir=$($p.Dir)" 2>&1 | Out-String
      $scanLine = ($scanJson -split "`n" | Where-Object { $_ -match '^\{' } | Select-Object -Last 1)
      if ($scanLine) { $entry.scanBefore = ($scanLine | ConvertFrom-Json) }
    } catch { }
  }
  if ($Apply) {
    try {
      if (Test-Path $p.Cookies) {
        $bak = Backup-FileSafe -Source $p.Cookies -BackupDir $backupDir -Label $p.Name
        if ($bak) {
          $entry.backedUp += $bak
          $report.backups += $bak
        }
        $entry.cookiesRemoved = Remove-StripeCookiesSqlite -CookiesPath $p.Cookies
        $report.cookiesRemoved += $entry.cookiesRemoved
      }
      $entry.storagePathsRemoved = Remove-StripePathsRecursive -ProfileDir $p.Dir
      $report.storagePathsRemoved += $entry.storagePathsRemoved
    } catch {
      $report.ok = $false
      $report.errors += "$($p.Name): $($_.Exception.Message)"
    }
  }
  $report.profiles += $entry
}

$report.isolatedProfile = Ensure-IsolatedStripeProfile -IsoDir $isoRoot -RepoRoot $repoRoot

if ($Apply -and $report.ok -and -not $SkipIsolatedLaunch) {
  $report.launchedIsolated = Launch-IsolatedStripeDashboard -IsoInfo $report.isolatedProfile
}

if ($report.errors.Count -gt 0) { $report.ok = $false }

$report | ConvertTo-Json -Compress -Depth 10
