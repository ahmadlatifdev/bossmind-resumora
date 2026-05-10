Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. "$PSScriptRoot\WindowsHeal.Core.ps1"
$root = Get-HealRoot -ScriptPath $PSCommandPath
$settings = Get-HealSettings -RootPath $root
Ensure-HealPaths -Settings $settings

$vendor = Get-GpuVendor
Write-HealLog -Settings $settings -Level "info" -Message "Starting safe driver recovery runbook" -Data @{ vendor = $vendor }

if (-not (Test-Path $settings.driver.dduPath)) {
  Write-HealLog -Settings $settings -Level "warn" -Message "DDU not found; skipping DDU step" -Data @{ dduPath = $settings.driver.dduPath }
} else {
  Write-HealLog -Settings $settings -Level "info" -Message "Launching DDU runbook instructions" -Data @{}
  Start-Process -FilePath $settings.driver.dduPath
}

$installer = switch ($vendor) {
  "nvidia" { $settings.driver.nvidiaInstallerPath }
  "amd" { $settings.driver.amdInstallerPath }
  "intel" { $settings.driver.intelInstallerPath }
  default { "" }
}

if ($installer -and (Test-Path $installer)) {
  Write-HealLog -Settings $settings -Level "info" -Message "Launching vendor installer" -Data @{ installer = $installer }
  Start-Process -FilePath $installer
} else {
  Write-HealLog -Settings $settings -Level "warn" -Message "Vendor installer missing; manual install required" -Data @{ vendor = $vendor; installer = $installer }
}

Write-Host "Safe driver recovery runbook initiated."
Write-Host "1) Boot Safe Mode."
Write-Host "2) Run DDU clean for your GPU vendor."
Write-Host "3) Reboot normal mode."
Write-Host "4) Install vendor WHQL driver (NVIDIA/AMD/Intel)."
Write-Host "5) Run WindowsHeal.Runner.ps1 -Mode Repair"
