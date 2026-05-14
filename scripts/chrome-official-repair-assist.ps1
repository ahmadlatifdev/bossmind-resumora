#Requires -Version 5.1
<#
.SYNOPSIS
  BossMind-safe assist for Chrome in-place repair: inventory, snapshot, optional User Data backup, official installer download.

.DESCRIPTION
  Does NOT delete Chrome User Data. Does NOT wipe profiles. Default is read-only inventory + JSON snapshot under windows-heal/state/.
  Optional steps require explicit switches. Close Chrome before backup for a consistent copy.

  Official offline installer (64-bit Windows, Google host): ChromeStandaloneSetup64.exe
  https://dl.google.com/chrome/install/ChromeStandaloneSetup64.exe

  Cursor / IDE favorite chats, DeepSeek app history, and many "AI workspace" artifacts are NOT stored under Chrome User Data.
  This script only targets %LOCALAPPDATA%\Google\Chrome\User Data and related shortcuts.

.PARAMETER BackupUserData
  Robocopy mirror of User Data into windows-heal/chrome-user-data-backups/<timestamp>/.

.PARAMETER BackupMode
  Full = entire User Data tree. Lean = same tree but skips a few large cache-style folders (still keeps profiles, Local State, extensions).

.PARAMETER AllowChromeRunning
  Skip the "Chrome must be closed" guard for backup (risky: locked files, inconsistent copy).

.PARAMETER DownloadInstaller
  Download ChromeStandaloneSetup64.exe from dl.google.com into windows-heal/downloads/.

.PARAMETER LaunchInstallerGui
  Start the downloaded installer with no extra arguments (GUI). Use after -DownloadInstaller or if the file already exists.

.PARAMETER DumpChromeShortcuts
  List Desktop / Start Menu shortcuts whose target looks like Chrome, with arguments (read-only).

.PARAMETER MeasureUserDataSize
  Recursively sum file sizes under User Data (can take minutes on large profiles).

.NOTES
  Silent switches vary by Google packaging; this script does not run silent repair by default.
  Run "npm run bossmind:chrome:bookmark-backup" with Chrome closed for Bookmarks JSON/HTML backup inside the repo.
#>
param(
  [switch]$BackupUserData,
  [ValidateSet("Full", "Lean")]
  [string]$BackupMode = "Full",
  [switch]$AllowChromeRunning,
  [switch]$DownloadInstaller,
  [switch]$LaunchInstallerGui,
  [switch]$DumpChromeShortcuts,
  [switch]$MeasureUserDataSize
)

$ErrorActionPreference = "Continue"

$OfficialChromeUrl = "https://dl.google.com/chrome/install/ChromeStandaloneSetup64.exe"
$InstallerFileName = "ChromeStandaloneSetup64.exe"

$root = Split-Path -Parent $PSScriptRoot
$heal = Join-Path $root "windows-heal"
$stateDir = Join-Path $heal "state"
$dlDir = Join-Path $heal "downloads"
$backupRoot = Join-Path $heal "chrome-user-data-backups"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$snapshotPath = Join-Path $stateDir "chrome-repair-assist-$stamp.json"

New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
New-Item -ItemType Directory -Force -Path $dlDir | Out-Null

$userData = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"
$installerPath = Join-Path $dlDir $InstallerFileName

function Get-DirectorySizeBytes {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return 0 }
  $sum = 0
  Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue | ForEach-Object { $sum += $_.Length }
  return $sum
}

function Test-ChromeRunning {
  return [bool](Get-Process -Name "chrome" -ErrorAction SilentlyContinue)
}

