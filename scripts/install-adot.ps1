#Requires -Version 5.1
<#
.SYNOPSIS
  Reference script for installing the AWS Distro for OpenTelemetry (ADOT) Collector on Windows.

.DESCRIPTION
  Prints download references, config path, and example service commands.
  Does not download or install binaries unless -ShowInstallCommands is passed.

.EXAMPLE
  .\scripts\install-adot.ps1
  .\scripts\install-adot.ps1 -ShowInstallCommands
#>
param(
  [string]$Region = "us-east-1",
  [string]$ReleasePage = "https://github.com/aws-observability/aws-otel-collector/releases",
  [string]$InstallDir = "C:\Program Files\AWS OTel Collector",
  [string]$ConfigPath = "C:\Program Files\AWS OTel Collector\config.yaml",
  [switch]$ShowInstallCommands
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$BundledConfig = Join-Path $RepoRoot "scripts\aws-otel-collector-config.yaml"
$XrayConfig = Join-Path $RepoRoot "scripts\xray-daemon-config.json"

function Write-Info($msg) {
  Write-Host "[BossMind ADOT] $msg"
}

function Test-AwsCredentials {
  $env:AWS_DEFAULT_REGION = $Region
  $env:AWS_REGION = $Region
  $result = & aws sts get-caller-identity --output json --region $Region 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[BossMind ADOT] WARNING: AWS credentials not verified. Collector will not export until IAM/instance credentials are available." -ForegroundColor Yellow
    Write-Host "[BossMind ADOT] Detail: $result" -ForegroundColor Yellow
    return $false
  }
  Write-Info "AWS credentials verified."
  return $true
}

Write-Info "Region: $Region"
Write-Info "ADOT releases: $ReleasePage"
Write-Info "Suggested install directory: $InstallDir"
Write-Info "Collector config path (placeholder): $ConfigPath"
Write-Info "Repo bundled collector config: $BundledConfig"
Write-Info "Companion X-Ray daemon config: $XrayConfig"

[void](Test-AwsCredentials)

if ($ShowInstallCommands) {
  Write-Info @"

Manual install steps (run PowerShell as Administrator):

1. Download the latest Windows amd64 ADOT collector binary from:
   $ReleasePage

2. Extract to:
   $InstallDir

3. Copy bundled config:
   Copy-Item '$BundledConfig' '$ConfigPath' -Force

4. Run collector (foreground test):
   & `"$InstallDir\aws-otel-collector.exe`" --config `"$ConfigPath`"

5. Optional: install as Windows service (sc.exe or NSSM) and ensure outbound OTLP apps target:
   http://127.0.0.1:4318

6. Optional X-Ray daemon (legacy SDK path):
   Use config at '$XrayConfig' with the AWS X-Ray daemon for us-east-1.

"@
} else {
  Write-Info "Re-run with -ShowInstallCommands to print full install commands."
}
