param(
  [ValidateSet("Detect","Diagnose","Repair","AutoHeal")]
  [string]$Mode = "AutoHeal",
  [switch]$EnableDriverRunbook
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. "$PSScriptRoot\WindowsHeal.Core.ps1"

$root = Get-HealRoot -ScriptPath $PSCommandPath
$settings = Get-HealSettings -RootPath $root
Ensure-HealPaths -Settings $settings

Write-HealLog -Settings $settings -Level "info" -Message "Runner start" -Data @{ mode = $Mode }
$diag = Get-DisplayDiagnostics -Settings $settings
$actions = Test-HealTriggers -Settings $settings -Diagnostics $diag
$warnings = Get-PredictiveWarnings -Settings $settings -Diagnostics $diag
$driverAudit = Invoke-DriverAudit -Settings $settings

Save-HealSnapshot -Settings $settings -Snapshot @{
  phase = "pre-repair"
  mode = $Mode
  diagnostics = $diag
  warnings = $warnings
  driverAudit = $driverAudit
}

if ($Mode -eq "Detect" -or $Mode -eq "Diagnose") {
  Write-HealDashboard -Settings $settings -Diagnostics $diag -Actions $actions -Warnings $warnings -Mode $Mode
  [ordered]@{
    diagnostics = $diag
    warnings = $warnings
    driverAudit = $driverAudit
  } | ConvertTo-Json -Depth 7
  exit 0
}

if ($Mode -eq "Repair" -or $Mode -eq "AutoHeal") {
  Invoke-CreateRestorePoint -Settings $settings -Label "WindowsHeal-$Mode-$(Get-Date -Format yyyyMMdd-HHmm)"
  if ($actions -contains "repair_explorer" -and $settings.healing.enableExplorerRepair) {
    Invoke-ExplorerRepair -Settings $settings
  }
  if ($actions -contains "repair_display_stack") {
    Invoke-DisplayStackRepair -Settings $settings
    Invoke-DriverRollbackIfNeeded -Settings $settings -Diagnostics $diag
  }
  if ($actions -contains "memory_cleanup") {
    Invoke-SafeOptimization -Settings $settings
  }
  if ($actions -contains "startup_optimization" -or $actions -contains "disk_pressure_cleanup") {
    Invoke-SafeOptimization -Settings $settings
  }
  if ($actions -contains "service_repair") {
    Invoke-ServiceRepair -Settings $settings
  }
  if ($actions -contains "thermal_protection") {
    Write-HealLog -Settings $settings -Level "warn" -Message "Thermal pressure detected; applying balanced power mode" -Data @{ tempC = $diag.cpuTemperatureC }
    powercfg -setactive SCHEME_BALANCED | Out-Null
  }

  if ($Mode -eq "Repair") {
    Invoke-SystemIntegrityRepair -Settings $settings
  }

  if ($EnableDriverRunbook) {
    Invoke-DDUSafeModeRunbook -Settings $settings
  }

  Start-Sleep -Seconds 3
  $verify = Get-DisplayDiagnostics -Settings $settings
  $verifyActions = Test-HealTriggers -Settings $settings -Diagnostics $verify
  $verifyWarnings = Get-PredictiveWarnings -Settings $settings -Diagnostics $verify
  Write-HealDashboard -Settings $settings -Diagnostics $verify -Actions $verifyActions -Warnings $verifyWarnings -Mode "$Mode-Verify"
  $incident = [ordered]@{
    ts = (Get-Date).ToString("o")
    mode = $Mode
    initial = $diag
    repairedActions = $actions
    verify = $verify
    remainingTriggers = $verifyActions
    warnings = $verifyWarnings
  }
  Save-HealSnapshot -Settings $settings -Snapshot @{
    phase = "post-repair"
    mode = $Mode
    incident = $incident
  }
  Invoke-EscalationHooks -Settings $settings -Incident $incident
  Write-HealLog -Settings $settings -Level "info" -Message "Runner completed" -Data @{
    mode = $Mode
    initialActions = $actions
    postActions = $verifyActions
    displayTimeouts = $verify.displayTimeoutCount
    explorerCrashes = $verify.explorerCrashCount
  }
  [ordered]@{
    mode = $Mode
    initial = $diag
    repairedActions = $actions
    verify = $verify
    remainingTriggers = $verifyActions
    warnings = $verifyWarnings
    driverAudit = $driverAudit
  } | ConvertTo-Json -Depth 7
  exit 0
}
