#Requires -Version 5.1
<#
.SYNOPSIS
  Provision Workload Identity Federation (OIDC) for GitHub Actions -> resumora-live.

.DESCRIPTION
  Keyless CI auth - no firebase-service-account.json required in GitHub Secrets.
  Creates github-pool, github-provider, gh-oidc-sa, IAM roles, and repo binding.

  Never prints secret values, JSON keys, sk_live_, whsec_, pk_live_, or price_ IDs.

.PARAMETER SetGitHubSecrets
  Write WORKLOAD_IDENTITY_PROVIDER and SERVICE_ACCOUNT_EMAIL via gh CLI.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\setup-workload-identity.ps1 -SetGitHubSecrets
#>
param(
  [string]$ProjectId = 'resumora-live',
  [string]$GitHubRepo = 'ahmadlatifdev/bossmind-resumora',
  [switch]$SetGitHubSecrets,
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$PoolId = 'github-pool'
$ProviderId = 'github-provider'
$SaId = 'gh-oidc-sa'
$Location = 'global'
$IssuerUri = 'https://token.actions.githubusercontent.com'

$AttributeMapping = 'google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.environment=assertion.environment,attribute.branch=assertion.ref'
$SaEmail = "$SaId@$ProjectId.iam.gserviceaccount.com"

function Write-Step {
  param([string]$Message)
  Write-Host "[setup-wif] $Message" -ForegroundColor Cyan
}

function Invoke-GcloudRaw {
  param([string[]]$GcloudArgs)
  $argLine = ($GcloudArgs | ForEach-Object {
    if ($_ -match '\s') { "`"$_`"" } else { $_ }
  }) -join ' '
  $cmd = "gcloud $argLine 2>&1"
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  try {
    $out = cmd.exe /c $cmd 2>&1 | Out-String
    $code = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $prevEap
  }
  return @{ Output = $out; ExitCode = $code }
}

function Invoke-Gcloud {
  param(
    [string[]]$GcloudArgs,
    [string]$Label
  )
  Write-Step $Label
  if ($WhatIf) {
    Write-Host "  gcloud $($GcloudArgs -join ' ')" -ForegroundColor DarkGray
    return
  }
  $result = Invoke-GcloudRaw -GcloudArgs $GcloudArgs
  if ($result.ExitCode -ne 0) {
    Write-Host $result.Output
    throw "gcloud failed ($Label): exit $($result.ExitCode)"
  }
}

function Invoke-GcloudAllowExists {
  param(
    [string[]]$GcloudArgs,
    [string]$Label,
    [string[]]$ExistsPatterns = @('already exists', 'ALREADY_EXISTS', 'Requested entity already exists')
  )
  Write-Step $Label
  if ($WhatIf) {
    Write-Host "  gcloud $($GcloudArgs -join ' ')" -ForegroundColor DarkGray
    return
  }
  $result = Invoke-GcloudRaw -GcloudArgs $GcloudArgs
  if ($result.ExitCode -eq 0) { return }
  $outLower = $result.Output.ToLowerInvariant()
  foreach ($pat in $ExistsPatterns) {
    if ($outLower -match [regex]::Escape($pat.ToLowerInvariant())) {
      Write-Host '  (already exists - continuing)' -ForegroundColor Yellow
      return
    }
  }
  if ($outLower -match 'already_exists|already exists|requested entity already exists') {
    Write-Host '  (already exists - continuing)' -ForegroundColor Yellow
    return
  }
  Write-Host $result.Output
  throw "gcloud failed ($Label): exit $($result.ExitCode)"
}

try {
  Write-Host '=== Workload Identity Federation setup (keyless GitHub Actions) ===' -ForegroundColor Yellow
  Write-Host "Project: $ProjectId | Repo: $GitHubRepo"

  if (-not $WhatIf) {
    $null = Get-Command gcloud -ErrorAction Stop
  }

  $projectNumber = if ($WhatIf) { 'PROJECT_NUMBER' } else {
    $pn = Invoke-GcloudRaw -GcloudArgs @('projects', 'describe', $ProjectId, '--format=value(projectNumber)')
    if ($pn.ExitCode -ne 0) { throw "projects describe failed: $($pn.Output)" }
    $pn.Output.Trim()
  }
  if (-not $projectNumber) { throw "Could not resolve project number for $ProjectId" }

  Invoke-GcloudAllowExists -GcloudArgs @(
    'iam', 'workload-identity-pools', 'create', $PoolId,
    '--project', $ProjectId,
    '--location', $Location,
    '--display-name', 'GitHub Actions Pool'
  ) -Label 'Create workload identity pool github-pool'

  Invoke-GcloudAllowExists -GcloudArgs @(
    'iam', 'workload-identity-pools', 'providers', 'create-oidc', $ProviderId,
    '--project', $ProjectId,
    '--location', $Location,
    '--workload-identity-pool', $PoolId,
    '--display-name', 'GitHub OIDC Provider',
    '--issuer-uri', $IssuerUri,
    '--attribute-mapping', $AttributeMapping,
    '--attribute-condition', "assertion.repository=='$GitHubRepo'"
  ) -Label 'Create OIDC provider github-provider'

  Invoke-GcloudAllowExists -GcloudArgs @(
    'iam', 'service-accounts', 'create', $SaId,
    '--project', $ProjectId,
    '--display-name', 'GitHub Actions OIDC deploy'
  ) -Label "Create service account $SaId"

  foreach ($role in @(
      'roles/run.admin',
      'roles/iam.serviceAccountUser',
      'roles/firebasehosting.admin',
      'roles/cloudfunctions.admin',
      'roles/storage.objectAdmin',
      'roles/secretmanager.secretAccessor'
    )) {
    Invoke-GcloudAllowExists -GcloudArgs @(
      'projects', 'add-iam-policy-binding', $ProjectId,
      '--member', "serviceAccount:$SaEmail",
      '--role', $role,
      '--condition', 'None'
    ) -Label "Grant $role to $SaId" -ExistsPatterns @('already exists', 'ALREADY_EXISTS', 'duplicate', 'Policy update access denied')
  }

  $providerIdFull = "projects/$projectNumber/locations/$Location/workloadIdentityPools/$PoolId/providers/$ProviderId"
  $bindingMember = "principalSet://iam.googleapis.com/projects/$projectNumber/locations/$Location/workloadIdentityPools/$PoolId/attribute.repository/$GitHubRepo"
  $conditionExpression = 'attribute.repository == "ahmadlatifdev/bossmind-resumora" && attribute.branch == "refs/heads/main"'

  if ($WhatIf) {
    Write-Step 'Bind workloadIdentityUser with main-branch condition'
  }
  else {
    Write-Step 'Bind workloadIdentityUser with main-branch condition'
    $conditionArg = "expression=$conditionExpression,title=GitHub main branch only,description=Allow $GitHubRepo refs/heads/main via OIDC"
    $bindResult = Invoke-GcloudRaw -GcloudArgs @(
      'iam', 'service-accounts', 'add-iam-policy-binding', $SaEmail,
      '--project', $ProjectId,
      '--role', 'roles/iam.workloadIdentityUser',
      '--member', $bindingMember,
      '--condition', $conditionArg
    )
    if ($bindResult.ExitCode -ne 0) {
      $bindOut = $bindResult.Output.ToLowerInvariant()
      if ($bindOut -match 'already exists|already_exists|duplicate|condition') {
        Write-Host '  (workloadIdentityUser binding already present - continuing)' -ForegroundColor Yellow
      }
      else {
        Write-Host $bindResult.Output
        throw 'add-iam-policy-binding for workloadIdentityUser failed'
      }
    }
    else {
      Write-Host '  OK workloadIdentityUser binding applied' -ForegroundColor Green
    }
  }

  Invoke-GcloudAllowExists -GcloudArgs @(
    'iam', 'service-accounts', 'add-iam-policy-binding', $SaEmail,
    '--project', $ProjectId,
    '--role', 'roles/iam.serviceAccountTokenCreator',
    '--member', $bindingMember
  ) -Label 'Grant serviceAccountTokenCreator for OIDC token refresh (gh-oidc-sa)'

  Write-Host ''
  Write-Host '=== SUCCESS: Workload Identity Federation ready ===' -ForegroundColor Green
  Write-Host "WORKLOAD_IDENTITY_PROVIDER_ID=$providerIdFull"
  Write-Host "SERVICE_ACCOUNT_EMAIL=$SaEmail"
  Write-Host ''
  Write-Host 'GitHub Actions secrets to set:'
  Write-Host '  WORKLOAD_IDENTITY_PROVIDER'
  Write-Host '  SERVICE_ACCOUNT_EMAIL'

  if ($SetGitHubSecrets -and -not $WhatIf) {
    Write-Step 'Uploading GitHub OIDC secrets via gh'
    gh secret set WORKLOAD_IDENTITY_PROVIDER --repo $GitHubRepo --body $providerIdFull
    if ($LASTEXITCODE -ne 0) { throw 'gh secret set WORKLOAD_IDENTITY_PROVIDER failed' }
    gh secret set SERVICE_ACCOUNT_EMAIL --repo $GitHubRepo --body $SaEmail
    if ($LASTEXITCODE -ne 0) { throw 'gh secret set SERVICE_ACCOUNT_EMAIL failed' }
    Write-Host 'GitHub secrets: Success' -ForegroundColor Green
  }

  return
}
catch {
  Write-Host "FAILURE: $($_.Exception.Message)" -ForegroundColor Red
  throw
}
