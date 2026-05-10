Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-HealRoot {
  param([string]$ScriptPath)
  return Split-Path -Path (Split-Path -Path $ScriptPath -Parent) -Parent
}

function Get-HealSettings {
  param([string]$RootPath)
  $settingsPath = Join-Path $RootPath "config\settings.json"
  if (-not (Test-Path $settingsPath)) {
    throw "Missing settings file: $settingsPath"
  }
  return Get-Content $settingsPath -Raw | ConvertFrom-Json
}

function Ensure-HealPaths {
  param($Settings)
  foreach ($p in @($Settings.logging.logRoot, $Settings.logging.reportRoot, $Settings.logging.stateRoot)) {
    if (-not (Test-Path $p)) {
      New-Item -ItemType Directory -Path $p -Force | Out-Null
    }
  }
}

function Write-HealLog {
  param(
    $Settings,
    [string]$Level,
    [string]$Message,
    [hashtable]$Data = @{}
  )
  $logFile = Join-Path $Settings.logging.logRoot "healing-log.jsonl"
  $entry = [ordered]@{
    ts = (Get-Date).ToString("o")
    level = $Level
    message = $Message
    data = $Data
  } | ConvertTo-Json -Compress
  Add-Content -Path $logFile -Value $entry
}

function Save-HealSnapshot {
  param($Settings, [hashtable]$Snapshot)
  if (-not $Settings.protection.enableStateSnapshots) { return }
  $ts = Get-Date -Format "yyyyMMdd-HHmmss"
  $out = Join-Path $Settings.logging.stateRoot "snapshot-$ts.json"
  $Snapshot | ConvertTo-Json -Depth 8 | Set-Content -Path $out -Encoding UTF8
}

function Get-GpuVendor {
  $controllers = Get-CimInstance Win32_VideoController
  if (-not $controllers) { return "unknown" }
  $names = ($controllers | ForEach-Object { $_.Name }) -join " | "
  if ($names -match "NVIDIA") { return "nvidia" }
  if ($names -match "AMD|Radeon") { return "amd" }
  if ($names -match "Intel") { return "intel" }
  return "unknown"
}

