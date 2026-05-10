param(
  [ValidateSet("Monitor","Repair")]
  [string]$Mode = "Monitor"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$runner = Join-Path $PSScriptRoot "WindowsHeal.Runner.ps1"
if (-not (Test-Path $runner)) {
  throw "Runner script missing: $runner"
}

$runnerMode = if ($Mode -eq "Repair") { "AutoHeal" } else { "Detect" }
$result = & powershell -NoProfile -ExecutionPolicy Bypass -File $runner -Mode $runnerMode
$obj = $null
try {
  $obj = $result | ConvertFrom-Json
} catch {
  $obj = [ordered]@{ raw = $result }
}

$report = [ordered]@{
  ts = (Get-Date).ToString("o")
  orchestratorMode = $Mode
  runnerMode = $runnerMode
  result = $obj
}

$stateDir = Join-Path (Split-Path $PSScriptRoot -Parent) "state"
if (-not (Test-Path $stateDir)) { New-Item -ItemType Directory -Path $stateDir -Force | Out-Null }
$out = Join-Path $stateDir "orchestrator-last.json"
$report | ConvertTo-Json -Depth 9 | Set-Content -Path $out -Encoding UTF8

$report | ConvertTo-Json -Depth 9
