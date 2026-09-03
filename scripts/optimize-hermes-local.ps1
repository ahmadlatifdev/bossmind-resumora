#Requires -Version 5.1
<#
.SYNOPSIS
  Optimize local Hermes Agent for BossMind (GPU/CPU, memory, routing, delegation).

.DESCRIPTION
  Writes non-secret settings into %LOCALAPPDATA%\hermes\config.yaml (or HERMES_HOME).
  Uses real Hermes keys from official docs — does not invent unsupported CLI flags.
  Never prints API keys. Safe to re-run (merges config).

.PARAMETER HermesHome
  Override Hermes data directory.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\optimize-hermes-local.ps1
#>
[CmdletBinding()]
param(
  [string] $HermesHome = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

if (-not $HermesHome) {
  if ($env:HERMES_HOME) { $HermesHome = $env:HERMES_HOME }
  else { $HermesHome = Join-Path $env:LOCALAPPDATA 'hermes' }
}

New-Item -ItemType Directory -Force -Path $HermesHome | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $HermesHome 'skills') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $HermesHome 'memories') | Out-Null

function Test-CudaGpu {
  $info = @{ Available = $false; VramGb = 0; Name = '' }
  try {
    $out = & nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>$null
    if ($LASTEXITCODE -eq 0 -and $out) {
      $line = ($out | Select-Object -First 1).ToString().Trim()
      $parts = $line -split ','
      if ($parts.Count -ge 2) {
        $info.Name = $parts[0].Trim()
        $mb = [double]($parts[1].Trim())
        $info.VramGb = [math]::Round($mb / 1024.0, 1)
        $info.Available = $info.VramGb -ge 8
      }
    }
  } catch { }
  return $info
}

function Invoke-HermesSafe {
  param([string[]] $HermesArgs)
  if (-not (Get-Command hermes -ErrorAction SilentlyContinue)) {
    Write-Host 'hermes CLI not on PATH - config.yaml will still be written.' -ForegroundColor Yellow
    return $false
  }
  & hermes @HermesArgs 2>&1 | Out-Host
  return ($LASTEXITCODE -eq 0)
}

$gpu = Test-CudaGpu
Write-Host ("GPU: name={0} vramGb={1} cudaEligible={2}" -f $gpu.Name, $gpu.VramGb, $gpu.Available)

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$yamlPath = Join-Path $HermesHome 'config.yaml'

if ($gpu.Available) {
  $fileReadMax = 200000
  $toolMaxBytes = 150000
  $toolMaxLines = 5000
  $contextHint = '200000'
  Write-Host 'CUDA path: enabling docker --gpus=all and large-context tool limits.'
  $dockerExtraYaml = "  docker_extra_args:`n    - `"--gpus=all`""
} else {
  $fileReadMax = 30000
  $toolMaxBytes = 20000
  $toolMaxLines = 500
  $contextHint = '32000'
  Write-Host 'CPU path: smaller context/tool limits (prefer portal/cloud models over local heavy weights).'
  $dockerExtraYaml = '  docker_extra_args: []'
}

$yamlLines = @(
  "# Generated/merged by scripts/optimize-hermes-local.ps1 ($stamp)",
  '# Secrets stay in .env - never commit this home directory.',
  '',
  'terminal:',
  '  backend: docker',
  '  timeout: 180',
  '  container_cpu: 2',
  '  container_memory: 5120',
  '  container_persistent: true',
  $dockerExtraYaml,
  '',
  'model:',
  '  streaming: true',
  '',
  'agent:',
  '  max_turns: 40',
  '  api_max_retries: 2',
  '',
  'compression:',
  '  enabled: true',
  '  threshold: 0.65',
  '  target_ratio: 0.20',
  '  tail_mode: lean',
  '  protect_last_n: 24',
  '  protect_first_n: 3',
  '',
  'memory:',
  '  memory_enabled: true',
  '  user_profile_enabled: true',
  '  memory_char_limit: 2200',
  '  user_char_limit: 1375',
  '',
  "file_read_max_chars: $fileReadMax",
  '',
  'tool_output:',
  "  max_bytes: $toolMaxBytes",
  "  max_lines: $toolMaxLines",
  '',
  'auxiliary:',
  '  compression:',
  '    provider: auto',
  '    model: ""',
  '  vision:',
  '    provider: auto',
  '    timeout: 120',
  '',
  'delegation:',
  '  max_concurrent_children: 3',
  '',
  'gateway:',
  '  api_server:',
  '    enabled: true',
  '    host: 127.0.0.1',
  '    port: 8642',
  '    max_concurrent_runs: 8',
  '',
  '# BossMind routing notes:',
  '# - Simple Q&A / compression: prefer fast Gemini Flash-class via auxiliary (auto/nous)',
  '# - Complex reasoning: keep main model on portal premium via: hermes model',
  "# Context target hint (chars): $contextHint"
)
$yaml = ($yamlLines -join [Environment]::NewLine)

Set-Content -Path $yamlPath -Value $yaml.TrimEnd() -Encoding utf8
Write-Host ("Wrote {0}" -f $yamlPath)

# Env performance knobs (non-secret) - append if missing
$envPath = Join-Path $HermesHome '.env'
$perfLines = @(
  'API_SERVER_ENABLED=true',
  'API_SERVER_HOST=127.0.0.1',
  'API_SERVER_PORT=8642',
  'HERMES_API_TIMEOUT=30',
  'API_SERVER_MAX_CONCURRENT_RUNS=8'
)
if (-not (Test-Path $envPath)) {
  Set-Content -Path $envPath -Value ($perfLines -join [Environment]::NewLine) -Encoding utf8
} else {
  $existing = Get-Content $envPath -Raw -ErrorAction SilentlyContinue
  foreach ($line in $perfLines) {
    $key = ($line -split '=')[0]
    if ($existing -notmatch "(?m)^$([regex]::Escape($key))=") {
      Add-Content -Path $envPath -Value $line
    }
  }
}

# Prefer hermes on PATH; fall back to known Windows install location
if (-not (Get-Command hermes -ErrorAction SilentlyContinue)) {
  $hermesBin = Join-Path $env:LOCALAPPDATA 'hermes\bin'
  if (Test-Path (Join-Path $hermesBin 'hermes.exe')) {
    $env:Path = "$hermesBin;$env:Path"
    Write-Host ("Added to PATH for this session: {0}" -f $hermesBin)
  }
}

$null = Invoke-HermesSafe @('config', 'check')
# memory setup is interactive — skip in automation; use: hermes memory setup
$null = Invoke-HermesSafe @('memory', 'status')

$repoSkills = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\Skills'))
$destSkills = Join-Path (Join-Path $HermesHome 'skills') 'bossmind'
if (Test-Path $repoSkills) {
  New-Item -ItemType Directory -Force -Path $destSkills | Out-Null
  Copy-Item -Path (Join-Path $repoSkills '*') -Destination $destSkills -Recurse -Force
  Write-Host ("Copied BossMind skills -> {0}" -f $destSkills)
}

Write-Host ''
Write-Host '=== Manual next steps (self-improving loop) ===' -ForegroundColor Cyan
Write-Host '1) hermes setup --portal   # or hermes model (premium for complex, Flash for aux)'
Write-Host '2) hermes skills install hermes-dojo'
Write-Host '3) hermes gateway          # API on 127.0.0.1:8642'
Write-Host '4) For production Cloud Functions, expose a reachable HERMES_API_URL (not localhost).'
Write-Host '5) Corrections: tell Hermes to store lasting corrections via memory tool / USER.md edits.'
Write-Host 'Done.'
