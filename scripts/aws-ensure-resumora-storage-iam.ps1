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

  Proof outputs (windows-heal/reports/):
    - effective-policy-report.json
    - aws-cli-validation-proof.json
    - bucket-access-validation.json
#>
param(
  [string]$UserName = "bossmind-resumora-storage",
  [string]$BucketName = "bossmind-resumora-uploads-377426330385",
  [string]$AccountId = "377426330385",
  [string]$Region = "us-east-1",
  [string]$AdminProfile = "bossmind-admin",
  [string]$StorageProfile = "default",
  [string]$PolicyName = "ResumoraStorageS3Access-377426330385",
  [string]$InlinePolicyName = "ResumoraStorageS3Inline",
  [string]$AdminAccessKeyId = $env:BOSSMIND_AWS_ADMIN_ACCESS_KEY_ID,
  [string]$AdminSecretAccessKey = $env:BOSSMIND_AWS_ADMIN_SECRET_ACCESS_KEY,
  [int]$PropagationWaitSeconds = 15,
  [int]$MaxValidationAttempts = 8,
  [switch]$SkipInlinePolicy,
  [switch]$SkipS3FullAccessAttach,
  [switch]$ForceRecreateStorageUser
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$ReportDir = Join-Path $RepoRoot "windows-heal\reports"
$PolicyFile = Join-Path $RepoRoot "config\iam\resumora-storage-s3-policy.json"
$AdminEnvFile = Join-Path $RepoRoot ".bossmind\aws-admin.env"
$DriftManifest = Join-Path $RepoRoot "config\iam\resumora-storage-iam-manifest.json"

$EffectivePolicyReportFile = Join-Path $ReportDir "effective-policy-report.json"
$CliProofFile = Join-Path $ReportDir "aws-cli-validation-proof.json"
$BucketValidationFile = Join-Path $ReportDir "bucket-access-validation.json"

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
    Remove-Item Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
    & aws @AwsArgs 2>&1
    return
  }
  Remove-Item Env:AWS_ACCESS_KEY_ID -ErrorAction SilentlyContinue
  Remove-Item Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
  & aws --profile $AdminProfile @AwsArgs 2>&1
}

