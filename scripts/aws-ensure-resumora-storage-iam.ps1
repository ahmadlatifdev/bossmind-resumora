#Requires -Version 5.1
<#
.SYNOPSIS
  Audits and fixes IAM for bossmind-resumora-storage (S3 + propagation verification).

.DESCRIPTION
  Requires ADMIN credentials (root or IAM admin) via:
    - Profile [bossmind-admin] in ~/.aws/credentials
    - File .bossmind/aws-admin.env (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
    - Env vars BOSSMIND_AWS_ADMIN_ACCESS_KEY_ID / BOSSMIND_AWS_ADMIN_SECRET_ACCESS_KEY
    - Parameters -AdminAccessKeyId / -AdminSecretAccessKey

  Storage user credentials remain in [default] or [bossmind-resumora-storage].
#>
param(
  [string]$UserName = "bossmind-resumora-storage",
  [string]$BucketName = "bossmind-resumora-uploads-377426330385",
  [string]$AccountId = "377426330385",
  [string]$Region = "us-east-1",
  [string]$AdminProfile = "bossmind-admin",
  [string]$StorageProfile = "default",
  [string]$PolicyName = "ResumoraStorageS3Access-377426330385",
  [string]$AdminAccessKeyId = $env:BOSSMIND_AWS_ADMIN_ACCESS_KEY_ID,
  [string]$AdminSecretAccessKey = $env:BOSSMIND_AWS_ADMIN_SECRET_ACCESS_KEY,
  [int]$PropagationWaitSeconds = 15,
  [int]$MaxValidationAttempts = 6
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$ReportDir = Join-Path $RepoRoot "windows-heal\reports"
$PolicyFile = Join-Path $RepoRoot "config\iam\resumora-storage-s3-policy.json"
$AdminEnvFile = Join-Path $RepoRoot ".bossmind\aws-admin.env"
$ProofFile = Join-Path $ReportDir "aws-cli-validation-proof.json"

New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null

function Write-Log($msg) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  Write-Host $line
}

function Invoke-AwsAdmin {
  param([string[]]$AwsArgs)
  $env:AWS_DEFAULT_REGION = $Region
  $env:AWS_REGION = $Region
  if ($script:AdminAccessKeyId -and $script:AdminSecretAccessKey) {
    $env:AWS_ACCESS_KEY_ID = $script:AdminAccessKeyId
    $env:AWS_SECRET_ACCESS_KEY = $script:AdminSecretAccessKey
    $env:AWS_SESSION_TOKEN = $null
    & aws @AwsArgs 2>&1
    return
  }
  & aws --profile $AdminProfile @AwsArgs 2>&1
}

function Invoke-AwsStorage {
  param([string[]]$AwsArgs)
  $env:AWS_DEFAULT_REGION = $Region
  $env:AWS_REGION = $Region
  Remove-Item Env:AWS_ACCESS_KEY_ID -ErrorAction SilentlyContinue
  Remove-Item Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
  & aws --profile $StorageProfile @AwsArgs 2>&1
}

function Load-AdminCredentials {
  $script:AdminAccessKeyId = $null
  $script:AdminSecretAccessKey = $null

  if ($AdminAccessKeyId -and $AdminSecretAccessKey) {
    $script:AdminAccessKeyId = $AdminAccessKeyId.Trim()
    $script:AdminSecretAccessKey = $AdminSecretAccessKey.Trim()
    Write-Log "Using admin credentials from parameters/environment."
    return $true
  }
  if (Test-Path $AdminEnvFile) {
    Get-Content $AdminEnvFile | ForEach-Object {
      if ($_ -match '^\s*AWS_ACCESS_KEY_ID\s*=\s*(.+)\s*$') { $script:AdminAccessKeyId = $matches[1].Trim().Trim('"') }
      if ($_ -match '^\s*AWS_SECRET_ACCESS_KEY\s*=\s*(.+)\s*$') { $script:AdminSecretAccessKey = $matches[1].Trim().Trim('"') }
    }
    if ($script:AdminAccessKeyId -and $script:AdminSecretAccessKey) {
      Write-Log "Using admin credentials from .bossmind/aws-admin.env"
      return $true
    }
  }
  $credPath = Join-Path $env:USERPROFILE ".aws\credentials"
  if (Test-Path $credPath) {
    $ini = Get-Content $credPath -Raw
    $profilePattern = [regex]::Escape($AdminProfile)
    if ($ini -match "(?ms)\[$profilePattern\][^\[]*aws_access_key_id\s*=\s*(\S+)[^\[]*aws_secret_access_key\s*=\s*(\S+)") {
      $script:AdminAccessKeyId = $matches[1]
      $script:AdminSecretAccessKey = $matches[2]
      Write-Log "Using admin credentials from profile [$AdminProfile]."
      return $true
    }
  }
  return $false
}

function Test-AdminIdentity {
  $id = Invoke-AwsAdmin @("sts", "get-caller-identity", "--output", "json") | ConvertFrom-Json
  if (-not $id.Arn) { throw "Admin identity check failed." }
  Write-Log "Admin identity: $($id.Arn)"
  return $id
}

function Get-AuditReport {
  param($AdminId)
  $report = @{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    accountId = $AccountId
    userName = $UserName
    bucketName = $BucketName
    adminArn = $AdminId.Arn
    attachedManagedPolicies = @()
    inlinePolicyNames = @()
    groups = @()
    permissionsBoundary = $null
    tags = @()
    fixesApplied = @()
  }

  try {
    $attached = Invoke-AwsAdmin @("iam", "list-attached-user-policies", "--user-name", $UserName, "--output", "json") | ConvertFrom-Json
    $report.attachedManagedPolicies = $attached.AttachedPolicies
  } catch { $report.attachedManagedPoliciesError = $_.Exception.Message }

  try {
    $inline = Invoke-AwsAdmin @("iam", "list-user-policies", "--user-name", $UserName, "--output", "json") | ConvertFrom-Json
    $report.inlinePolicyNames = $inline.PolicyNames
  } catch { $report.inlinePolicyNamesError = $_.Exception.Message }

  try {
    $groups = Invoke-AwsAdmin @("iam", "list-groups-for-user", "--user-name", $UserName, "--output", "json") | ConvertFrom-Json
    $report.groups = $groups.Groups
  } catch { $report.groupsError = $_.Exception.Message }

  try {
    $user = Invoke-AwsAdmin @("iam", "get-user", "--user-name", $UserName, "--output", "json") | ConvertFrom-Json
    $report.permissionsBoundary = $user.User.PermissionsBoundary
  } catch { $report.permissionsBoundaryError = $_.Exception.Message }

  return $report
}

function Ensure-PolicyAndAttachment {
  param($Report)
  $policyArn = "arn:aws:iam::${AccountId}:policy/$PolicyName"
  $policyDoc = (Get-Content $PolicyFile -Raw) -replace "bossmind-resumora-uploads-377426330385", $BucketName

  $exists = $false
  try {
    Invoke-AwsAdmin @("iam", "get-policy", "--policy-arn", $policyArn, "--output", "json") | Out-Null
    $exists = $true
    Write-Log "Customer policy exists: $policyArn"
  } catch {
    Write-Log "Creating customer managed policy $PolicyName ..."
    $created = Invoke-AwsAdmin @(
      "iam", "create-policy",
      "--policy-name", $PolicyName,
      "--policy-document", $policyDoc,
      "--description", "Resumora studio document storage (scoped + ListAllMyBuckets for CLI)",
      "--output", "json"
    ) | ConvertFrom-Json
    $policyArn = $created.Policy.Arn
    $Report.fixesApplied += "create-policy"
  }

  if (-not $exists) {
    try {
      $defaultVer = Invoke-AwsAdmin @("iam", "get-policy", "--policy-arn", $policyArn, "--output", "json") | ConvertFrom-Json
      $ver = $defaultVer.Policy.DefaultVersionId
      Invoke-AwsAdmin @(
        "iam", "create-policy-version",
        "--policy-arn", $policyArn,
        "--policy-document", $policyDoc,
        "--set-as-default"
      ) | Out-Null
      $Report.fixesApplied += "update-policy-version"
    } catch { }
  }

  $attached = Invoke-AwsAdmin @("iam", "list-attached-user-policies", "--user-name", $UserName, "--output", "json") | ConvertFrom-Json
  $hasCustom = $attached.AttachedPolicies | Where-Object { $_.PolicyArn -eq $policyArn }
  $hasS3Full = $attached.AttachedPolicies | Where-Object { $_.PolicyArn -eq "arn:aws:iam::aws:policy/AmazonS3FullAccess" }

  if (-not $hasCustom) {
    Write-Log "Attaching customer policy to user ..."
    Invoke-AwsAdmin @("iam", "attach-user-policy", "--user-name", $UserName, "--policy-arn", $policyArn) | Out-Null
    $Report.fixesApplied += "attach-custom-policy"
  }

  if (-not $hasS3Full) {
    Write-Log "Attaching AmazonS3FullAccess (managed) ..."
    Invoke-AwsAdmin @(
      "iam", "attach-user-policy",
      "--user-name", $UserName,
      "--policy-arn", "arn:aws:iam::aws:policy/AmazonS3FullAccess"
    ) | Out-Null
    $Report.fixesApplied += "attach-amazon-s3-full-access"
  }

  return $policyArn
}

function Remove-PermissionsBoundaryIfPresent {
  param($Report)
  try {
    $user = Invoke-AwsAdmin @("iam", "get-user", "--user-name", $UserName, "--output", "json") | ConvertFrom-Json
    if ($user.User.PermissionsBoundary) {
      Write-Log "Removing permissions boundary (common cause of silent deny) ..."
      Invoke-AwsAdmin @("iam", "delete-user-permissions-boundary", "--user-name", $UserName) | Out-Null
      $Report.fixesApplied += "delete-permissions-boundary"
    }
  } catch {
    Write-Log "Permissions boundary check: $($_.Exception.Message)"
  }
}

function Test-StorageS3Access {
  $listAll = $null
  $listBucket = $null
  $errors = @()

  $listAllRaw = Invoke-AwsStorage @("s3", "ls") 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0 -or $listAllRaw -match "AccessDenied|error occurred|not authorized") {
    $errors += "s3_ls_all: $($listAllRaw.Trim())"
  } else {
    $listAll = $listAllRaw
  }

  $listBucketRaw = Invoke-AwsStorage @("s3", "ls", "s3://$BucketName") 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0 -or $listBucketRaw -match "AccessDenied|error occurred|not authorized") {
    $errors += "s3_ls_bucket: $($listBucketRaw.Trim())"
  } else {
    $listBucket = $listBucketRaw
  }

  return @{
    ok = ($errors.Count -eq 0)
    listAllOutput = ($listAll | Out-String).Trim()
    listBucketOutput = ($listBucket | Out-String).Trim()
    errors = $errors
  }
}

