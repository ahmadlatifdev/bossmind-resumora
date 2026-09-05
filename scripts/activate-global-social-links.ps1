#Requires -Version 5.1
<#
.SYNOPSIS
  Open all Resumora social profile edit pages and optionally set Facebook website via Graph API.

.DESCRIPTION
  One script to activate https://resumora.net across major platforms:
  - Facebook: automated via Graph API when a user token is supplied, else opens About edit page
  - Instagram, LinkedIn, X, YouTube, Bilibili: opens the correct edit URL in your browser

  Never commit or log access tokens. Run locally only.

.PARAMETER Link
  Website URL to set on profiles (default: https://resumora.net).

.PARAMETER FacebookPageId
  Resumora Facebook Page ID.

.PARAMETER LinkedInHandle
  LinkedIn company slug (replace YOUR_HANDLE in edit URL).

.PARAMETER YouTubeChannelId
  YouTube channel ID for featured/links edit URL.

.PARAMETER UserToken
  Optional Facebook user token (pages_manage_metadata). If omitted, Read-Host prompts; blank skips API.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\activate-global-social-links.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\activate-global-social-links.ps1 -LinkedInHandle resumora -YouTubeChannelId UCxxxxxxxx
#>
[CmdletBinding()]
param(
  [string] $Link = 'https://resumora.net',
  [string] $FacebookPageId = '612581318818344',
  [string] $LinkedInHandle = 'YOUR_HANDLE',
  [string] $YouTubeChannelId = 'UC_your_channel_id',
  [string] $UserToken = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

Write-Host "Activating $Link on all social platforms..." -ForegroundColor Cyan

function Open-EditPage {
  param([string] $Url, [string] $Label)
  Write-Host "Opening $Label..."
  Start-Process $Url
}

# ----- FACEBOOK (Automated via API – requires token) -----
if (-not $UserToken) {
  $UserToken = Read-Host 'Paste your Facebook User Access Token (Enter to skip and open manual edit page)'
}

if ($UserToken) {
  try {
    $pages = Invoke-RestMethod "https://graph.facebook.com/me/accounts?access_token=$UserToken"
    $page = $pages.data | Where-Object { $_.name -like '*Resumora*' -or $_.id -eq $FacebookPageId } | Select-Object -First 1
    if (-not $page -and $pages.data.Count -gt 0) {
      $page = $pages.data[0]
    }
    if ($page) {
      $body = @{ website = $Link; access_token = $page.access_token }
      $update = Invoke-RestMethod -Method Post -Uri "https://graph.facebook.com/v19.0/$($page.id)" -Body $body
      if ($update.id) {
        Write-Host "Facebook page '$($page.name)' updated!" -ForegroundColor Green
      }
    } else {
      Write-Host 'No Facebook pages returned for this token.' -ForegroundColor Yellow
      Open-EditPage "https://www.facebook.com/profile.php?id=$FacebookPageId&sk=about" 'Facebook About'
    }
  } catch {
    Write-Host 'Facebook automation failed – opening manual page instead.' -ForegroundColor Yellow
    Open-EditPage "https://www.facebook.com/profile.php?id=$FacebookPageId&sk=about" 'Facebook About'
  }
} else {
  Write-Host 'Skipping Facebook API – opening manual edit page.' -ForegroundColor Gray
  Open-EditPage "https://www.facebook.com/profile.php?id=$FacebookPageId&sk=about" 'Facebook About'
}

# ----- INSTAGRAM -----
Open-EditPage 'https://www.instagram.com/accounts/edit/' 'Instagram profile edit'

# ----- LINKEDIN -----
Open-EditPage "https://www.linkedin.com/company/$LinkedInHandle/edit/" 'LinkedIn company edit'

# ----- X (Twitter) -----
Open-EditPage 'https://twitter.com/settings/profile' 'X profile settings'

# ----- YOUTUBE -----
Open-EditPage "https://www.youtube.com/channel/$YouTubeChannelId/featured?edit_links=1" 'YouTube channel links'

# ----- BILIBILI -----
Open-EditPage 'https://space.bilibili.com/1978033585/edit' 'Bilibili space edit'

Write-Host ''
Write-Host 'All edit pages should now be open in your browser.' -ForegroundColor Green
Write-Host "In each tab, find the Website or Link field and paste:" -ForegroundColor Yellow
Write-Host "  $Link" -ForegroundColor Cyan
Write-Host 'Save each profile — changes usually appear within minutes.' -ForegroundColor White
