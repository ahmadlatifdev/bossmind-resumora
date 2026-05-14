#Requires -Version 5.1
<#
.SYNOPSIS
  BossMind-safe laptop workspace validation (repo-only, no OS-wide mutation).

.DESCRIPTION
  - Optional Chrome Bookmarks file COPY to windows-heal (only if Chrome is NOT running).
  - Read-only keyboard / display diagnostics.
  - Writes a timestamped report under windows-heal/reports/.
  Does NOT: change Windows DPI, Gmail, Cursor chats, or global popup clamping.

.PARAMETER SkipChromeBackup
  Skip copying Chrome Bookmarks files even when Chrome is closed.

.PARAMETER RepairAccessibilitySafe
  Passed through to windows-keyboard-shortcut-diagnostics.ps1 (HKCU flags only).
#>
param(
  [switch]$SkipChromeBackup,
  [switch]$RepairAccessibilitySafe
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportDir = Join-Path $root "windows-heal\reports"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$reportFile = Join-Path $reportDir "laptop-workspace-safe-validation-$stamp.txt"
$lines = New-Object System.Collections.Generic.List[string]

function Add-Line($s) { [void]$lines.Add($s); Write-Host $s }

Add-Line "=== BossMind laptop workspace SAFE validation ==="
Add-Line "Timestamp (UTC-ish): $(Get-Date -Format o)"
Add-Line "Repo: $root"
Add-Line ""
Add-Line "SCOPE: Repo scripts + read-only diagnostics only."
Add-Line "NOT performed: OS DPI changes, Gmail policy, Cursor/DeepSeek chat DB, global menu clamping."
Add-Line ""

# --- Chrome bookmark backup (copy only) ---
$chromeProc = Get-Process -Name "chrome" -ErrorAction SilentlyContinue
if ($SkipChromeBackup) {
  Add-Line "[Chrome backup] Skipped (-SkipChromeBackup)."
} elseif ($chromeProc) {
  Add-Line "[Chrome backup] SKIPPED: Chrome process(es) running. Close all Chrome windows and re-run to copy Bookmarks.bak safely."
} else {
  Add-Line "[Chrome backup] Running node chrome-bookmark-consolidation.mjs --backup-bookmarks ..."
  Push-Location $root
  try {
    $node = & node scripts/chrome-bookmark-consolidation.mjs --backup-bookmarks 2>&1
    $node | ForEach-Object { Add-Line "  $_" }
  } catch {
    Add-Line "  ERROR: $_"
  } finally {
    Pop-Location
  }
}

Add-Line ""
Add-Line "=== Keyboard + display diagnostics ==="
$diagScript = Join-Path $root "scripts\windows-keyboard-shortcut-diagnostics.ps1"
$diagArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $diagScript)
if ($RepairAccessibilitySafe) { $diagArgs += "-RepairAccessibilitySafe" }
$diagOut = & powershell.exe @diagArgs 2>&1
$diagOut | ForEach-Object { Add-Line $_ }

Add-Line ""
Add-Line "=== Bookmark consolidation audit (read-only merge list + HTML) ==="
Push-Location $root
try {
  $c = & node scripts/chrome-bookmark-consolidation.mjs 2>&1
  $c | Select-Object -First 25 | ForEach-Object { Add-Line "  $_" }
} catch {
  Add-Line "  ERROR: $_"
} finally {
  Pop-Location
}

Add-Line ""
Add-Line "=== Snipping overlay diagnostics (read-only) ==="
$snip = Join-Path $root "scripts\windows-snipping-overlay-diagnostics.ps1"
if (Test-Path -LiteralPath $snip) {
  $snOut = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $snip 2>&1
  $snOut | Select-Object -First 40 | ForEach-Object { Add-Line $_ }
} else {
  Add-Line "  (snipping script not found)"
}

Add-Line ""
Add-Line "=== Post-checklist (operator) ==="
Add-Line "  [ ] Chrome shortcuts: test with extensions disabled if any fail."
Add-Line "  [ ] Settings > Accessibility > Keyboard: Sticky/Filter keys off unless needed."
Add-Line "  [ ] Display scale: Settings > System > Display (single consistent % per monitor)."
Add-Line "  [ ] Cursor: re-pin DeepSeek/BossMind favorites (not stored in Chrome)."
Add-Line "  [ ] Gmail: verify correct profile / account in address bar."
Add-Line ""

[System.IO.File]::WriteAllLines($reportFile, $lines)
Add-Line "Report written: $reportFile"