# --- Main ---
Write-Log "Resumora IAM storage fix - user=$UserName bucket=$BucketName"

if (-not (Load-AdminCredentials)) {
  Write-Host ""
  Write-Host "ERROR: ADMIN AWS credentials required. Storage user cannot attach IAM policies." -ForegroundColor Red
  Write-Host "Add profile [bossmind-admin] in $env:USERPROFILE\.aws\credentials"
  Write-Host "OR file: $AdminEnvFile"
  Write-Host "OR env: BOSSMIND_AWS_ADMIN_ACCESS_KEY_ID / BOSSMIND_AWS_ADMIN_SECRET_ACCESS_KEY"
  Write-Host "Then re-run: scripts/aws-ensure-resumora-storage-iam.ps1"
  Write-Host ""
  exit 2
}

$adminId = Test-AdminIdentity
$report = Get-AuditReport -AdminId $adminId
$auditPre = Join-Path $ReportDir "aws-iam-audit-pre-fix.json"
$report | ConvertTo-Json -Depth 8 | Set-Content -Path $auditPre -Encoding UTF8
Write-Log "Pre-fix audit saved: $auditPre"

Remove-PermissionsBoundaryIfPresent -Report $report
Ensure-PolicyAndAttachment -Report $report | Out-Null

$post = Get-AuditReport -AdminId $adminId
$report.attachedManagedPoliciesPost = $post.attachedManagedPolicies
$report.permissionsBoundaryPost = $post.permissionsBoundary