function Get-ProfileInventory {
  param([string]$UserDataRoot)
  $profiles = New-Object System.Collections.Generic.List[object]
  if (-not (Test-Path -LiteralPath $UserDataRoot)) {
    return $profiles
  }
  $localStatePath = Join-Path $UserDataRoot "Local State"
  $localState = $null
  if (Test-Path -LiteralPath $localStatePath) {
    try {
      $localState = Get-Content -LiteralPath $localStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
      $localState = @{ parseError = $_.Exception.Message }
    }
  }
  $dirs = Get-ChildItem -LiteralPath $UserDataRoot -Directory -Force -ErrorAction SilentlyContinue
  foreach ($d in $dirs) {
    $n = $d.Name
    if ($n -eq "System Profile" -or $n -eq "Guest Profile") { continue }
    $isProfile = $false
    if ($n -eq "Default") { $isProfile = $true }
    if ($n -like "Profile *") { $isProfile = $true }
    if (-not $isProfile) { continue }

    $bookmarks = Join-Path $d.FullName "Bookmarks"
    $prefs = Join-Path $d.FullName "Preferences"
    $obj = [ordered]@{
      folder     = $n
      bookmarks  = (Test-Path -LiteralPath $bookmarks)
      prefs      = (Test-Path -LiteralPath $prefs)
      bmBytes    = $(if (Test-Path -LiteralPath $bookmarks) { (Get-Item -LiteralPath $bookmarks).Length } else { 0 })
    }
    $profiles.Add($obj)
  }
  return [ordered]@{
    localStatePresent = (Test-Path -LiteralPath $localStatePath)
    profileInfoCount  = if ($localState -and $localState.profile -and $localState.profile.info_cache) { $localState.profile.info_cache.PSObject.Properties.Count } else { $null }
    profiles          = $profiles
  }
}

function Invoke-RobocopyUserDataBackup {
  param(
    [string]$Src,
    [string]$Dst,
    [string]$Mode
  )
  New-Item -ItemType Directory -Force -Path $Dst | Out-Null
  $args = @(
    "`"$Src`"", "`"$Dst`"", "/E", "/COPY:DAT", "/DCOPY:DAT", "/R:2", "/W:2", "/MT:8", "/XJ"
  )
  if ($Mode -eq "Lean") {
    $args += @(
      "/XD",
      "ShaderCache", "GrShaderCache", "GPUCache", "Code Cache", "Service Worker", "Cache", "Media Cache",
      "optimization_guide_model_store", "segmentation_platform", "Crash Reports", "VideoDecodeStats"
    )
  }
  $proc = Start-Process -FilePath "robocopy.exe" -ArgumentList $args -Wait -PassThru -NoNewWindow
  $code = $proc.ExitCode
  if ($code -ge 8) {
    throw "robocopy failed with exit code $code (see robocopy docs; 0-7 are OK-ish)."
  }
  return $code
}

function Get-ChromeShortcutReport {
  $shell = New-Object -ComObject WScript.Shell
  $commonDesktop = Join-Path $env:PUBLIC "Desktop"
  $paths = @(
    [Environment]::GetFolderPath("Desktop"),
    $commonDesktop,
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"),
    (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs")
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

  $rows = New-Object System.Collections.Generic.List[object]
  foreach ($base in $paths) {
    Get-ChildItem -LiteralPath $base -Filter "*.lnk" -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        $sc = $shell.CreateShortcut($_.FullName)
        $t = $sc.TargetPath
        if ($t -and ($t -like "*chrome.exe*" -or $t -like "*Chrome*Application*chrome.exe*")) {
          $rows.Add([ordered]@{
              lnk        = $_.FullName
              target     = $t
              arguments  = $sc.Arguments
              workingDir = $sc.WorkingDirectory
            })
        }
      } catch { }
    }
  }
  return $rows
}

Write-Host "=== Chrome official repair assist (BossMind-safe) ==="
Write-Host "Repo: $root"
Write-Host "User Data: $userData"
Write-Host ""

$chromeRunning = Test-ChromeRunning
Write-Host "Chrome processes running: $chromeRunning"

$approxSize = $null
if (Test-Path -LiteralPath $userData) {
  if ($MeasureUserDataSize) {
    Write-Host "Computing User Data size (may take a minute)..."
    $approxSize = Get-DirectorySizeBytes -Path $userData
    Write-Host ("Approx User Data size on disk: {0:N0} bytes" -f $approxSize)
  } else {
    Write-Host "User Data size scan skipped (use -MeasureUserDataSize for full recursive byte count)."
  }
} else {
  Write-Host "User Data path not found (Chrome may be unused or installed per-machine only)."
}

$inv = Get-ProfileInventory -UserDataRoot $userData

