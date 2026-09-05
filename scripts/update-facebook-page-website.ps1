#Requires -Version 5.1
<#
.SYNOPSIS
  Set the Resumora Facebook Page website field via Graph API.

.DESCRIPTION
  Exchanges a user access token (pages_manage_metadata) for a page token,
  then updates the Page website to https://resumora.net.

  Never commit or log access tokens. Run locally only.

.PARAMETER PageId
  Facebook Page ID (default: Resumora page).

.PARAMETER Website
  Website URL to set on the Page profile.

.PARAMETER UserToken
  Optional. User access token; if omitted, Read-Host prompts securely.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\update-facebook-page-website.ps1

.EXAMPLE
  $env:FB_USER_TOKEN = '<token>'; powershell -ExecutionPolicy Bypass -File .\scripts\update-facebook-page-website.ps1 -UserToken $env:FB_USER_TOKEN
#>
[CmdletBinding()]
param(
  [string] $PageId = '612581318818344',
  [string] $Website = 'https://resumora.net',
  [string] $UserToken = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $UserToken) {
  $UserToken = Read-Host 'Enter your Facebook User Access Token (with pages_manage_metadata)'
}

if (-not $UserToken) {
  Write-Host 'Token required – get one at: https://developers.facebook.com/tools/explorer/' -ForegroundColor Red
  exit 1
}

Write-Host 'Fetching Page Access Token...'
try {
  $pageTokenResponse = Invoke-RestMethod -Uri "https://graph.facebook.com/v19.0/$PageId?fields=access_token&access_token=$UserToken"
  $pageToken = $pageTokenResponse.access_token
} catch {
  Write-Host "Failed to get Page Token – check permissions: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

if (-not $pageToken) {
  Write-Host 'No access token for this page. Ensure you are an admin.' -ForegroundColor Red
  exit 1
}

Write-Host "Updating Page website to $Website..."
try {
  $updateBody = @{ website = $Website; access_token = $pageToken }
  $updateResponse = Invoke-RestMethod -Uri "https://graph.facebook.com/v19.0/$PageId" -Method Post -Body $updateBody

  if ($updateResponse.id) {
    Write-Host "SUCCESS! Website set to $Website" -ForegroundColor Green
    Write-Host "View your page: https://www.facebook.com/$PageId"
    Write-Host 'It may take 2–3 minutes for the button to appear.'
  } else {
    Write-Host "Update failed: $($updateResponse | ConvertTo-Json -Compress)" -ForegroundColor Red
    exit 1
  }
} catch {
  Write-Host "API Error: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