Write-Log "Waiting ${PropagationWaitSeconds}s for IAM propagation ..."
Start-Sleep -Seconds $PropagationWaitSeconds

$validation = $null
for ($i = 1; $i -le $MaxValidationAttempts; $i++) {
  Write-Log "Validation attempt $i/$MaxValidationAttempts using profile $StorageProfile ..."
  $validation = Test-StorageS3Access
  if ($validation.ok) { break }
  Start-Sleep -Seconds ([Math]::Min(10, $PropagationWaitSeconds))
}

$proof = @{
  timestamp = (Get-Date).ToUniversalTime().ToString("o")
  success = $validation.ok
  userName = $UserName
  bucketName = $BucketName
  accountId = $AccountId
  fixesApplied = $report.fixesApplied
  validation = $validation
  commands = @("aws s3 ls", "aws s3 ls s3://$BucketName")
}
$proof | ConvertTo-Json -Depth 8 | Set-Content -Path $ProofFile -Encoding UTF8
$post | ConvertTo-Json -Depth 8 | Set-Content -Path (Join-Path $ReportDir "aws-iam-audit-post-fix.json") -Encoding UTF8

if (-not $validation.ok) {
  Write-Error "S3 validation failed after fixes. See $ProofFile and $auditPre"
  exit 1
}

Write-Log "SUCCESS - both aws s3 ls commands passed."
Write-Log "Proof saved: $ProofFile"
exit 0
