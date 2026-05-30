#Requires -Version 5.1
<#
.SYNOPSIS
  Reference script for installing the Amazon CloudWatch Agent on Windows.

.DESCRIPTION
  Does not perform unattended install by default. Prints download URL, config path placeholder,
  and example commands. Run as Administrator when applying the install steps.

.EXAMPLE
  .\scripts\install-cloudwatch-agent.ps1
  .\scripts\install-cloudwatch-agent.ps1 -ShowInstallCommands
#>
param(
  [string]$Region = "us-east-1",
  [string]$DownloadUrl = "https://amazoncloudwatch-agent.s3.amazonaws.com/windows/amd64/latest/amazon-cloudwatch-agent.msi",
  [string]$ConfigPath = "C:\ProgramData\Amazon\AmazonCloudWatchAgent\amazon-cloudwatch-agent.json",
  [switch]$ShowInstallCommands
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent

function Write-Info($msg) {
  Write-Host "[BossMind CloudWatch Agent] $msg"
}

function Test-AwsCredentials {
  $env:AWS_DEFAULT_REGION = $Region
  $env:AWS_REGION = $Region
  $result = & aws sts get-caller-identity --output json --region $Region 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[BossMind CloudWatch Agent] WARNING: AWS credentials not verified. Install can proceed, but agent metrics will not publish until credentials are configured." -ForegroundColor Yellow
    Write-Host "[BossMind CloudWatch Agent] Detail: $result" -ForegroundColor Yellow
    return $false
  }
  Write-Info "AWS credentials verified."
  return $true
}

Write-Info "Region: $Region"
Write-Info "Download URL: $DownloadUrl"
Write-Info "Agent config path (placeholder): $ConfigPath"
Write-Info "Author agent JSON config locally before starting the service."

[void](Test-AwsCredentials)

if ($ShowInstallCommands) {
  Write-Info @"

Manual install steps (run PowerShell as Administrator):

1. Download MSI:
   Invoke-WebRequest -Uri '$DownloadUrl' -OutFile `"`$env:TEMP\amazon-cloudwatch-agent.msi`"

2. Install:
   Start-Process msiexec.exe -ArgumentList '/i', `"`$env:TEMP\amazon-cloudwatch-agent.msi`", '/qn' -Wait

3. Copy or author config, then start agent:
   # Author $ConfigPath with metrics/collect settings for BossMind/Resumora before this step.
   & `"C:\Program Files\Amazon\AmazonCloudWatchAgent\amazon-cloudwatch-agent-ctl.ps1`" `
     -a fetch-config -m ec2 -s -c file:$ConfigPath

4. Verify service:
   Get-Service AmazonCloudWatchAgent

"@
} else {
  Write-Info "Re-run with -ShowInstallCommands to print full install commands."
}