function Invoke-AwsStorage {
  param([string[]]$AwsArgs)
  $env:AWS_DEFAULT_REGION = $Region
  $env:AWS_REGION = $Region
  Remove-Item Env:AWS_ACCESS_KEY_ID -ErrorAction SilentlyContinue
  Remove-Item Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  try {
    $out = & aws --profile $StorageProfile @AwsArgs 2>&1
    return @{
      exitCode = $LASTEXITCODE
      output = (($out | ForEach-Object { "$_" }) -join "`n").Trim()
    }
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Invoke-AwsRaw {
  param([scriptblock]$Block)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { & $Block } finally { $ErrorActionPreference = $prev }
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

function Get-StorageCallerIdentity {
  $r = Invoke-AwsStorage @("sts", "get-caller-identity", "--output", "json")
  if ($r.exitCode -ne 0) { throw "Storage STS get-caller-identity failed: $($r.output)" }
  return ($r.output | ConvertFrom-Json)
}

function Test-StorageS3Access {
  $listAll = Invoke-AwsStorage @("s3", "ls")
  $listAllOk = ($listAll.exitCode -eq 0) -and ($listAll.output -notmatch "AccessDenied|not authorized|error occurred")

  $listBucket = Invoke-AwsStorage @("s3", "ls", "s3://$BucketName")
  $listBucketOk = ($listBucket.exitCode -eq 0) -and ($listBucket.output -notmatch "AccessDenied|not authorized|error occurred")

  $errors = @()
  if (-not $listAllOk) { $errors += "aws s3 ls -> $($listAll.output)" }
  if (-not $listBucketOk) { $errors += "aws s3 ls s3://$BucketName -> $($listBucket.output)" }

  return @{
    ok = ($errors.Count -eq 0)
    listAll = @{ exitCode = $listAll.exitCode; output = $listAll.output }
    listBucket = @{ exitCode = $listBucket.exitCode; output = $listBucket.output }
    errors = $errors
  }
}

function Test-BucketObjectAccess {
  $probeKey = "iam-validation-probe-$(Get-Date -Format 'yyyyMMddHHmmss').txt"
  $probeUri = "s3://$BucketName/$probeKey"
  $probePath = Join-Path $env:TEMP "resumora-iam-probe.txt"
  if (-not (Test-Path $probePath)) {
    "resumora-iam-probe" | Set-Content -Path $probePath -Encoding ascii -NoNewline
  }
  $put = Invoke-AwsStorage @("s3api", "put-object", "--bucket", $BucketName, "--key", $probeKey, "--body", $probePath)
  $putOk = ($put.exitCode -eq 0)
  $putOut = $put.output

  $head = Invoke-AwsStorage @("s3api", "head-object", "--bucket", $BucketName, "--key", $probeKey)
  $headOk = ($head.exitCode -eq 0)
  $headOut = $head.output

  $del = Invoke-AwsStorage @("s3api", "delete-object", "--bucket", $BucketName, "--key", $probeKey)
  $delOk = ($del.exitCode -eq 0)
  $delOut = $del.output

  return @{
    probeKey = $probeKey
    putObject = @{ ok = $putOk; output = $putOut }
    headObject = @{ ok = $headOk; output = $headOut }
    deleteObject = @{ ok = $delOk; output = $delOut }
    ok = ($putOk -and $headOk -and $delOk)
  }
}

function Write-ProofBundle {
  param(
    $EffectivePolicy,
    $CliValidation,
    $BucketValidation,
    [bool]$Success
  )
  $ts = (Get-Date).ToUniversalTime().ToString("o")

  $effective = @{
    timestamp = $ts
    success = $Success
    accountId = $AccountId
    userName = $UserName
    bucketName = $BucketName
    layers = $EffectivePolicy
  }
  $effective | ConvertTo-Json -Depth 12 | Set-Content -Path $EffectivePolicyReportFile -Encoding UTF8

  $cli = @{
    timestamp = $ts
    success = $CliValidation.ok
    accountId = $AccountId
    storageProfile = $StorageProfile
    commands = @(
      @{ command = "aws sts get-caller-identity"; result = $EffectivePolicy.storageCallerIdentity }
      @{ command = "aws s3 ls"; result = $CliValidation.listAll }
      @{ command = "aws s3 ls s3://$BucketName"; result = $CliValidation.listBucket }
    )
    errors = $CliValidation.errors
  }
  $cli | ConvertTo-Json -Depth 10 | Set-Content -Path $CliProofFile -Encoding UTF8

  $bucket = @{
    timestamp = $ts
    success = $BucketValidation.ok
    bucketName = $BucketName
    headBucket = $BucketValidation.headBucket
    objectCrud = $BucketValidation.objectCrud
  }
  $bucket | ConvertTo-Json -Depth 10 | Set-Content -Path $BucketValidationFile -Encoding UTF8

  Write-Log "Proof: $EffectivePolicyReportFile"
  Write-Log "Proof: $CliProofFile"
  Write-Log "Proof: $BucketValidationFile"
}

function Get-OrganizationsContext {
  $ctx = @{ checked = $true }
  try {
    $org = Invoke-AwsAdmin @("organizations", "describe-organization", "--output", "json") | ConvertFrom-Json
    $ctx.organization = $org.Organization
  } catch {
    $ctx.organizationError = ($_.Exception.Message | Out-String).Trim()
  }
  try {
    $roots = Invoke-AwsAdmin @("organizations", "list-roots", "--output", "json") | ConvertFrom-Json
    $ctx.roots = $roots.Roots
  } catch {
    $ctx.rootsError = ($_.Exception.Message | Out-String).Trim()
  }
  return $ctx
}

function Get-EffectivePolicyLayers {
  param($AdminId)
  $layers = @{
    adminArn = $AdminId.Arn
    identityBased = @{
      userDirectManaged = @()
      userDirectInline = @()
      groupManaged = @()
      groupInline = @()
    }
    permissionsBoundary = $null
    sessionPolicy = "none (long-term IAM user access key)"
    serviceControlPolicies = $null
    resourceBased = @{ bucketPolicy = $null; bucketAcl = $null }
    simulation = @()
    storageCallerIdentity = (Get-StorageCallerIdentity)
  }

  try {
    $attached = Invoke-AwsAdmin @("iam", "list-attached-user-policies", "--user-name", $UserName, "--output", "json") | ConvertFrom-Json
    $layers.identityBased.userDirectManaged = $attached.AttachedPolicies
  } catch { $layers.identityBased.userDirectManagedError = ($_.Exception.Message | Out-String).Trim() }

  try {
    $inline = Invoke-AwsAdmin @("iam", "list-user-policies", "--user-name", $UserName, "--output", "json") | ConvertFrom-Json
    $layers.identityBased.userDirectInline = $inline.PolicyNames
    $layers.identityBased.userDirectInlineDocuments = @()
    foreach ($name in $inline.PolicyNames) {
      $doc = Invoke-AwsAdmin @("iam", "get-user-policy", "--user-name", $UserName, "--policy-name", $name, "--output", "json") | ConvertFrom-Json
      $layers.identityBased.userDirectInlineDocuments += @{ PolicyName = $name; Document = $doc.PolicyDocument }
    }
  } catch { $layers.identityBased.userDirectInlineError = ($_.Exception.Message | Out-String).Trim() }

  try {
    $groups = Invoke-AwsAdmin @("iam", "list-groups-for-user", "--user-name", $UserName, "--output", "json") | ConvertFrom-Json
    foreach ($g in $groups.Groups) {
      $gAttached = Invoke-AwsAdmin @("iam", "list-attached-group-policies", "--group-name", $g.GroupName, "--output", "json") | ConvertFrom-Json
      $gInline = Invoke-AwsAdmin @("iam", "list-group-policies", "--group-name", $g.GroupName, "--output", "json") | ConvertFrom-Json
      $layers.identityBased.groupManaged += @{
        groupName = $g.GroupName
        attachedPolicies = $gAttached.AttachedPolicies
        inlinePolicyNames = $gInline.PolicyNames
      }
    }
  } catch { $layers.identityBased.groupsError = ($_.Exception.Message | Out-String).Trim() }

  try {
    $user = Invoke-AwsAdmin @("iam", "get-user", "--user-name", $UserName, "--output", "json") | ConvertFrom-Json
    $layers.permissionsBoundary = $user.User.PermissionsBoundary
  } catch { $layers.permissionsBoundaryError = ($_.Exception.Message | Out-String).Trim() }

  $layers.organizations = Get-OrganizationsContext

  try {
    $bp = Invoke-AwsAdmin @("s3api", "get-bucket-policy", "--bucket", $BucketName, "--output", "json") | ConvertFrom-Json
    $layers.resourceBased.bucketPolicy = $bp.Policy
  } catch { $layers.resourceBased.bucketPolicyError = ($_.Exception.Message | Out-String).Trim() }

  $actions = @("s3:ListAllMyBuckets", "s3:ListBucket", "s3:PutObject", "s3:GetObject")
  foreach ($action in $actions) {
    $resourceArn = if ($action -eq "s3:ListAllMyBuckets") { "*" } elseif ($action -eq "s3:ListBucket") { "arn:aws:s3:::$BucketName" } else { "arn:aws:s3:::$BucketName/*" }
    try {
      $sim = Invoke-AwsAdmin @(
        "iam", "simulate-principal-policy",
        "--policy-source-arn", "arn:aws:iam::${AccountId}:user/$UserName",
        "--action-names", $action,
        "--resource-arns", $resourceArn,
        "--output", "json"
      ) | ConvertFrom-Json
      $layers.simulation += @{
        action = $action
        resourceArn = $resourceArn
        results = $sim.EvaluationResults
      }
    } catch {
      $layers.simulation += @{ action = $action; error = ($_.Exception.Message | Out-String).Trim() }
    }
  }

  return $layers
}

function Remove-PermissionsBoundaryIfPresent {
  param($Report)
  try {
    $user = Invoke-AwsAdmin @("iam", "get-user", "--user-name", $UserName, "--output", "json") | ConvertFrom-Json
    if ($user.User.PermissionsBoundary) {
      Write-Log "Removing permissions boundary (common cause of console attach with zero effective access) ..."
      Invoke-AwsAdmin @("iam", "delete-user-permissions-boundary", "--user-name", $UserName) | Out-Null
      $Report.fixesApplied += "delete-permissions-boundary"
    }
  } catch {
    Write-Log "Permissions boundary check: $($_.Exception.Message)"
  }
}

function Ensure-InlinePolicy {
  param($Report)
  if ($SkipInlinePolicy) { return }
  $policyDoc = (Get-Content $PolicyFile -Raw) -replace "bossmind-resumora-uploads-377426330385", $BucketName
  $inline = Invoke-AwsAdmin @("iam", "list-user-policies", "--user-name", $UserName, "--output", "json") | ConvertFrom-Json
  if ($inline.PolicyNames -notcontains $InlinePolicyName) {
    Write-Log "Putting inline policy $InlinePolicyName ..."
    Invoke-AwsAdmin @(
      "iam", "put-user-policy",
      "--user-name", $UserName,
      "--policy-name", $InlinePolicyName,
      "--policy-document", $policyDoc
    ) | Out-Null
    $Report.fixesApplied += "put-inline-policy"
  } else {
    Write-Log "Updating inline policy $InlinePolicyName ..."
    Invoke-AwsAdmin @(
      "iam", "put-user-policy",
      "--user-name", $UserName,
      "--policy-name", $InlinePolicyName,
      "--policy-document", $policyDoc
    ) | Out-Null
    $Report.fixesApplied += "update-inline-policy"
  }
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

  if ($exists) {
    try {
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
    $verify = Invoke-AwsAdmin @("iam", "list-attached-user-policies", "--user-name", $UserName, "--output", "json") | ConvertFrom-Json
    $ok = $verify.AttachedPolicies | Where-Object { $_.PolicyArn -eq $policyArn }
    if (-not $ok) { throw "Silent attach failure: $PolicyName not listed after attach-user-policy." }
    $Report.fixesApplied += "verify-custom-policy-attached"
  }

  if (-not $SkipS3FullAccessAttach -and -not $hasS3Full) {
    Write-Log "Attaching AmazonS3FullAccess (managed) ..."
    Invoke-AwsAdmin @(
      "iam", "attach-user-policy",
      "--user-name", $UserName,
      "--policy-arn", "arn:aws:iam::aws:policy/AmazonS3FullAccess"
    ) | Out-Null
    $Report.fixesApplied += "attach-amazon-s3-full-access"
    $verify = Invoke-AwsAdmin @("iam", "list-attached-user-policies", "--user-name", $UserName, "--output", "json") | ConvertFrom-Json
    $ok = $verify.AttachedPolicies | Where-Object { $_.PolicyArn -eq "arn:aws:iam::aws:policy/AmazonS3FullAccess" }
    if (-not $ok) { throw "Silent attach failure: AmazonS3FullAccess not listed after attach-user-policy." }
    $Report.fixesApplied += "verify-s3-full-access-attached"
  }

  return $policyArn
}

function Ensure-BucketPolicyForStorageUser {
  param($Report)
  $principal = "arn:aws:iam::${AccountId}:user/$UserName"
  $statement = @{
    Sid = "ResumoraStoragePrincipalBucketAccess"
    Effect = "Allow"
    Principal = @{ AWS = $principal }
    Action = @(
      "s3:ListBucket", "s3:GetBucketLocation", "s3:GetBucketVersioning",
      "s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload",
      "s3:ListMultipartUploadParts", "s3:GetObjectAttributes"
    )
    Resource = @(
      "arn:aws:s3:::$BucketName",
      "arn:aws:s3:::$BucketName/*"
    )
  }
  $policyDoc = @{
    Version = "2012-10-17"
    Statement = @($statement)
  }
  $json = $policyDoc | ConvertTo-Json -Depth 8 -Compress
  try {
    $existing = Invoke-AwsAdmin @("s3api", "get-bucket-policy", "--bucket", $BucketName, "--output", "json") | ConvertFrom-Json
    $parsed = $existing.Policy | ConvertFrom-Json
    $has = $false
    foreach ($s in $parsed.Statement) {
      if ($s.Principal.AWS -eq $principal -or ($s.Principal.AWS -is [array] -and $principal -in $s.Principal.AWS)) {
        $has = $true
        break
      }
    }
    if ($has) {
      Write-Log "Bucket policy already grants storage user."
      return
    }
    if ($parsed.Statement -isnot [array]) { $parsed.Statement = @($parsed.Statement) }
    $parsed.Statement += $statement
    $json = ($parsed | ConvertTo-Json -Depth 8 -Compress)
  } catch {
    Write-Log "Applying new bucket policy for storage principal ..."
  }
  Invoke-AwsAdmin @("s3api", "put-bucket-policy", "--bucket", $BucketName, "--policy", $json) | Out-Null
  $Report.fixesApplied += "put-bucket-policy"
}

function Remove-AllAccessKeysForUser {
  param([string]$Name)
  $keys = Invoke-AwsAdmin @("iam", "list-access-keys", "--user-name", $Name, "--output", "json") | ConvertFrom-Json
  foreach ($k in $keys.AccessKeyMetadata) {
    Invoke-AwsAdmin @("iam", "delete-access-key", "--user-name", $Name, "--access-key-id", $k.AccessKeyId) | Out-Null
  }
}

function New-StorageAccessKey {
  $created = Invoke-AwsAdmin @("iam", "create-access-key", "--user-name", $UserName, "--output", "json") | ConvertFrom-Json
  return $created.AccessKey
}

function Update-StorageCredentialsFile {
  param($AccessKey)
  $credPath = Join-Path $env:USERPROFILE ".aws\credentials"
  $id = $AccessKey.AccessKeyId
  $secret = $AccessKey.SecretAccessKey
  $block = @"
[$StorageProfile]
aws_access_key_id = $id
aws_secret_access_key = $secret
"@
  if (Test-Path $credPath) {
    $raw = Get-Content $credPath -Raw
    $pattern = "(?ms)\[$([regex]::Escape($StorageProfile))\][^\[]*"
    if ($raw -match $pattern) {
      $raw = $raw -replace $pattern, $block.TrimEnd() + "`r`n`r`n"
    } else {
      $raw = $raw.TrimEnd() + "`r`n`r`n" + $block
    }
    Set-Content -Path $credPath -Value $raw.TrimEnd() -Encoding UTF8
  } else {
    Set-Content -Path $credPath -Value $block -Encoding UTF8
  }
  Write-Log "Updated AWS CLI profile [$StorageProfile] with rotated storage access key."
}

function Invoke-PostValidateEnvSync {
  Write-Log "Syncing S3 env to local files and Render (if API configured) ..."
  $nodeScript = Join-Path $RepoRoot "scripts\bossmind-aws-storage-env-sync.mjs"
  & node $nodeScript 2>&1 | ForEach-Object { Write-Host $_ }
  if ($LASTEXITCODE -ne 0) { Write-Log "Env sync completed with warnings (exit $LASTEXITCODE)." }
}

function Recreate-StorageUser {
  param($Report)
  Write-Log "Recreating storage IAM user (clean) ..."
  try {
    Remove-AllAccessKeysForUser -Name $UserName
  } catch { }
  try {
    $attached = Invoke-AwsAdmin @("iam", "list-attached-user-policies", "--user-name", $UserName, "--output", "json") | ConvertFrom-Json
    foreach ($p in $attached.AttachedPolicies) {
      Invoke-AwsAdmin @("iam", "detach-user-policy", "--user-name", $UserName, "--policy-arn", $p.PolicyArn) | Out-Null
    }
  } catch { }
  try {
    $inline = Invoke-AwsAdmin @("iam", "list-user-policies", "--user-name", $UserName, "--output", "json") | ConvertFrom-Json
    foreach ($n in $inline.PolicyNames) {
      Invoke-AwsAdmin @("iam", "delete-user-policy", "--user-name", $UserName, "--policy-name", $n) | Out-Null
    }
  } catch { }
  try {
    Invoke-AwsAdmin @("iam", "delete-user-permissions-boundary", "--user-name", $UserName) | Out-Null
  } catch { }
  try {
    Invoke-AwsAdmin @("iam", "delete-user", "--user-name", $UserName) | Out-Null
    $Report.fixesApplied += "delete-old-storage-user"
  } catch {
    Write-Log "Could not delete user (may not exist): $($_.Exception.Message)"
  }
  Invoke-AwsAdmin @("iam", "create-user", "--user-name", $UserName, "--output", "json") | Out-Null
  $Report.fixesApplied += "create-storage-user"
  Ensure-PolicyAndAttachment -Report $Report | Out-Null
  Ensure-InlinePolicy -Report $Report
  Ensure-BucketPolicyForStorageUser -Report $Report
  $key = New-StorageAccessKey
  Update-StorageCredentialsFile -AccessKey $key
  $Report.fixesApplied += "rotate-access-key"
}

function Repair-StorageIam {
  param($Report)
  Remove-PermissionsBoundaryIfPresent -Report $Report
  Ensure-PolicyAndAttachment -Report $Report | Out-Null
  Ensure-InlinePolicy -Report $Report
  Ensure-BucketPolicyForStorageUser -Report $Report
  if ($ForceRecreateStorageUser) {
    Recreate-StorageUser -Report $Report
  }
}

function Write-IamDriftManifest {
  param($AttachedPolicies, $Boundary, [bool]$CliOk)
  $manifest = @{
    version = 1
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    accountId = $AccountId
    userName = $UserName
    bucketName = $BucketName
    requiredManagedPolicyArns = @(
      "arn:aws:iam::${AccountId}:policy/$PolicyName",
      "arn:aws:iam::aws:policy/AmazonS3FullAccess"
    )
    requiredInlinePolicyName = $InlinePolicyName
    attachedManagedPolicyArns = @($AttachedPolicies | ForEach-Object { $_.PolicyArn })
    permissionsBoundary = $Boundary
    cliValidationOk = $CliOk
    validateCommand = "npm run bossmind:aws:validate-storage"
    fixCommand = "powershell -ExecutionPolicy Bypass -File scripts/aws-ensure-resumora-storage-iam.ps1"
  }
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -Path $DriftManifest -Encoding UTF8
  Write-Log "IAM drift manifest: $DriftManifest"
}

function Run-StorageOnlyAudit {
  Write-Log "No admin credentials - running storage-side audit and CLI proof only."
  $caller = Get-StorageCallerIdentity
  $cli = Test-StorageS3Access
  $head = Invoke-AwsStorage @("s3api", "head-bucket", "--bucket", $BucketName)
  $headOk = ($head.exitCode -eq 0)
  $headRaw = $head.output
  $obj = @{ ok = $false; skippedReason = "listBucket denied" }
  if ($cli.listBucket.exitCode -eq 0) { $obj = Test-BucketObjectAccess }

  $layers = @{
    adminCredentialsPresent = $false
    storageCallerIdentity = $caller
    note = "IAM user layer requires admin credentials. CLI errors indicate zero effective identity-based S3 allows."
    likelyRootCauses = @(
      "Permissions boundary caps user despite console showing AmazonS3FullAccess",
      "Policy attached to wrong IAM user or different AWS account",
      "Policy attached to a group the user is not a member of",
      "Managed policy attach did not persist (console error overlooked)"
    )
  }

  $bucketVal = @{
    ok = ($headOk -and $obj.ok -and $cli.ok)
    headBucket = @{ ok = $headOk; output = ($headRaw | Out-String).Trim() }
    objectCrud = $obj
  }

  Write-ProofBundle -EffectivePolicy $layers -CliValidation $cli -BucketValidation $bucketVal -Success $false
  return $false
}

# --- Main ---
Write-Log "Resumora IAM storage fix - user=$UserName bucket=$BucketName"

if (-not (Load-AdminCredentials)) {
  $ok = Run-StorageOnlyAudit
  Write-Host ""
  Write-Host "BLOCKED: ADMIN AWS credentials required to modify IAM." -ForegroundColor Red
  Write-Host "1) Copy .bossmind/aws-admin.env.example to .bossmind/aws-admin.env (root or IAM admin keys)"
  Write-Host "2) OR add profile [$AdminProfile] in $env:USERPROFILE\.aws\credentials"
  Write-Host "3) Re-run: scripts/aws-ensure-resumora-storage-iam.ps1"
  Write-Host ""
  exit 2
}

$adminId = Invoke-AwsAdmin @("sts", "get-caller-identity", "--output", "json") | ConvertFrom-Json
if (-not $adminId.Arn) { throw "Admin identity check failed." }
Write-Log "Admin identity: $($adminId.Arn)"

$report = @{ fixesApplied = @() }
$preLayers = Get-EffectivePolicyLayers -AdminId $adminId
$preLayers | ConvertTo-Json -Depth 12 | Set-Content -Path (Join-Path $ReportDir "aws-iam-audit-pre-fix.json") -Encoding UTF8

Repair-StorageIam -Report $report

$postLayers = Get-EffectivePolicyLayers -AdminId $adminId
Write-Log "Waiting ${PropagationWaitSeconds}s for IAM propagation ..."
Start-Sleep -Seconds $PropagationWaitSeconds

$cli = $null
for ($i = 1; $i -le $MaxValidationAttempts; $i++) {
  Write-Log "CLI validation $i/$MaxValidationAttempts (profile $StorageProfile) ..."
  $cli = Test-StorageS3Access
  if ($cli.ok) { break }
  Start-Sleep -Seconds ([Math]::Min(12, $PropagationWaitSeconds))
}

if (-not $cli.ok -and -not $ForceRecreateStorageUser) {
  Write-Log "IAM attach did not yield CLI access - recreating storage user ..."
  Recreate-StorageUser -Report $report
  Start-Sleep -Seconds $PropagationWaitSeconds
  for ($i = 1; $i -le $MaxValidationAttempts; $i++) {
    Write-Log "Post-recreate CLI validation $i/$MaxValidationAttempts ..."
    $cli = Test-StorageS3Access
    if ($cli.ok) { break }
    Start-Sleep -Seconds ([Math]::Min(12, $PropagationWaitSeconds))
  }
  $postLayers = Get-EffectivePolicyLayers -AdminId $adminId
}

$head = Invoke-AwsStorage @("s3api", "head-bucket", "--bucket", $BucketName)
$headOk = ($head.exitCode -eq 0)
$obj = if ($cli.ok) { Test-BucketObjectAccess } else { @{ ok = $false; skippedReason = "cli list commands failed" } }
$bucketVal = @{
  ok = ($cli.ok -and $headOk -and $obj.ok)
  headBucket = @{ ok = $headOk; output = $head.output }
  objectCrud = $obj
}

$attachedPost = $postLayers.identityBased.userDirectManaged
Write-ProofBundle -EffectivePolicy $postLayers -CliValidation $cli -BucketValidation $bucketVal -Success $cli.ok
Write-IamDriftManifest -AttachedPolicies $attachedPost -Boundary $postLayers.permissionsBoundary -CliOk $cli.ok

$postLayers.fixesApplied = $report.fixesApplied
$postLayers | ConvertTo-Json -Depth 12 | Set-Content -Path (Join-Path $ReportDir "aws-iam-audit-post-fix.json") -Encoding UTF8

if (-not $cli.ok) {
  Write-Error "S3 CLI validation failed after IAM fixes. See $CliProofFile"
  exit 1
}

Write-Log "SUCCESS - aws s3 ls and aws s3 ls s3://$BucketName passed."
Invoke-PostValidateEnvSync
exit 0
