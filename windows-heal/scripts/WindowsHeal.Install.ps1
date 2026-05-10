param(
  [switch]$RunNow
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Register-HealTask {
  param(
    [string]$TaskName,
    [string]$Mode,
    [string]$RunnerPath,
    [int]$MinutesInterval
  )
  $taskCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$RunnerPath`" -Mode $Mode"
  $null = schtasks /Create /TN $TaskName /TR $taskCmd /SC MINUTE /MO $MinutesInterval /RU SYSTEM /RL HIGHEST /F
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to register scheduled task '$TaskName'. Run this script as Administrator."
  }
}

$root = Split-Path -Path (Split-Path -Path $PSCommandPath -Parent) -Parent
$runner = Join-Path $root "scripts\WindowsHeal.Runner.ps1"
if (-not (Test-Path $runner)) {
  throw "Runner not found: $runner"
}

Register-HealTask -TaskName "WindowsHeal-Monitor" -Mode "Detect" -RunnerPath $runner -MinutesInterval 5
Register-HealTask -TaskName "WindowsHeal-AutoHeal" -Mode "AutoHeal" -RunnerPath $runner -MinutesInterval 20

if ($RunNow) {
  Start-ScheduledTask -TaskName "WindowsHeal-Monitor"
  Start-ScheduledTask -TaskName "WindowsHeal-AutoHeal"
}

Write-Host "Installed scheduled tasks:"
Write-Host " - WindowsHeal-Monitor (every 5 minutes)"
Write-Host " - WindowsHeal-AutoHeal (every 20 minutes)"
Write-Host "Dashboard location: $root\reports\dashboard.html"
