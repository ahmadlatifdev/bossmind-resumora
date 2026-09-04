#Requires -Version 5.1
<#
.SYNOPSIS
  Rotate Secret Manager ADMIN_REFUND_PASSWORD for resumora-live (interactive; never logs the value).

.DESCRIPTION
  Prompts for a new admin password securely and adds a new secret version.
  Cloud Functions read ADMIN_REFUND_PASSWORD via defineSecret — this is the
  password accepted by https://resumora.net/admin/master (unless a Firestore
  override hash was set via the in-app reset flow).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\rotate-admin-refund-password.ps1
#>
[CmdletBinding()]
param(
  [string] $ProjectId = 'resumora-live',
  [string] $SecretId = 'ADMIN_REFUND_PASSWORD'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "Project: $ProjectId"
Write-Host "Secret:  $SecretId (value will NOT be printed)"

$secure = Read-Host -AsSecureString "New Master Admin password (min 12 chars)"
$secure2 = Read-Host -AsSecureString "Confirm password"
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$bstr2 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure2)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $plain2 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr2)
  if ($plain -ne $plain2) { throw 'Passwords do not match.' }
  if ($plain.Length -lt 12) { throw 'Password must be at least 12 characters.' }

  $exists = & gcloud secrets describe $SecretId --project=$ProjectId 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating secret container $SecretId"
    & gcloud secrets create $SecretId --project=$ProjectId --replication-policy=automatic
    if ($LASTEXITCODE -ne 0) { throw "Failed to create $SecretId" }
  }

  $plain | & gcloud secrets versions add $SecretId --project=$ProjectId --data-file=-
  if ($LASTEXITCODE -ne 0) { throw 'Failed to add secret version.' }

  Write-Host "OK: new version added for $SecretId."
  Write-Host "Wait ~1 minute for Functions to pick up the latest secret version, then unlock https://resumora.net/admin/master"
  Write-Host "Do NOT put this password in VITE_* or commit it."
}
finally {
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  if ($bstr2 -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr2) }
  $plain = $null
  $plain2 = $null
}
