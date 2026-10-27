<#
  AuditPilot one-command setup for Windows (safe to re-run).
    setup.bat                 -> install everything, then start the app
    setup.bat -NoRun          -> install only
    setup.bat -DryRun         -> show what it detected and would do, change nothing
    setup.bat -Model qwen2.5:7b   -> force a model (default: chosen from your GPU/RAM)

  Installs when missing: Node.js 22+, Ollama. Pulls a tool-calling model that fits the hardware
  (NVIDIA CUDA GPUs are used automatically by Ollama), installs npm packages, creates server/.env,
  warms the model and starts the app on http://localhost:5173.
#>
param([string]$Model = '', [switch]$NoRun, [switch]$DryRun, [switch]$SkipModel)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$Fallback = 'qwen2.5:3b'

function Say($m)  { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "    [ok] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "    [!]  $m" -ForegroundColor Yellow }
function Have($n) { [bool](Get-Command $n -ErrorAction SilentlyContinue) }
function RefreshPath { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Winget($id) {
  if (-not (Have winget)) { throw "winget is not available. Install $id manually (see README), then re-run setup.bat." }
  winget install --id $id -e --silent --accept-source-agreements --accept-package-agreements | Out-Host
  RefreshPath
}

# ---------------------------------------------------------------- 1. hardware
Say 'Detecting hardware'
$os = Get-CimInstance Win32_OperatingSystem
$ramTotal = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$ramFree = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
$gpu = $null
if (Have nvidia-smi) {
  try {
    $line = (& nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>$null | Select-Object -First 1)
    if ($line) { $p = $line -split ','; $gpu = @{ Name = $p[0].Trim(); VramGB = [math]::Round([double]$p[1] / 1024, 1) } }
  } catch { }
}
Ok "RAM: $ramTotal GB total, $ramFree GB free"
if ($gpu) { Ok "NVIDIA GPU: $($gpu.Name), $($gpu.VramGB) GB VRAM (CUDA: Ollama will use it automatically)" }
elseif (Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match 'NVIDIA' }) { Warn 'NVIDIA GPU found but nvidia-smi is missing: install the NVIDIA driver to get CUDA speed. Continuing on CPU.' }
else { Ok 'No NVIDIA GPU detected: the model will run on CPU (slower, still works)' }

# Model choice: big model only when it will really fit (GPU VRAM, or plenty of free RAM on CPU)
$chosen = $Model
if (-not $chosen -and $env:LLM_MODEL) { $chosen = $env:LLM_MODEL }
if (-not $chosen) {
  if ($gpu -and $gpu.VramGB -ge 8) { $chosen = 'qwen2.5:7b' }
  elseif (-not $gpu -and $ramFree -ge 10) { $chosen = 'qwen2.5:7b' }
  else { $chosen = $Fallback }
}
Ok "Model for this machine: $chosen"

if ($DryRun) {
  Say 'Dry run: would install Node 22+ and Ollama if missing, pull the model, run npm run setup, write LLM_MODEL, warm up and start. Nothing changed.'
  exit 0
}

# ---------------------------------------------------------------- 2. Node.js
Say 'Checking Node.js (needs 22 or newer)'
$nodeOk = $false
if (Have node) { $nodeOk = ([int](& node -p 'process.versions.node.split(".")[0]')) -ge 22 }
if (-not $nodeOk) { Warn 'Installing Node.js LTS'; Winget 'OpenJS.NodeJS.LTS' }
if (-not (Have node)) { throw 'Node.js was installed but is not on PATH yet. Open a new terminal and run setup.bat again.' }
Ok "Node $(& node -v), npm $(& npm -v)"

# ---------------------------------------------------------------- 3. Ollama + model
if (-not $SkipModel) {
  Say 'Checking Ollama'
  if (-not (Have ollama)) {
    $guess = Join-Path $env:LOCALAPPDATA 'Programs\Ollama'
    if (Test-Path (Join-Path $guess 'ollama.exe')) { $env:Path += ";$guess" } else { Warn 'Installing Ollama'; Winget 'Ollama.Ollama' }
    if (-not (Have ollama) -and (Test-Path (Join-Path $guess 'ollama.exe'))) { $env:Path += ";$guess" }
  }
  if (-not (Have ollama)) { throw 'Ollama is not on PATH. Open a new terminal and run setup.bat again.' }
  Ok (& ollama --version 2>&1 | Select-Object -Last 1)

  $up = { try { (Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:11434/api/version' -TimeoutSec 2).StatusCode -eq 200 } catch { $false } }
  if (-not (& $up)) {
    Warn 'Starting the Ollama server'
    Start-Process -FilePath 'ollama' -ArgumentList 'serve' -WindowStyle Hidden
    for ($i = 0; $i -lt 40 -and -not (& $up); $i++) { Start-Sleep -Seconds 1 }
  }
  if (-not (& $up)) { throw 'Ollama did not start. Start it manually (ollama serve) and re-run.' }
  Ok 'Ollama server is running'

  Say "Pulling model $chosen (first time only; 3B is about 2 GB, 7B about 4.7 GB)"
  & ollama pull $chosen | Out-Host
  $caps = (& ollama show $chosen 2>&1) -join "`n"
  if ($caps -notmatch 'tools') {
    Warn "$chosen does not support tool calling; using $Fallback instead"
    $chosen = $Fallback; & ollama pull $chosen | Out-Host
  }
  Ok "$chosen is installed and supports tool calling"
}

# ---------------------------------------------------------------- 4. project dependencies + env
Say 'Installing project dependencies (root, server, client) and creating server/.env'
& npm run setup | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'npm run setup failed' }

if (-not $SkipModel) {
  $envFile = 'server/.env'
  $txt = Get-Content $envFile -Raw
  if ($txt -match '(?m)^LLM_MODEL=') { $txt = [regex]::Replace($txt, '(?m)^LLM_MODEL=.*$', "LLM_MODEL=$chosen") } else { $txt += "`nLLM_MODEL=$chosen`n" }
  Set-Content -Path $envFile -Value $txt -NoNewline
  Ok "server/.env uses LLM_MODEL=$chosen"

  Say 'Warming the model (loads it into memory so the first answer is fast)'
  try { & npm run warmup:llm | Out-Host } catch { Warn 'Warm-up failed (the app still works; AI features start once Ollama is ready)' }
  $ps = (& ollama ps 2>&1) -join "`n"
  if ($ps -match 'GPU') { Ok 'The model is running on the GPU (CUDA)' } elseif ($ps -match 'CPU') { Ok 'The model is running on the CPU' }
}

Write-Host ''
Write-Host 'Setup complete.' -ForegroundColor Green
Write-Host '  App:   http://localhost:5173   (demo login: demo@auditpilot.dev / demo1234)'
Write-Host '  Check: npm run check:llm   |   Tests: npm test'
if ($NoRun) { Write-Host '  Start later with: npm run dev'; exit 0 }
Say 'Starting AuditPilot (Ctrl+C to stop)'
& npm run dev
