param(
  [switch]$RunNow
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Register-ScreenshotTask {
  param(
    [string]$TaskName,
    [string]$Mode,
    [int]$Minutes
  )
  $root = Split-Path -Path (Split-Path -Path $PSCommandPath -Parent) -Parent
  $runner = Join-Path $root "scripts\WindowsHeal.Screenshot.Runner.ps1"
  if (-not (Test-Path $runner)) {
    throw "Missing screenshot runner: $runner"
  }
  $taskCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$runner`" -Mode $Mode"
  $null = schtasks /Create /TN $TaskName /TR $taskCmd /SC MINUTE /MO $Minutes /RU SYSTEM /RL HIGHEST /F
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to register '$TaskName'. Run as Administrator."
  }
}

Register-ScreenshotTask -TaskName "WindowsHeal-Screenshot-Monitor" -Mode "Detect" -Minutes 5
Register-ScreenshotTask -TaskName "WindowsHeal-Screenshot-AutoHeal" -Mode "AutoHeal" -Minutes 15

if ($RunNow) {
  Start-ScheduledTask -TaskName "WindowsHeal-Screenshot-Monitor"
  Start-ScheduledTask -TaskName "WindowsHeal-Screenshot-AutoHeal"
}

Write-Host "Installed screenshot healing tasks:"
Write-Host " - WindowsHeal-Screenshot-Monitor"
Write-Host " - WindowsHeal-Screenshot-AutoHeal"
