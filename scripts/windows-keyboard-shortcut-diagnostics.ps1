#Requires -Version 5.1
<#
.SYNOPSIS
  Read-only diagnostics for Windows keyboard shortcuts (Sticky/Filter/Toggle keys, languages, remappers).

.DESCRIPTION
  Does NOT modify Chrome profiles, bookmarks, or Bitdefender. Use -RepairAccessibilitySafe only after review;
  it resets HKCU accessibility keyboard flags to Windows defaults (may affect intentional accessibility use).

.PARAMETER RepairAccessibilitySafe
  If set, writes default Flags to StickyKeys / Keyboard Response / ToggleKeys under HKCU (current user only).
#>
param(
  [switch]$RepairAccessibilitySafe
)

$ErrorActionPreference = "Continue"

function Show-RegPath($path) {
  Write-Host ""
  Write-Host "[$path]"
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Host "  (path not present)"
    return
  }
  Get-ItemProperty -LiteralPath $path | Select-Object Flags, On, KeyboardDelay, KeyboardSpeed, BounceTime,
    DelayBeforeAcceptance, AutoRepeatDelay, AutoRepeatRate -ErrorAction SilentlyContinue | Format-List
}

Write-Host "=== Windows keyboard / accessibility (HKCU) ==="
Show-RegPath "HKCU:\Control Panel\Accessibility\StickyKeys"
Show-RegPath "HKCU:\Control Panel\Accessibility\Keyboard Response"
Show-RegPath "HKCU:\Control Panel\Accessibility\ToggleKeys"
Show-RegPath "HKCU:\Control Panel\Accessibility\MouseKeys"

Write-Host ""
Write-Host "=== Input languages ==="
try {
  (Get-WinUserLanguageList).LanguageTag
} catch {
  Write-Host "  (Get-WinUserLanguageList unavailable: $_)"
}

Write-Host ""
Write-Host "=== Processes that often remap or intercept keys (sample) ==="
$names = @(
  "AutoHotkey", "autohotkey64", "PowerToys", "PowerToys.PowerLauncher",
  "SharpKeys", "X-Mouse Button Control", "Razer*", "Armoury*", "Asus*",
  "Bitdefender*", "bdagent", "vsserv", "GoogleCrashHandler", "GoogleCrashHandler64"
)
foreach ($pat in $names) {
  Get-Process -Name $pat -ErrorAction SilentlyContinue |
    Select-Object -First 2 Name, Id |
    Format-Table -AutoSize
}

Write-Host ""
Write-Host "=== Primary display work area (read-only) ==="
try {
  Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
  $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  Write-Host "  Bounds: $($bounds.Width)x$($bounds.Height) at $($bounds.Left),$($bounds.Top)"
  Write-Host "  WorkingArea (excludes taskbar): $($wa.Width)x$($wa.Height) at $($wa.Left),$($wa.Top)"
} catch {
  Write-Host "  (Could not load System.Windows.Forms: $_)"
}

Write-Host ""
Write-Host "=== Chrome shortcuts - manual spot-check (operator) ==="
Write-Host "  Ctrl+Shift+Delete  Clear browsing data"
Write-Host "  Ctrl+Shift+B       Toggle bookmarks bar"
Write-Host "  Ctrl+Shift+O       Bookmark Manager"
Write-Host "  Ctrl+T / W / Tab   New tab / Close / Next tab"
Write-Host "  Ctrl+Shift+N       Incognito"
Write-Host "  If any fail: chrome://extensions (disable all), chrome://settings/shortcuts, then security software."

Write-Host ""
Write-Host "=== Chrome User Data (profiles only, names) ==="
$chromeData = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"
if (Test-Path -LiteralPath $chromeData) {
  Get-ChildItem -LiteralPath $chromeData -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^(Default|Profile \d+|System Profile)$' } |
    Select-Object -ExpandProperty Name
} else {
  Write-Host "  (Chrome User Data folder not found)"
}

if ($RepairAccessibilitySafe) {
  Write-Host ""
  Write-Host "=== REPAIR: resetting HKCU accessibility Flags (current user) ==="
  # Common Windows defaults: StickyKeys 510, Filter 122, Toggle 58 (values vary by OS build).
  $fixes = @(
    @{ Path = "HKCU:\Control Panel\Accessibility\StickyKeys";       Name = "Flags"; Value = "510" },
    @{ Path = "HKCU:\Control Panel\Accessibility\Keyboard Response"; Name = "Flags"; Value = "122" },
    @{ Path = "HKCU:\Control Panel\Accessibility\ToggleKeys";        Name = "Flags"; Value = "58" }
  )
  foreach ($f in $fixes) {
    if (Test-Path -LiteralPath $f.Path) {
      Set-ItemProperty -LiteralPath $f.Path -Name $f.Name -Value $f.Value -Type String -ErrorAction Stop
      Write-Host "  Set $($f.Path) $($f.Name)=$($f.Value)"
    }
  }
  Write-Host "  Log off or reboot may be required for full effect."
}

Write-Host ""
Write-Host 'Done. Interpret Flags with Windows docs; Sticky/Filter Keys UI: Settings > Accessibility > Keyboard'
