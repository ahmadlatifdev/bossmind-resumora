#Requires -Version 5.1
<#
.SYNOPSIS
  Detect -> Diagnose -> Repair (safe) -> Validate for Cursor/VS Code Git + Source Control on Windows.

.DESCRIPTION
  Covers: Git executable resolution, PowerShell invocation, repository integrity, optional Cursor User
  settings inspection, extension-host hints, and optional non-destructive cache reset for ONE workspace.

  Does NOT: delete .git, run git reset --hard, or destroy repository history.

.PARAMETER WorkspaceRoot
  Absolute path to the folder open in Cursor (should contain .git or be inside a git work tree).

.PARAMETER GitExe
  Explicit path to git.exe for validation (optional).

.PARAMETER ResetWorkspaceScmCache
  After closing Cursor: renames the newest workspaceStorage folder (by last-write heuristic) to *.bak.
  Use only if SCM is broken after updates; Cursor recreates state.

.PARAMETER WhatIf
  Show actions without renaming workspace cache folders.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $false)]
  [string]$WorkspaceRoot,

  [Parameter(Mandatory = $false)]
  [string]$GitExe,

  [Parameter(Mandatory = $false)]
  [switch]$ResetWorkspaceScmCache
)

if (-not $WorkspaceRoot) {
  $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $WorkspaceRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
}

$ErrorActionPreference = "Continue"
$warnings = 0
$errors = 0

function Write-Section([string]$Title) {
  Write-Host ""
  Write-Host "=== $Title ===" -ForegroundColor Cyan
}

function Test-GitCommand {
  param([string]$Exe)
  try {
    $v = & $Exe --version 2>&1
    if ($LASTEXITCODE -ne 0) { return $false }
    Write-Host "  OK: $v"
    return $true
  }
  catch {
    Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red
    return $false
  }
}