function Get-DisplayDiagnostics {
  param($Settings)
  $minutes = [int]$Settings.monitor.lookbackMinutes
  $startTime = (Get-Date).AddMinutes(-1 * $minutes)

  $critical = Get-WinEvent -FilterHashtable @{
    LogName = "System"
    StartTime = $startTime
    Level = 1,2
  } -ErrorAction SilentlyContinue

  $appCritical = Get-WinEvent -FilterHashtable @{
    LogName = "Application"
    StartTime = $startTime
    Level = 1,2
  } -ErrorAction SilentlyContinue

  $displayEvents = $critical | Where-Object {
    $_.ProviderName -in @("Display","nvlddmkm","amdkmdag","igfx","Application Error")
  }
  $explorerCrashes = $critical | Where-Object {
    $_.Message -match "explorer.exe" -or $_.ProviderName -eq "Application Error"
  }
  $displayTimeouts = $critical | Where-Object {
    $_.Message -match "display driver stopped responding|TDR|LiveKernelEvent" -or $_.Id -in 4101
  }
  $kernelPnpDisplay = $critical | Where-Object {
    $_.ProviderName -eq "Kernel-PnP" -and $_.Message -match "DISPLAY|monitor|video"
  }
  $blackScreenIndicators = ($critical + $appCritical) | ForEach-Object {
    $msg = ""
    try { $msg = $_.Message } catch { $msg = "" }
    if ($msg -match "black screen|Display driver|dwm.exe|Desktop Window Manager|explorer.exe stopped") { $_ }
  }

  $refreshRate = $null
  try {
    $refreshRate = (Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty CurrentRefreshRate)
  } catch { }

  $memory = Get-CimInstance Win32_OperatingSystem
  $usedPct = [math]::Round((1 - ($memory.FreePhysicalMemory / $memory.TotalVisibleMemorySize)) * 100, 2)
  $cpuPct = [math]::Round((Get-Counter '\Processor(_Total)\% Processor Time').CounterSamples.CookedValue, 2)
  $diskQueue = [math]::Round((Get-Counter '\PhysicalDisk(_Total)\Avg. Disk Queue Length').CounterSamples.CookedValue, 2)

  $disk = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" |
    Select-Object DeviceID, VolumeName, Size, FreeSpace
  $diskHealth = @()
  foreach ($d in $disk) {
    if (-not $d.Size) { continue }
    $freePct = [math]::Round(($d.FreeSpace / $d.Size) * 100, 2)
    $diskHealth += [ordered]@{
      drive = $d.DeviceID
      freePct = $freePct
      lowSpace = ($freePct -lt 12)
    }
  }

  $cpuTemp = $null
  try {
    $temps = Get-CimInstance -Namespace "root/wmi" -Class MSAcpi_ThermalZoneTemperature -ErrorAction Stop
    if ($temps) {
      $maxRaw = ($temps | Measure-Object CurrentTemperature -Maximum).Maximum
      $cpuTemp = [math]::Round(($maxRaw / 10) - 273.15, 1)
    }
  } catch { }

  $adaptiveBrightness = $null
  try {
    $adaptiveBrightness = (Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes" -ErrorAction SilentlyContinue) -ne $null
  } catch { }

  $startupItems = @(Get-CimInstance Win32_StartupCommand -ErrorAction SilentlyContinue)
  $startupHeavy = $startupItems | Where-Object {
    $_.Command -match "updater|helper|launcher|overlay|telemetry"
  }

  $serviceIssues = @(Get-Service | Where-Object { $_.Status -eq "Stopped" -and $_.StartType -eq "Automatic" } | Select-Object -First 15 Name, DisplayName, Status)

  return [ordered]@{
    lookbackMinutes = $minutes
    gpuVendor = Get-GpuVendor
    criticalCount = @($critical).Count
    displayEventCount = @($displayEvents).Count
    kernelPnpDisplayCount = @($kernelPnpDisplay).Count
    blackScreenIndicatorCount = @($blackScreenIndicators).Count
    explorerCrashCount = @($explorerCrashes).Count
    displayTimeoutCount = @($displayTimeouts).Count
    currentRefreshRate = $refreshRate
    memoryPressurePercent = $usedPct
    cpuSpikePercent = $cpuPct
    diskQueueLength = $diskQueue
    diskHealth = $diskHealth
    cpuTemperatureC = $cpuTemp
    adaptiveBrightnessSignalPresent = $adaptiveBrightness
    startupHeavyCount = @($startupHeavy).Count
    startupConflictCandidates = ($startupHeavy | Select-Object Name, Command, Location)
    serviceIssueCount = @($serviceIssues).Count
    serviceIssueCandidates = $serviceIssues
    events = ($displayEvents | Select-Object -First 12 TimeCreated, Id, ProviderName, LevelDisplayName, Message)
  }
}

function Get-PredictiveWarnings {
  param($Settings, $Diagnostics)
  $warnings = @()
  if ($Diagnostics.displayTimeoutCount -ge [int]$Settings.monitor.gpuCrashThreshold) {
    $warnings += "GPU timeout trend indicates possible future flicker recurrence."
  }
  if ($Diagnostics.kernelPnpDisplayCount -ge 2) {
    $warnings += "Monitor handshake churn detected (Kernel-PnP display events)."
  }
  if ($Diagnostics.currentRefreshRate -and $Diagnostics.currentRefreshRate -gt 120) {
    $warnings += "High refresh rate may amplify unstable cable/driver combinations."
  }
  if ($Diagnostics.cpuSpikePercent -ge [double]$Settings.monitor.cpuSpikePercent) {
    $warnings += "CPU spike risk detected; startup/service contention may destabilize desktop rendering."
  }
  if ($Diagnostics.diskQueueLength -ge [double]$Settings.monitor.diskQueueThreshold) {
    $warnings += "Disk queue pressure may cause UI stall and explorer instability."
  }
  if (@($Diagnostics.diskHealth | Where-Object { $_.lowSpace }).Count -gt 0) {
    $warnings += "Low disk free space detected; maintenance cleanup recommended."
  }
  return $warnings
}

function Test-HealTriggers {
  param($Settings, $Diagnostics)
  $actions = @()
  if ($Diagnostics.explorerCrashCount -ge [int]$Settings.monitor.flickerLoopThreshold) {
    $actions += "repair_explorer"
  }
  if ($Diagnostics.displayTimeoutCount -ge [int]$Settings.monitor.gpuCrashThreshold) {
    $actions += "repair_display_stack"
  }
  if ($Diagnostics.blackScreenIndicatorCount -ge 1) {
    $actions += "repair_display_stack"
  }
  if ($Diagnostics.memoryPressurePercent -ge [double]$Settings.monitor.memoryPressurePercent) {
    $actions += "memory_cleanup"
  }
  if ($Diagnostics.cpuSpikePercent -ge [double]$Settings.monitor.cpuSpikePercent) {
    $actions += "startup_optimization"
  }
  if ($Diagnostics.diskQueueLength -ge [double]$Settings.monitor.diskQueueThreshold) {
    $actions += "disk_pressure_cleanup"
  }
  if ($Diagnostics.cpuTemperatureC -and $Diagnostics.cpuTemperatureC -ge [double]$Settings.monitor.highTemperatureCelsius) {
    $actions += "thermal_protection"
  }
  if ($Diagnostics.serviceIssueCount -gt 0) {
    $actions += "service_repair"
  }
  return $actions
}

function Invoke-CreateRestorePoint {
  param($Settings, [string]$Label = "WindowsHeal-Checkpoint")
  if (-not $Settings.healing.createRestorePointBeforeMajorFixes) { return $false }
  try {
    Checkpoint-Computer -Description $Label -RestorePointType MODIFY_SETTINGS | Out-Null
    Write-HealLog -Settings $Settings -Level "info" -Message "Restore point created" -Data @{ label = $Label }
    return $true
  } catch {
    Write-HealLog -Settings $Settings -Level "warn" -Message "Restore point creation failed" -Data @{ error = $_.Exception.Message }
    return $false
  }
}

function Invoke-ExplorerRepair {
  param($Settings)
  Write-HealLog -Settings $Settings -Level "info" -Message "Restarting explorer.exe" -Data @{}
  Get-Process explorer -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Process explorer.exe | Out-Null
}

function Invoke-DisplayStackRepair {
  param($Settings)
  Write-HealLog -Settings $Settings -Level "info" -Message "Repairing display stack" -Data @{}
  try {
    Get-PnpDevice -Class Display -Status Error -ErrorAction SilentlyContinue |
      ForEach-Object {
        Disable-PnpDevice -InstanceId $_.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        Enable-PnpDevice -InstanceId $_.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
      }
  } catch {
    Write-HealLog -Settings $Settings -Level "warn" -Message "Display stack PnP reset warning" -Data @{ error = $_.Exception.Message }
  }
}

function Invoke-SystemIntegrityRepair {
  param($Settings)
  if (-not $Settings.healing.enableDismSfc) { return }
  Write-HealLog -Settings $Settings -Level "info" -Message "Running DISM restorehealth" -Data @{}
  Start-Process -FilePath dism.exe -ArgumentList "/Online","/Cleanup-Image","/RestoreHealth" -Wait -NoNewWindow
  Write-HealLog -Settings $Settings -Level "info" -Message "Running SFC scan" -Data @{}
  Start-Process -FilePath sfc.exe -ArgumentList "/scannow" -Wait -NoNewWindow
}

function Invoke-SafeOptimization {
  param($Settings)
  if ($Settings.optimization.trimTempFiles) {
    Write-HealLog -Settings $Settings -Level "info" -Message "Cleaning temp files" -Data @{}
    $tempPaths = @($env:TEMP, "$env:windir\Temp")
    foreach ($tp in $tempPaths) {
      if (Test-Path $tp) {
        Get-ChildItem -Path $tp -Force -ErrorAction SilentlyContinue |
          Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
      }
    }
  }
  if ($Settings.optimization.optimizePowerPlan) {
    $target = if ($Settings.optimization.preferBalancedPlan) { "SCHEME_BALANCED" } else { "SCHEME_MIN" }
    try {
      powercfg -setactive $target | Out-Null
      Write-HealLog -Settings $Settings -Level "info" -Message "Power profile optimized" -Data @{ profile = $target }
    } catch {
      Write-HealLog -Settings $Settings -Level "warn" -Message "Power profile update failed" -Data @{ error = $_.Exception.Message }
    }
  }
  if ($Settings.optimization.disableStartupApps) {
    Write-HealLog -Settings $Settings -Level "info" -Message "Startup optimization enabled; review in Task Manager Startup Apps" -Data @{}
  }
}

function Invoke-ServiceRepair {
  param($Settings)
  $targets = @("Themes","Dwm","WpnService","SysMain")
  foreach ($svc in $targets) {
    try {
      $s = Get-Service -Name $svc -ErrorAction SilentlyContinue
      if ($s -and $s.Status -ne "Running") {
        Start-Service -Name $svc -ErrorAction SilentlyContinue
      }
    } catch {
      Write-HealLog -Settings $Settings -Level "warn" -Message "Service repair issue" -Data @{ service = $svc; error = $_.Exception.Message }
    }
  }
}

function Invoke-DriverAudit {
  param($Settings)
  if (-not $Settings.protection.enableDriverAudit) { return @() }
  $drivers = Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue |
    Where-Object { $_.DeviceClass -eq "DISPLAY" } |
    Select-Object DeviceName, DriverVersion, DriverDate, Manufacturer, IsSigned
  $out = @()
  foreach ($d in $drivers) {
    $signed = $true
    if ($null -ne $d.IsSigned) { $signed = [bool]$d.IsSigned }
    $out += [ordered]@{
      device = $d.DeviceName
      version = $d.DriverVersion
      date = $d.DriverDate
      manufacturer = $d.Manufacturer
      signed = $signed
    }
  }
  return $out
}

function Invoke-EscalationHooks {
  param($Settings, [hashtable]$Incident)
  if (-not $Settings.integration.sendEscalations) { return }
  $json = $Incident | ConvertTo-Json -Depth 8
  if ($Settings.integration.cursorInstructionPath) {
    $json | Set-Content -Path $Settings.integration.cursorInstructionPath -Encoding UTF8
  }
  foreach ($url in @($Settings.integration.sentryWebhookUrl, $Settings.integration.langGraphWebhookUrl)) {
    if (-not [string]::IsNullOrWhiteSpace($url)) {
      try {
        Invoke-RestMethod -Uri $url -Method POST -ContentType "application/json" -Body $json | Out-Null
      } catch {
        Write-HealLog -Settings $Settings -Level "warn" -Message "Escalation hook failed" -Data @{ url = $url; error = $_.Exception.Message }
      }
    }
  }
}

function Invoke-DriverRollbackIfNeeded {
  param($Settings, $Diagnostics)
  if (-not $Settings.healing.allowAutomaticDriverRollback) { return }
  if ($Diagnostics.displayTimeoutCount -lt [int]$Settings.monitor.gpuCrashThreshold) { return }
  Write-HealLog -Settings $Settings -Level "warn" -Message "Display instability threshold met; attempting device rollback" -Data @{ vendor = $Diagnostics.gpuVendor }
  try {
    $display = Get-PnpDevice -Class Display -ErrorAction SilentlyContinue
    foreach ($d in $display) {
      pnputil /restart-device "$($d.InstanceId)" | Out-Null
    }
  } catch {
    Write-HealLog -Settings $Settings -Level "warn" -Message "Driver rollback/restart failed" -Data @{ error = $_.Exception.Message }
  }
}

function Invoke-DDUSafeModeRunbook {
  param($Settings)
  $scriptPath = Join-Path (Split-Path $Settings.logging.stateRoot -Parent) "scripts\WindowsHeal.SafeDriverRecovery.ps1"
  Write-HealLog -Settings $Settings -Level "info" -Message "DDU recovery runbook requested" -Data @{ script = $scriptPath }
  & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath
}

function Write-HealDashboard {
  param($Settings, $Diagnostics, [string[]]$Actions, [string[]]$Warnings, [string]$Mode)
  $reportPath = Join-Path $Settings.logging.reportRoot "dashboard.html"
  $score = 100
  $score -= [math]::Min(35, $Diagnostics.displayTimeoutCount * 12)
  $score -= [math]::Min(25, $Diagnostics.explorerCrashCount * 8)
  if ($Diagnostics.memoryPressurePercent -ge 90) { $score -= 15 }
  if ($Diagnostics.cpuTemperatureC -and $Diagnostics.cpuTemperatureC -ge 88) { $score -= 15 }
  if ($score -lt 0) { $score = 0 }
  $eventsJson = ($Diagnostics.events | ConvertTo-Json -Depth 4)
  $html = @"
<!doctype html><html><head><meta charset='utf-8'><title>Windows Heal Dashboard</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;background:#0b111a;color:#e6edf3;margin:24px} .kpi{display:inline-block;background:#111a28;padding:12px 14px;border-radius:8px;margin:6px;border:1px solid #25344d} pre{background:#111a28;padding:12px;border-radius:8px;overflow:auto}</style>
</head><body>
<h1>Windows AI Self-Healing Dashboard</h1>
<div class='kpi'>Mode: <b>$Mode</b></div>
<div class='kpi'>Stability Score: <b>$score / 100</b></div>
<div class='kpi'>GPU Vendor: <b>$($Diagnostics.gpuVendor)</b></div>
<div class='kpi'>Display Timeouts: <b>$($Diagnostics.displayTimeoutCount)</b></div>
<div class='kpi'>Explorer Crashes: <b>$($Diagnostics.explorerCrashCount)</b></div>
<div class='kpi'>Memory Pressure: <b>$($Diagnostics.memoryPressurePercent)%</b></div>
<div class='kpi'>CPU Spike: <b>$($Diagnostics.cpuSpikePercent)%</b></div>
<div class='kpi'>Disk Queue: <b>$($Diagnostics.diskQueueLength)</b></div>
<h2>Triggered Actions</h2><pre>$($Actions -join "`n")</pre>
<h2>Predictive Warnings</h2><pre>$($Warnings -join "`n")</pre>
<h2>Recent Display/Crash Events</h2><pre>$eventsJson</pre>
</body></html>
"@
  Set-Content -Path $reportPath -Value $html -Encoding UTF8
}
