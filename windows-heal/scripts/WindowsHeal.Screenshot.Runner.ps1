param(
  [ValidateSet("Detect","Diagnose","Repair","AutoHeal")]
  [string]$Mode = "AutoHeal",
  [switch]$DeepIntegrityRepair
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. "$PSScriptRoot\WindowsHeal.Core.ps1"
. "$PSScriptRoot\WindowsHeal.Screenshot.Core.ps1"

$root = Get-HealRoot -ScriptPath $PSCommandPath
$settings = Get-HealSettings -RootPath $root
Ensure-HealPaths -Settings $settings

Write-HealLog -Settings $settings -Level "info" -Message "Screenshot runner start" -Data @{ mode = $Mode }
$diag = Get-ScreenshotDiagnostics -Settings $settings
$actions = Test-ScreenshotTriggers -Diag $diag

Save-HealSnapshot -Settings $settings -Snapshot @{
  subsystem = "screenshot"
  phase = "pre"
  mode = $Mode
  diagnostics = $diag
  actions = $actions
}

if ($Mode -eq "Detect" -or $Mode -eq "Diagnose") {
  Write-ScreenshotDashboard -Settings $settings -Diag $diag -Actions $actions -Mode $Mode
  [ordered]@{
    subsystem = "screenshot"
    diagnostics = $diag
    actions = $actions
  } | ConvertTo-Json -Depth 8
  exit 0
}

if ($Mode -eq "Repair" -or $Mode -eq "AutoHeal") {
  Invoke-CreateRestorePoint -Settings $settings -Label "WindowsHeal-Screenshot-$Mode-$(Get-Date -Format yyyyMMdd-HHmm)"
  Invoke-ScreenshotRepair -Settings $settings -Actions $actions
  if ($DeepIntegrityRepair -or $Mode -eq "Repair") {
    Invoke-ScreenshotIntegrityRepair -Settings $settings
  }

  Start-Sleep -Seconds 2
  $verify = Get-ScreenshotDiagnostics -Settings $settings
  $verifyActions = Test-ScreenshotTriggers -Diag $verify
  Write-ScreenshotDashboard -Settings $settings -Diag $verify -Actions $verifyActions -Mode "$Mode-Verify"

  $incident = [ordered]@{
    subsystem = "screenshot"
    mode = $Mode
    initial = $diag
    repairedActions = $actions
    verify = $verify
    remainingTriggers = $verifyActions
  }
  Save-HealSnapshot -Settings $settings -Snapshot @{
    subsystem = "screenshot"
    phase = "post"
    mode = $Mode
    incident = $incident
  }
  Invoke-EscalationHooks -Settings $settings -Incident $incident
  Write-HealLog -Settings $settings -Level "info" -Message "Screenshot runner completed" -Data @{
    mode = $Mode
    repairedActions = $actions
    remaining = $verifyActions
  }
  $incident | ConvertTo-Json -Depth 8
  exit 0
}