$snapshot = [ordered]@{
  stamp              = $stamp
  machine            = $env:COMPUTERNAME
  user               = $env:USERNAME
  userDataPath       = $userData
  userDataExists     = (Test-Path -LiteralPath $userData)
  chromeRunning      = $chromeRunning
  approximateBytes   = $approxSize
  officialInstaller  = $OfficialChromeUrl
  inventory          = $inv
  actions            = [ordered]@{
    backupRequested    = [bool]$BackupUserData
    backupMode         = $BackupMode
    downloadRequested  = [bool]$DownloadInstaller
    launchGuiRequested = [bool]$LaunchInstallerGui
    shortcutsDumped    = [bool]$DumpChromeShortcuts
    measuredUserData   = [bool]$MeasureUserDataSize
  }
}

if ($DumpChromeShortcuts) {
  Write-Host ""
  Write-Host "=== Chrome-related shortcuts (read-only) ==="
  $shorts = Get-ChromeShortcutReport
  $snapshot.shortcuts = @($shorts)
  $shorts | ForEach-Object {
    Write-Host ("---`n{0}`n  Target: {1}`n  Args: {2}" -f $_.lnk, $_.target, $_.arguments)
  }
}

if ($BackupUserData) {
  if ($chromeRunning -and -not $AllowChromeRunning) {
    Write-Host ""
    Write-Host "ERROR: Close all Chrome windows (check tray) before backup, or re-run with -AllowChromeRunning (not recommended)."
    $snapshot.backupError = "chrome_running"
    $snapshot | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $snapshotPath -Encoding UTF8
    exit 2
  }
  if (-not (Test-Path -LiteralPath $userData)) {
    Write-Host "ERROR: User Data missing; nothing to back up."
    exit 3
  }
  $dest = Join-Path $backupRoot $stamp
  New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
  Write-Host ""
  Write-Host "=== Backing up User Data with robocopy ==="
  Write-Host "Destination: $dest"
  $code = Invoke-RobocopyUserDataBackup -Src $userData -Dst $dest -Mode $BackupMode
  $snapshot.backup = [ordered]@{
    destination = $dest
    mode        = $BackupMode
    robocopyExit = $code
  }
  Write-Host "robocopy finished (exit $code ; 0-7 acceptable per robocopy rules)."
}

if ($DownloadInstaller) {
  Write-Host ""
  Write-Host "=== Downloading official Chrome offline installer ==="
  Write-Host "URL: $OfficialChromeUrl"
  Write-Host "Save: $installerPath"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $OfficialChromeUrl -OutFile $installerPath -UseBasicParsing
  $fi = Get-Item -LiteralPath $installerPath
  $snapshot.download = [ordered]@{
    path   = $installerPath
    bytes  = $fi.Length
    sha256 = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash
  }
  Write-Host ("Downloaded {0:N0} bytes; SHA256: {1}" -f $fi.Length, $snapshot.download.sha256)
}

if ($LaunchInstallerGui) {
  if (-not (Test-Path -LiteralPath $installerPath)) {
    Write-Host "ERROR: Installer not found at $installerPath. Run with -DownloadInstaller first."
    exit 4
  }
  Write-Host ""
  Write-Host "=== Launching installer (GUI, no extra args) ==="
  Start-Process -FilePath $installerPath
  $snapshot.launchInstallerGui = $true
}

$snapshot | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $snapshotPath -Encoding UTF8
Write-Host ""
Write-Host "Snapshot JSON: $snapshotPath"

Write-Host ""
Write-Host "=== Operator checklist (post-install) ==="
Write-Host "  [ ] Open chrome://version and confirm expected version/channel."
Write-Host "  [ ] chrome://settings/people - all profiles listed."
Write-Host "  [ ] chrome://sync-internals if you use sync (bookmarks/passwords)."
Write-Host "  [ ] chrome://extensions - extensions still present (may need re-enable once)."
Write-Host "  [ ] Snipping: Win+Shift+S border - see npm run bossmind:windows:snip-diagnostics (OS-level)."
Write-Host "  [ ] Cursor favorites / DeepSeek threads: stored in Cursor app data, not Chrome User Data."
Write-Host "  [ ] Optional: npm run bossmind:chrome:bookmark-backup (Chrome closed) before risky edits."
Write-Host "  [ ] Optional: npm run bossmind:checkpoint before wide repo edits."
Write-Host ""
Write-Host "Done."
