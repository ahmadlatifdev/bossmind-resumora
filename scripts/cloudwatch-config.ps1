#Requires -Version 5.1
<#
.SYNOPSIS
  Sets AWS region, verifies credentials, and outputs the BossMind/Resumora metric namespace.

.DESCRIPTION
  Reference script for local CloudWatch observability setup on Windows.
  Requires AWS CLI and valid credentials (env vars, shared credentials file, or SSO profile).

.EXAMPLE
  .\scripts\cloudwatch-config.ps1
#>
param(
  [string]$Region = "us-east-1",
  [string]$Namespace = "BossMind/Resumora",
  [string]$Profile = $env:AWS_PROFILE
)

$ErrorActionPreference = "Stop"

function Write-Info($msg) {
  Write-Host "[BossMind] $msg"
}

function Write-WarnExit($msg, [int]$Code = 1) {
  Write-Host "[BossMind] WARNING: $msg" -ForegroundColor Yellow
  exit $Code
}

Write-Info "Setting AWS region to $Region"
$env:AWS_DEFAULT_REGION = $Region
$env:AWS_REGION = $Region

if (-not $env:AWS_ACCESS_KEY_ID -and -not $Profile) {
  $credFile = Join-Path $HOME ".aws\credentials"
  if (-not (Test-Path $credFile)) {
    Write-WarnExit "AWS credentials not found. Set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, configure ~/.aws/credentials, or pass -Profile."
  }
}

$awsArgs = @("sts", "get-caller-identity", "--output", "json", "--region", $Region)
if ($Profile) {
  $awsArgs = @("--profile", $Profile) + $awsArgs
}

try {
  $identityJson = & aws @awsArgs 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-WarnExit "AWS credential verification failed: $identityJson"
  }
  $identity = $identityJson | ConvertFrom-Json
} catch {
  Write-WarnExit "AWS CLI unavailable or credentials invalid: $($_.Exception.Message)"
}

Write-Info "Credentials verified for account $($identity.Account) (ARN: $($identity.Arn))"
Write-Info "Metric namespace: $Namespace"
Write-Info "Region: $Region"

@{
  region    = $Region
  namespace = $Namespace
  account   = $identity.Account
  arn       = $identity.Arn
} | ConvertTo-Json -Compress
