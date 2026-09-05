#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Lock Brother MFC-L6700DW to static IP 192.168.4.24 for print + ControlCenter4 LAN scan.

.DESCRIPTION
  - Fixes stale Brother registry IP (was 192.168.0.24)
  - Ensures Standard TCP/IP port IP_192.168.4.24 on raw port 9100
  - Points print/FAX queues to IP port (not WSD)
  - Sets Brother ForceIP so CC4 uses fixed address
  - Restarts Brother ControlCenter4 background service

  Run AFTER reserving 192.168.4.24 on the router (DHCP reservation) or setting static IP on the printer.

.PARAMETER PrinterIp
  Fixed LAN IP (default 192.168.4.24).

.PARAMETER MacAddress
  Printer MAC for DHCP reservation reference.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\configure-brother-mfc-static-ip.ps1
#>
[CmdletBinding()]
param(
  [string] $PrinterIp = '192.168.4.24',
  [string] $MacAddress = 'd4:6a:6a:a9:46:f8',
  [string] $PortName = 'IP_192.168.4.24',
  [string] $PrintQueue = 'Brother MFC-L6700DW series Printer',
  [string] $FaxQueue = 'Brother PC-FAX v.3.2',
  [string] $LanModelKey = 'MFC-L6700DW series LAN'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-PrinterReachable {
  param([string] $Ip)
  if (-not (Test-Connection -ComputerName $Ip -Count 1 -Quiet)) {
    throw "Printer not reachable at $Ip. Fix network or printer power first."
  }
}

Write-Host "Verifying printer at $PrinterIp ..."
Test-PrinterReachable -Ip $PrinterIp

$regPath = "HKLM:\SOFTWARE\WOW6432Node\Brother\Brother MFL-Pro\BrMfInfo\$LanModelKey"
if (-not (Test-Path $regPath)) {
  throw "Brother LAN registry key not found: $regPath"
}

$before = Get-ItemProperty $regPath
Write-Host "Registry before: IpAddress=$($before.IpAddress) PrinterPort=$($before.PrinterPort) ForceIP=$($before.ForceIP)"

Set-ItemProperty -Path $regPath -Name 'IpAddress' -Value $PrinterIp
Set-ItemProperty -Path $regPath -Name 'PrinterPort' -Value $PortName
Set-ItemProperty -Path $regPath -Name 'ForceIP' -Value 1 -Type DWord

Write-Host "Registry updated: IpAddress=$PrinterIp ForceIP=1 PrinterPort=$PortName"

if (-not (Get-PrinterPort -Name $PortName -ErrorAction SilentlyContinue)) {
  Write-Host "Creating TCP/IP port $PortName ..."
  Add-PrinterPort -Name $PortName -PrinterHostAddress $PrinterIp -PortNumber 9100
} else {
  $existing = Get-PrinterPort -Name $PortName
  if ($existing.PrinterHostAddress -ne $PrinterIp) {
    Write-Host "Port $PortName host is $($existing.PrinterHostAddress); recreate if needed via Print Management."
  }
}

if (Get-Printer -Name $PrintQueue -ErrorAction SilentlyContinue) {
  Set-Printer -Name $PrintQueue -PortName $PortName
  Write-Host "Print queue '$PrintQueue' -> $PortName"
}

if (Get-Printer -Name $FaxQueue -ErrorAction SilentlyContinue) {
  Set-Printer -Name $FaxQueue -PortName $PortName
  Write-Host "FAX queue '$FaxQueue' -> $PortName"
}

# Orphan WSD port (not used by queues) — remove only if unused
$wsdPorts = Get-PrinterPort | Where-Object { $_.Description -eq 'WSD Port' }
foreach ($wp in $wsdPorts) {
  $inUse = Get-Printer | Where-Object { $_.PortName -eq $wp.Name }
  if (-not $inUse) {
    Write-Host "Removing unused WSD port $($wp.Name)"
    Remove-PrinterPort -Name $wp.Name -ErrorAction SilentlyContinue
  }
}

Set-NetConnectionProfile -InterfaceAlias 'Wi-Fi' -NetworkCategory Private -ErrorAction SilentlyContinue

Restart-Service Spooler -Force
Start-Service StiSvc -ErrorAction SilentlyContinue
Start-Service WiaRpc -ErrorAction SilentlyContinue

Stop-Process -Name BrCcUxSys -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-Process 'C:\Program Files (x86)\ControlCenter4\BrCcUxSys.exe'

Write-Host ""
Write-Host "DONE. Fixed IP target: $PrinterIp (MAC $MacAddress for router DHCP reservation)." -ForegroundColor Green
Write-Host "Reserve on router/gateway 192.168.4.1: MAC $MacAddress -> IP $PrinterIp" -ForegroundColor Yellow
Write-Host "Open ControlCenter4 -> Configure -> Device Selection -> MFC-L6700DW series LAN -> verify IP $PrinterIp" -ForegroundColor Yellow
