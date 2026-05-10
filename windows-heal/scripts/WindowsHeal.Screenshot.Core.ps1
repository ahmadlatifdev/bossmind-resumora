Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Register-SnippingAppxPackages {
  param($Settings)
  try {
    Get-AppxPackage *ScreenSketch* -AllUsers -ErrorAction SilentlyContinue | ForEach-Object {
      Add-AppxPackage -DisableDevelopmentMode -Register "$($_.InstallLocation)\AppXManifest.xml" -ErrorAction SilentlyContinue
    }
    Get-AppxPackage *SnippingTool* -AllUsers -ErrorAction SilentlyContinue | ForEach-Object {
      Add-AppxPackage -DisableDevelopmentMode -Register "$($_.InstallLocation)\AppXManifest.xml" -ErrorAction SilentlyContinue
    }
  } catch {
    Write-HealLog -Settings $Settings -Level "warn" -Message "Appx re-register warning" -Data @{ error = $_.Exception.Message }
  }
}

function Get-ScreenshotDiagnostics {
  param($Settings)
  $minutes = [int]$Settings.monitor.lookbackMinutes
  $startTime = (Get-Date).AddMinutes(-1 * $minutes)

  $appEvents = Get-WinEvent -FilterHashtable @{
    LogName = "Application"
    StartTime = $startTime
  } -ErrorAction SilentlyContinue
  $sysEvents = Get-WinEvent -FilterHashtable @{
    LogName = "System"
    StartTime = $startTime
  } -ErrorAction SilentlyContinue

  $snipEvents = $appEvents | Where-Object {
    $_.ProviderName -match "Application Error|AppModel-Runtime|Microsoft-Windows-TWinUI|Microsoft-Windows-AppXDeploymentServer" -or
    ($_.Message -match "SnippingTool|ScreenSketch|snip|screen capture|Windows\.ScreenSketch")
  }
  $clipboardEvents = $appEvents | Where-Object {
    $_.ProviderName -match "Clip|Application Error" -or
    ($_.Message -match "clipboard|clip service")
  }
  $displayEvents = $sysEvents | Where-Object {
    $_.ProviderName -in @("Display","nvlddmkm","amdkmdag","igfx","Dwm-Core","Desktop Window Manager") -or
    $_.Id -in 4101
  }

  $snipProc = Get-Process -Name "SnippingTool","ScreenClippingHost","TextInputHost" -ErrorAction SilentlyContinue
  $shellExp = Get-Process -Name "ShellExperienceHost" -ErrorAction SilentlyContinue
  $explorer = Get-Process -Name "explorer" -ErrorAction SilentlyContinue

  $gpu = Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, DriverDate, CurrentRefreshRate, AdapterRAM
  $os = Get-CimInstance Win32_OperatingSystem
  $memoryPressure = [math]::Round((1 - ($os.FreePhysicalMemory / $os.TotalVisibleMemorySize)) * 100, 2)

  $clipHist = $null
  try {
    $clipHist = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Clipboard" -Name "EnableClipboardHistory" -ErrorAction SilentlyContinue
  } catch { }

  $snipHotkey = $null
  try {
    $snipHotkey = Get-ItemProperty -Path "HKCU:\Control Panel\Keyboard" -Name "PrintScreenKeyForSnippingEnabled" -ErrorAction SilentlyContinue
  } catch { }

  $hdrState = $null
  try {
    $hdrState = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\VideoSettings" -ErrorAction SilentlyContinue
  } catch { }

  $enableTransparency = $null
  try {
    $tp = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" -Name "EnableTransparency" -ErrorAction SilentlyContinue
    if ($null -ne $tp -and $tp.PSObject.Properties.Name -contains "EnableTransparency") {
      $enableTransparency = [int]$tp.EnableTransparency
    }
  } catch { }

  $animationEffects = $null
  try {
    $anim = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Accessibility" -Name "AnimationEffects" -ErrorAction SilentlyContinue
    if ($null -ne $anim -and $anim.PSObject.Properties.Name -contains "AnimationEffects") {
      $animationEffects = [int]$anim.AnimationEffects
    }
  } catch { }

  $gameDvrCapture = $null
  $gameDvrEnabled = $null
  try {
    $gd = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR" -ErrorAction SilentlyContinue
    if ($null -ne $gd) {
      if ($gd.PSObject.Properties.Name -contains "AppCaptureEnabled") { $gameDvrCapture = [int]$gd.AppCaptureEnabled }
      if ($gd.PSObject.Properties.Name -contains "GameDVR_Enabled") { $gameDvrEnabled = [int]$gd.GameDVR_Enabled }
    }
  } catch { }

  return [ordered]@{
    lookbackMinutes = $minutes
    snippingEventCount = @($snipEvents).Count
    clipboardEventCount = @($clipboardEvents).Count
    displayConflictCount = @($displayEvents).Count
    snippingProcesses = ($snipProc | Select-Object Name, Id, Responding)
    shellExperienceHostRunning = [bool]$shellExp
    explorerRunning = [bool]$explorer
    transparencyEffectsEnabled = $enableTransparency
    accessibilityAnimationEffects = $animationEffects
    gameDvrAppCaptureEnabled = $gameDvrCapture
    gameDvrGloballyEnabled = $gameDvrEnabled
    memoryPressurePercent = $memoryPressure
    gpu = $gpu
    clipboardHistoryEnabled = if ($clipHist) { [int]$clipHist.EnableClipboardHistory } else { $null }
    snippingHotkeyEnabled = if ($snipHotkey) { [int]$snipHotkey.PrintScreenKeyForSnippingEnabled } else { $null }
    hdrSignalPresent = [bool]$hdrState
    recentSnipEvents = ($snipEvents | Select-Object -First 12 TimeCreated, Id, ProviderName, LevelDisplayName, Message)
    recentDisplayEvents = ($displayEvents | Select-Object -First 12 TimeCreated, Id, ProviderName, LevelDisplayName, Message)
  }
}

