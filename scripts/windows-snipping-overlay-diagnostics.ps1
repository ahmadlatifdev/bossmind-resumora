#Requires -Version 5.1
<#
.SYNOPSIS
  Read-only diagnosis for Snipping Tool / Screen Snip overlay (border invisible during selection).

.DESCRIPTION
  Collects display scaling, HDR hint, personalization transparency, visual effects registry hints,
  video adapter names, and common overlay-interfering processes. Does NOT touch Chrome.

.PARAMETER ApplySafeUiHints
  If set, writes a few HKCU DWORD values commonly associated with composition/transparency
  (reversible via Settings). Still review before use.

.PARAMETER ExportPath
  Optional path to append JSON summary (default: windows-heal/reports under repo).
#>
param(
  [switch]$ApplySafeUiHints,
  [string]$ExportPath = ""
)

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not [string]::IsNullOrWhiteSpace($ExportPath)) {
  $outFile = $ExportPath
} else {
  $repDir = Join-Path $repoRoot "windows-heal\reports"
  New-Item -ItemType Directory -Force -Path $repDir | Out-Null
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $outFile = Join-Path $repDir "snipping-overlay-diagnostics-$stamp.json"
}

$script:SnipReport = @{
  generatedAt = (Get-Date -Format o)
  machine     = $env:COMPUTERNAME
  sections    = @{}
  recommendations = @()
}

function Add-Rec($s) { $script:SnipReport.recommendations += $s }

Write-Host "=== Snipping / overlay diagnostics (read-only) ==="

# --- Display / scaling ---
Write-Host "`n--- Display (primary) ---"
try {
  Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $w = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $script:SnipReport.sections.primaryDisplay = @{
    boundsWidth = $b.Width; boundsHeight = $b.Height
    workingWidth = $w.Width; workingHeight = $w.Height
  }
  Write-Host "  Bounds $($b.Width)x$($b.Height)  WorkingArea $($w.Width)x$($w.Height)"
} catch {
  Write-Host "  (Could not read screen: $_)"
}

# LogPixels DPI (approx): HKCU Control Panel\Desktop LogPixels
$dpiPath = "HKCU:\Control Panel\Desktop"
if (Test-Path -LiteralPath $dpiPath) {
  $dpi = Get-ItemProperty -LiteralPath $dpiPath -Name LogPixels -ErrorAction SilentlyContinue
  $win8 = Get-ItemProperty -LiteralPath $dpiPath -Name Win8DpiScaling -ErrorAction SilentlyContinue
  $script:SnipReport.sections.desktopDpi = @{ LogPixels = $dpi.LogPixels; Win8DpiScaling = $win8.Win8DpiScaling }
  Write-Host "  LogPixels=$($dpi.LogPixels) Win8DpiScaling=$($win8.Win8DpiScaling)"
}

# --- HDR (best-effort; API varies by build) ---
Write-Host "`n--- HDR (best-effort) ---"
try {
  $hdr = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\HDR" -ErrorAction SilentlyContinue
  if ($hdr) {
    $script:SnipReport.sections.hdrHint = $hdr | ConvertTo-Json -Depth 2 -Compress
    Write-Host "  HKCU HDR keys present (see JSON export)."
  } else {
    Write-Host '  No HKCU HDR key path (normal on some builds). Test HDR in Settings > Display.'
  }
} catch { Write-Host "  (HDR registry probe skipped: $_)" }

# --- Transparency / personalization ---
Write-Host "`n--- Personalization (transparency) ---"
$pers = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"
if (Test-Path -LiteralPath $pers) {
  $t = Get-ItemProperty -LiteralPath $pers -Name EnableTransparency -ErrorAction SilentlyContinue
  $script:SnipReport.sections.personalize = @{ EnableTransparency = $t.EnableTransparency }
  Write-Host "  EnableTransparency = $($t.EnableTransparency)  (1 = on)"
  if ($null -eq $t.EnableTransparency -or $t.EnableTransparency -eq 0) {
    Add-Rec 'Try Settings > Personalization > Colors > Transparency effects ON; retry Win+Shift+S.'
  }
}

# --- Visual effects (animations) - common path ---
Write-Host "`n--- Visual effects (explorer) ---"
$adv = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects"
if (Test-Path -LiteralPath $adv) {
  $ve = Get-ItemProperty -LiteralPath $adv -ErrorAction SilentlyContinue
  $script:SnipReport.sections.visualEffects = $ve | Select-Object * -ExcludeProperty PS* | ConvertTo-Json -Compress
  Write-Host "  VisualEffects keys exported to JSON."
} else {
  Write-Host '  (No VisualEffects key - OK on some builds.)'
}

# --- Snip / Shell capture hints ---
Write-Host "`n--- Screen Snip / Shell (selected keys) ---"
$shell = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer"
if (Test-Path -LiteralPath $shell) {
  $props = @("EnableSnapAssistFlyout", "ShowCortanaButton")
  $o = @{}
  foreach ($p in $props) {
    $v = Get-ItemProperty -LiteralPath $shell -Name $p -ErrorAction SilentlyContinue
    if ($null -ne $v.$p) { $o[$p] = $v.$p }
  }
  $script:SnipReport.sections.explorerHints = $o
}

# --- Video adapters ---
Write-Host "`n--- Video adapters ---"
try {
  $adapters = Get-CimInstance Win32_VideoController -ErrorAction Stop |
    Select-Object Name, DriverVersion, Status, Availability
  $script:SnipReport.sections.video = @($adapters | ForEach-Object { @{ Name = $_.Name; DriverVersion = $_.DriverVersion; Status = $_.Status } })
  $adapters | Format-Table Name, DriverVersion -AutoSize
} catch {
  Write-Host "  (WMI video query failed: $_)"
}

# --- Processes that often steal overlays ---
Write-Host "`n--- Overlay / capture competitors (sample) ---"
$names = @(
  "obs64", "OBS", "XSplit*", "ShareX", "Greenshot", "Lightshot",
  "Discord", "Nvidia*", "NVIDIA*", "Armoury*", "Asus*", "GameBar*", "GameBarFTServer"
)
foreach ($pat in $names) {
  Get-Process -Name $pat -ErrorAction SilentlyContinue | Select-Object -First 2 Name, Id | Format-Table -AutoSize
}

Add-Rec 'If overlay invisible: disable HDR temporarily; test 100%/125% scale; Repair Snipping Tool in Apps settings.'
Add-Rec 'Dual GPU: Settings > Display > Graphics - force Snipping Tool / Screen Snipping to iGPU or dGPU and test both.'
Add-Rec 'ASUS: pause Armoury Crate overlays / GameVisual; update Intel + discrete GPU drivers from ASUS + vendor.'

if ($ApplySafeUiHints) {
  Write-Host "`n=== APPLY: Safe UI hints (HKCU only) ==="
  if (-not (Test-Path -LiteralPath $pers)) { New-Item -Path $pers -Force | Out-Null }
  Set-ItemProperty -LiteralPath $pers -Name EnableTransparency -Value 1 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "  Set Personalize\EnableTransparency = 1"
  # Animations: UserPreferencesMask is fragile - do not touch; user uses Settings > Accessibility > Visual effects
  Add-Rec "Sign out or reboot recommended after transparency toggle."
}

$json = $script:SnipReport | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($outFile, $json)
Write-Host "`nJSON written: $outFile"
Write-Host "`nRecommendations:"
$script:SnipReport.recommendations | ForEach-Object { Write-Host "  - $_" }