function Read-JsonLoose([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  try {
    $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    return $raw | ConvertFrom-Json
  }
  catch {
    Write-Host "  WARN: Could not parse JSON: $Path - $($_.Exception.Message)" -ForegroundColor Yellow
    return $null
  }
}

function Show-RelevantGitKeys([string]$Label, $obj) {
  if (-not $obj) {
    Write-Host "  $Label : (missing or unreadable)"
    return
  }
  $keys = @(
    "git.enabled", "git.path", "git.terminalAuthentication", "git.useIntegratedAskPass",
    "git.allowForcePush", "scm.defaultViewMode", "git.autoRepositoryDetection"
  )
  Write-Host "  $Label"
  foreach ($k in $keys) {
    if ($obj.PSObject.Properties.Name -contains $k) {
      $v = $obj.$k
      Write-Host "    $k = $($v | ConvertTo-Json -Compress)"
    }
  }
}

Write-Section "1) Cursor / VS Code Git integration (built-in)"
Write-Host '  Built-in Git ships with Cursor (vscode.git). If commits fail with No full commit provider registered:'
Write-Host '  - Ctrl+Shift+P: Extensions: Show Built-in Extensions -> Git -> Enable (workspace + user)'
Write-Host '  - Developer: Reload Window'

Write-Section "2) Git executable path"
$candidates = @()
if ($GitExe) {
  $candidates += $GitExe
}
$cmdGit = Get-Command git -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if ($cmdGit) {
  $candidates += $cmdGit
}
$candidates += @(
  "C:\Program Files\Git\cmd\git.exe",
  "C:\Program Files\Git\bin\git.exe"
)
$candidates = @($candidates | Where-Object { $_ })

$resolved = $null
foreach ($c in ($candidates | Select-Object -Unique)) {
  if (-not $c) { continue }
  if (Test-Path -LiteralPath $c) {
    Write-Host "  Candidate: $c"
    if (Test-GitCommand -Exe $c) {
      $resolved = $c
      break
    }
  }
}

if (-not $resolved) {
  Write-Host "  WARN: No working git.exe found among PATH and common install paths." -ForegroundColor Yellow
  Write-Host "  Install Git for Windows from https://git-scm.com/download/win or fix PATH." -ForegroundColor Yellow
  $warnings++
}

Write-Host "  where.exe git:"
& where.exe git 2>&1 | ForEach-Object { Write-Host "    $_" }

Write-Section "3) PowerShell Git execution"
if ($resolved) {
  $ver = & $resolved --version 2>&1
  Write-Host "  git --version (spawn from PowerShell): $ver"
}
else {
  Write-Host "  SKIP (no git.exe)" -ForegroundColor Yellow
  $warnings++
}

Write-Section "4) Workspace Git detection + repository integrity"
if (-not (Test-Path -LiteralPath $WorkspaceRoot)) {
  Write-Host "  FAIL: WorkspaceRoot not found: $WorkspaceRoot" -ForegroundColor Red
  $errors++
}
else {
  Write-Host "  WorkspaceRoot: $WorkspaceRoot"
  Push-Location $WorkspaceRoot
  try {
    if ($resolved) {
      $top = & $resolved rev-parse --show-toplevel 2>&1
      if ($LASTEXITCODE -eq 0) {
        Write-Host "  git rev-parse --show-toplevel: $top"
        & $resolved status -sb 2>&1 | ForEach-Object { Write-Host "  $_" }
        $dup = & $resolved remote -v 2>&1
        if ($LASTEXITCODE -eq 0) { Write-Host "  remotes:`n$dup" }
      }
      else {
        Write-Host "  WARN: Not a git repository (or git cannot read it): $top" -ForegroundColor Yellow
        $warnings++
      }
    }
    else {
      Write-Host "  SKIP git repo checks (no git.exe)" -ForegroundColor Yellow
    }

    if (Test-Path -LiteralPath (Join-Path $WorkspaceRoot ".git")) {
      Write-Host "  OK: .git present at workspace root"
    }
    else {
      Write-Host "  INFO: No .git at workspace root (multi-root or opened subfolder/submodule is OK if rev-parse works)."
    }
  }
  finally {
    Pop-Location
  }
}

Write-Section "5) Source Control provider registration (settings file hints)"
$cursorUser = Join-Path $env:APPDATA "Cursor\User\settings.json"
$vscodeUser = Join-Path $env:APPDATA "Code\User\settings.json"

$sCursor = Read-JsonLoose $cursorUser
$sCode = Read-JsonLoose $vscodeUser
Show-RelevantGitKeys "Cursor User settings ($cursorUser)" $sCursor
Show-RelevantGitKeys "VS Code User settings (comparison) ($vscodeUser)" $sCode

if ($sCursor -and ($sCursor.'git.enabled' -eq $false)) {
  Write-Host "  CRITICAL: git.enabled is false in Cursor User settings - Source Control will not register Git." -ForegroundColor Red
  $errors++
}

Write-Section "6) Git authentication / session (IDE)"
Write-Host '  HTTPS: Git Credential Manager should prompt or use stored credentials.'
Write-Host '  If push fails but commit works, check git remote -v, credential manager, SSH vs HTTPS.'

Write-Section "7) Corrupted Cursor cache / SCM UI state (non-destructive repair order)"
Write-Host '  1) Developer: Reload Window'
Write-Host '  2) Confirm built-in Git enabled'
Write-Host '  3) Git: Show Git Output'
Write-Host '  4) If needed: close Cursor, rename workspaceStorage entry (see -ResetWorkspaceScmCache); backup first'

Write-Section "8) Extension conflicts"
Write-Host '  Temporarily disable GitLens / other SCM extensions, Reload Window, retest.'
Write-Host '  Built-in vscode.git must stay enabled for standard commit UI.'

Write-Section "9) Validate terminal workflow (does not touch editor registration)"
if ($resolved -and (Test-Path -LiteralPath $WorkspaceRoot)) {
  Write-Host "  Run from repo root when SCM UI is blocked:"
  Write-Host '    git add -A'
  Write-Host '    git commit -m "message"'
  Write-Host '    git push'
}

Write-Section "10) Optional: workspaceStorage reset for THIS machine (single-folder)"
$wsRoot = Join-Path $env:APPDATA "Cursor\User\workspaceStorage"
if ($ResetWorkspaceScmCache) {
  if (-not (Test-Path -LiteralPath $wsRoot)) {
    Write-Host "  No folder: $wsRoot" -ForegroundColor Yellow
  }
  else {
    $latest = Get-ChildItem -LiteralPath $wsRoot -Directory -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if (-not $latest) {
      Write-Host "  No workspaceStorage subfolders found." -ForegroundColor Yellow
    }
    else {
      $parent = Split-Path -Parent $latest.FullName
      $newName = $latest.Name + ".bak-" + (Get-Date -Format "yyyyMMddHHmmss")
      $bakFull = Join-Path $parent $newName
      Write-Host "  Heuristic target (newest MTime): $($latest.FullName)"
      Write-Host "  Close Cursor first. Renames folder to:`n  $bakFull"
      if ($PSCmdlet.ShouldProcess($latest.FullName, "Rename to backup")) {
        Rename-Item -LiteralPath $latest.FullName -NewName $newName
        Write-Host "  DONE. Restart Cursor and reopen the workspace." -ForegroundColor Green
      }
    }
  }
}
else {
  Write-Host "  Skipped (pass -ResetWorkspaceScmCache after backup; close Cursor first). Heuristic only."
}

Write-Section "Recommended User settings (merge into Cursor User settings.json)"
$jsonGitPath = if ($resolved) {
  $resolved.Replace('\', '\\')
}
else {
  'C:\\Program Files\\Git\\cmd\\git.exe'
}
Write-Host "  Merge into: $cursorUser"
Write-Host '  Use keys: git.enabled=true, git.path=(see below), git.autoRepositoryDetection=true, git.terminalAuthentication=true'
Write-Host ('  Paste into JSON: "git.path": "' + $jsonGitPath + '"')
Write-Host '  Then: Developer: Reload Window'

Write-Section "Summary"
Write-Host "  Errors: $errors   Warnings: $warnings"
if ($errors -gt 0) { exit 2 }
if ($warnings -gt 0) { exit 1 }
exit 0