function Test-ScreenshotTriggers {
  param($Diag)
  $actions = @()
  if (-not $Diag.explorerRunning) { $actions += "restart_explorer" }
  if (-not $Diag.shellExperienceHostRunning) { $actions += "repair_overlay_visibility" }
  if (($null -ne $Diag.transparencyEffectsEnabled) -and ($Diag.transparencyEffectsEnabled -eq 0)) {
    $actions += "repair_overlay_visibility"
  }
  if (($null -ne $Diag.accessibilityAnimationEffects) -and ($Diag.accessibilityAnimationEffects -eq 0)) {
    $actions += "repair_overlay_visibility"
  }
  if ($Diag.snippingEventCount -gt 0) { $actions += "repair_snipping" }
  if ($Diag.clipboardEventCount -gt 0) { $actions += "repair_clipboard" }
  if ($Diag.displayConflictCount -gt 0) { $actions += "repair_display_overlay" }
  if ($Diag.memoryPressurePercent -ge 90) { $actions += "memory_cleanup" }
  return ($actions | Select-Object -Unique)
}

function Invoke-ScreenshotRepair {
  param($Settings, [string[]]$Actions)

  if ($Actions -contains "restart_explorer" -and ($Actions -notcontains "repair_overlay_visibility")) {
    Write-HealLog -Settings $Settings -Level "info" -Message "Restarting explorer for screenshot overlay recovery" -Data @{}
    Get-Process explorer -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 700
    Start-Process explorer.exe | Out-Null
  }

  if ($Actions -contains "repair_overlay_visibility") {
    Write-HealLog -Settings $Settings -Level "info" -Message "Repairing screenshot overlay visibility (transparency, shell host, clipping)" -Data @{}
    try {
      $pers = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"
      New-Item -Path $pers -Force | Out-Null
      Set-ItemProperty -Path $pers -Name "EnableTransparency" -Type DWord -Value 1
    } catch {
      Write-HealLog -Settings $Settings -Level "warn" -Message "EnableTransparency repair warning" -Data @{ error = $_.Exception.Message }
    }
    try {
      $a11y = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Accessibility"
      New-Item -Path $a11y -Force | Out-Null
      Set-ItemProperty -Path $a11y -Name "AnimationEffects" -Type DWord -Value 1 -ErrorAction SilentlyContinue
    } catch {
      Write-HealLog -Settings $Settings -Level "warn" -Message "AnimationEffects repair warning" -Data @{ error = $_.Exception.Message }
    }
    try {
      $gd = "HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR"
      New-Item -Path $gd -Force | Out-Null
      Set-ItemProperty -Path $gd -Name "AppCaptureEnabled" -Type DWord -Value 0 -ErrorAction SilentlyContinue
      Set-ItemProperty -Path $gd -Name "GameDVR_Enabled" -Type DWord -Value 0 -ErrorAction SilentlyContinue
    } catch {
      Write-HealLog -Settings $Settings -Level "warn" -Message "GameDVR conflict reduction warning" -Data @{ error = $_.Exception.Message }
    }
    Get-Process -Name "SnippingTool","ScreenClippingHost","ShellExperienceHost" -ErrorAction SilentlyContinue |
      Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
    Get-Process explorer -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 700
    Start-Process explorer.exe | Out-Null
    Start-Sleep -Milliseconds 500
    Register-SnippingAppxPackages -Settings $Settings
    try {
      New-Item -Path "HKCU:\Control Panel\Keyboard" -Force | Out-Null
      Set-ItemProperty -Path "HKCU:\Control Panel\Keyboard" -Name "PrintScreenKeyForSnippingEnabled" -Type String -Value "1"
    } catch {
      Write-HealLog -Settings $Settings -Level "warn" -Message "Snipping hotkey reassert warning" -Data @{ error = $_.Exception.Message }
    }
  }

  if ($Actions -contains "repair_snipping") {
    Write-HealLog -Settings $Settings -Level "info" -Message "Repairing Snipping Tool packages and processes" -Data @{}
    Get-Process -Name "SnippingTool","ScreenClippingHost" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    Register-SnippingAppxPackages -Settings $Settings
  }

  if ($Actions -contains "repair_clipboard") {
    Write-HealLog -Settings $Settings -Level "info" -Message "Repairing clipboard stack" -Data @{}
    try {
      Set-Clipboard -Value "" -ErrorAction SilentlyContinue
      New-Item -Path "HKCU:\Software\Microsoft\Clipboard" -Force | Out-Null
      Set-ItemProperty -Path "HKCU:\Software\Microsoft\Clipboard" -Name "EnableClipboardHistory" -Type DWord -Value 1
    } catch {
      Write-HealLog -Settings $Settings -Level "warn" -Message "Clipboard repair warning" -Data @{ error = $_.Exception.Message }
    }
  }

  if ($Actions -contains "repair_display_overlay") {
    Write-HealLog -Settings $Settings -Level "info" -Message "Repairing display overlay stack for snipping UI" -Data @{}
    try {
      Get-PnpDevice -Class Display -ErrorAction SilentlyContinue | ForEach-Object {
        Disable-PnpDevice -InstanceId $_.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 600
        Enable-PnpDevice -InstanceId $_.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
      }
    } catch {
      Write-HealLog -Settings $Settings -Level "warn" -Message "Display overlay repair warning" -Data @{ error = $_.Exception.Message }
    }
  }

  # Reassert screenshot hotkey integration safely.
  try {
    New-Item -Path "HKCU:\Control Panel\Keyboard" -Force | Out-Null
    Set-ItemProperty -Path "HKCU:\Control Panel\Keyboard" -Name "PrintScreenKeyForSnippingEnabled" -Type String -Value "1"
  } catch {
    Write-HealLog -Settings $Settings -Level "warn" -Message "Snipping hotkey reset warning" -Data @{ error = $_.Exception.Message }
  }
}

