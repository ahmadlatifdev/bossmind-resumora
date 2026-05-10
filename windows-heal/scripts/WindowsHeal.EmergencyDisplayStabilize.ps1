Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "Applying emergency display stabilization..."

# 1) Force balanced plan + disable adaptive brightness (AC/DC)
try {
  powercfg -setactive SCHEME_BALANCED | Out-Null
  powercfg -setacvalueindex SCHEME_CURRENT SUB_VIDEO ADAPTBRIGHT 0 | Out-Null
  powercfg -setdcvalueindex SCHEME_CURRENT SUB_VIDEO ADAPTBRIGHT 0 | Out-Null
  powercfg -setactive SCHEME_CURRENT | Out-Null
  Write-Host "Adaptive brightness disabled."
} catch {
  Write-Warning "Could not set adaptive brightness: $($_.Exception.Message)"
}

# 2) Disable GameDVR and fullscreen optimization-related capture overhead
try {
  New-Item -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR" -Force | Out-Null
  Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR" -Name "AppCaptureEnabled" -Type DWord -Value 0
  New-Item -Path "HKCU:\System\GameConfigStore" -Force | Out-Null
  Set-ItemProperty -Path "HKCU:\System\GameConfigStore" -Name "GameDVR_Enabled" -Type DWord -Value 0
  Write-Host "GameDVR capture disabled."
} catch {
  Write-Warning "Could not update GameDVR settings: $($_.Exception.Message)"
}

# 3) Prefer stable monitor handshake behavior by restarting explorer and display devices
try {
  Get-Process explorer -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  Start-Process explorer.exe | Out-Null
  Write-Host "Explorer restarted."
} catch {
  Write-Warning "Explorer restart warning: $($_.Exception.Message)"
}

try {
  Get-PnpDevice -Class Display -ErrorAction SilentlyContinue | ForEach-Object {
    Disable-PnpDevice -InstanceId $_.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 600
    Enable-PnpDevice -InstanceId $_.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
  }
  Write-Host "Display devices toggled."
} catch {
  Write-Warning "Display device reset warning: $($_.Exception.Message)"
}

Write-Host "Emergency stabilization complete."
Write-Host "If blinking persists: set monitor to 60Hz manually and turn HDR OFF in Display Settings."
