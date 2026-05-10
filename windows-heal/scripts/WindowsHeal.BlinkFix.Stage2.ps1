Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "Applying Stage-2 blink fix..."

# 1) Disable MPO (Multi-Plane Overlay), a common source of periodic flicker.
# Requires reboot to take full effect.
try {
  New-Item -Path "HKLM:\SOFTWARE\Microsoft\Windows\Dwm" -Force | Out-Null
  Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\Dwm" -Name "OverlayTestMode" -Type DWord -Value 5
  Write-Host "MPO disabled (OverlayTestMode=5)."
} catch {
  Write-Warning "Could not set MPO registry value (run as Administrator): $($_.Exception.Message)"
}

# 2) Turn off hardware accelerated GPU scheduling (HAGS) for stability.
try {
  New-Item -Path "HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers" -Force | Out-Null
  Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers" -Name "HwSchMode" -Type DWord -Value 1
  Write-Host "HAGS disabled (HwSchMode=1)."
} catch {
  Write-Warning "Could not set HAGS registry value (run as Administrator): $($_.Exception.Message)"
}

# 3) Reset display adapter stack (non-destructive).
try {
  Get-PnpDevice -Class Display -ErrorAction SilentlyContinue | ForEach-Object {
    Disable-PnpDevice -InstanceId $_.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 700
    Enable-PnpDevice -InstanceId $_.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
  }
  Write-Host "Display stack toggled."
} catch {
  Write-Warning "Display stack reset warning: $($_.Exception.Message)"
}

# 4) Restart explorer to refresh desktop composition path.
try {
  Get-Process explorer -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 800
  Start-Process explorer.exe | Out-Null
  Write-Host "Explorer restarted."
} catch {
  Write-Warning "Explorer restart warning: $($_.Exception.Message)"
}

Write-Host "Stage-2 fix applied."
Write-Host "IMPORTANT: Reboot Windows now for MPO/HAGS changes to fully apply."