function Invoke-ScreenshotIntegrityRepair {
  param($Settings)
  Write-HealLog -Settings $Settings -Level "info" -Message "Running DISM/SFC for screenshot subsystem stability" -Data @{}
  Start-Process -FilePath dism.exe -ArgumentList "/Online","/Cleanup-Image","/RestoreHealth" -Wait -NoNewWindow
  Start-Process -FilePath sfc.exe -ArgumentList "/scannow" -Wait -NoNewWindow
}

function Write-ScreenshotDashboard {
  param($Settings, $Diag, [string[]]$Actions, [string]$Mode)
  $path = Join-Path $Settings.logging.reportRoot "screenshot-dashboard.html"
  $score = 100
  $score -= [math]::Min(35, $Diag.snippingEventCount * 8)
  $score -= [math]::Min(25, $Diag.clipboardEventCount * 7)
  $score -= [math]::Min(25, $Diag.displayConflictCount * 7)
  if (-not $Diag.explorerRunning) { $score -= 20 }
  if ($score -lt 0) { $score = 0 }
  $snipEvents = ($Diag.recentSnipEvents | ConvertTo-Json -Depth 5)
  $displayEvents = ($Diag.recentDisplayEvents | ConvertTo-Json -Depth 5)
  $html = @"
<!doctype html><html><head><meta charset='utf-8'><title>Screenshot Heal Dashboard</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;background:#0b111a;color:#e6edf3;margin:24px}.kpi{display:inline-block;background:#111a28;padding:12px 14px;border-radius:8px;margin:6px;border:1px solid #25344d}pre{background:#111a28;padding:12px;border-radius:8px;overflow:auto}</style>
</head><body>
<h1>Windows Screenshot Healing Dashboard</h1>
<div class='kpi'>Mode: <b>$Mode</b></div>
<div class='kpi'>Stability Score: <b>$score / 100</b></div>
<div class='kpi'>Snipping Events: <b>$($Diag.snippingEventCount)</b></div>
<div class='kpi'>Clipboard Events: <b>$($Diag.clipboardEventCount)</b></div>
<div class='kpi'>Display Conflicts: <b>$($Diag.displayConflictCount)</b></div>
<div class='kpi'>Explorer Running: <b>$($Diag.explorerRunning)</b></div>
<div class='kpi'>ShellExperienceHost: <b>$($Diag.shellExperienceHostRunning)</b></div>
<div class='kpi'>Transparency (Themes): <b>$($Diag.transparencyEffectsEnabled)</b></div>
<div class='kpi'>Accessibility Animations: <b>$($Diag.accessibilityAnimationEffects)</b></div>
<div class='kpi'>GameDVR Capture: <b>$($Diag.gameDvrAppCaptureEnabled)</b> / DVR: <b>$($Diag.gameDvrGloballyEnabled)</b></div>
<h2>Triggered Actions</h2><pre>$($Actions -join "`n")</pre>
<h2>Snipping Events</h2><pre>$snipEvents</pre>
<h2>Display Events</h2><pre>$displayEvents</pre>
</body></html>
"@
  Set-Content -Path $path -Value $html -Encoding UTF8
}
