#!/usr/bin/env bash
# AuditPilot one-command setup for macOS and Linux (safe to re-run).
#   ./setup.sh               install everything, then start the app
#   ./setup.sh --no-run      install only
#   ./setup.sh --dry-run     show what was detected and what would happen, change nothing
#   ./setup.sh --model qwen2.5:7b   force a model (default: chosen from your GPU/RAM)
#
# Installs when missing: Node.js 22+ (via nvm, no sudo), Ollama. Pulls a tool-calling model that fits the hardware
# (NVIDIA CUDA GPUs and Apple Silicon are used automatically by Ollama), installs npm packages, creates server/.env,
# warms the model and starts the app on http://localhost:5173.
set -euo pipefail
cd "$(dirname "$0")/.."

MODEL="${LLM_MODEL:-}"; NO_RUN=0; DRY=0; SKIP_MODEL=0; FALLBACK="qwen2.5:3b"
while [ $# -gt 0 ]; do
  case "$1" in
    --no-run) NO_RUN=1 ;; --dry-run) DRY=1 ;; --skip-model) SKIP_MODEL=1 ;;
    --model) MODEL="${2:-}"; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

say()  { printf '\033[36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m    [ok] %s\033[0m\n' "$*"; }
warn() { printf '\033[33m    [!]  %s\033[0m\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------- 1. hardware
say "Detecting hardware"
OS="$(uname -s)"; ARCH="$(uname -m)"
if [ "$OS" = "Darwin" ]; then
  RAM_TOTAL=$(( $(sysctl -n hw.memsize) / 1073741824 ))
  RAM_FREE=$RAM_TOTAL   # macOS reports reclaimable memory differently; treat total as the budget (unified memory)
else
  RAM_TOTAL=$(awk '/MemTotal/ {printf "%d", $2/1048576}' /proc/meminfo)
  RAM_FREE=$(awk '/MemAvailable/ {printf "%d", $2/1048576}' /proc/meminfo)
fi
GPU_NAME=""; VRAM_GB=0
if have nvidia-smi; then
  LINE="$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 || true)"
  if [ -n "$LINE" ]; then GPU_NAME="${LINE%%,*}"; VRAM_GB=$(( $(echo "${LINE##*,}" | tr -d ' ') / 1024 )); fi
fi
ok "OS: $OS $ARCH, RAM: ${RAM_TOTAL} GB total, ${RAM_FREE} GB available"
if [ -n "$GPU_NAME" ]; then ok "NVIDIA GPU: $GPU_NAME, ${VRAM_GB} GB VRAM (CUDA: Ollama will use it automatically)"
elif [ "$OS" = "Darwin" ] && [ "$ARCH" = "arm64" ]; then ok "Apple Silicon: Ollama uses the GPU (Metal) automatically"
elif have lspci && lspci 2>/dev/null | grep -qi nvidia; then warn "NVIDIA GPU found but nvidia-smi is missing: install the NVIDIA driver for CUDA speed. Continuing on CPU."
else ok "No supported GPU detected: the model will run on CPU (slower, still works)"; fi

if [ -z "$MODEL" ]; then
  if [ -n "$GPU_NAME" ] && [ "$VRAM_GB" -ge 8 ]; then MODEL="qwen2.5:7b"
  elif [ "$OS" = "Darwin" ] && [ "$ARCH" = "arm64" ] && [ "$RAM_TOTAL" -ge 16 ]; then MODEL="qwen2.5:7b"
  elif [ -z "$GPU_NAME" ] && [ "$OS" != "Darwin" ] && [ "$RAM_FREE" -ge 10 ]; then MODEL="qwen2.5:7b"
  else MODEL="$FALLBACK"; fi
fi
ok "Model for this machine: $MODEL"

if [ "$DRY" = 1 ]; then
  say "Dry run: would install Node 22+ and Ollama if missing, pull the model, run npm run setup, write LLM_MODEL, warm up and start. Nothing changed."
  exit 0
fi

# ---------------------------------------------------------------- 2. Node.js (nvm, no sudo)
say "Checking Node.js (needs 22 or newer)"
node_major() { have node && node -p 'process.versions.node.split(".")[0]' || echo 0; }
if [ "$(node_major)" -lt 22 ]; then
  warn "Installing Node.js 22 with nvm"
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash; fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install 22 && nvm use 22
fi
ok "Node $(node -v), npm $(npm -v)"

# ---------------------------------------------------------------- 3. Ollama + model
if [ "$SKIP_MODEL" = 0 ]; then
  say "Checking Ollama"
  if ! have ollama; then
    warn "Installing Ollama"
    if [ "$OS" = "Darwin" ]; then
      if have brew; then brew install ollama; else echo "Install Ollama from https://ollama.com/download then re-run ./setup.sh" >&2; exit 1; fi
    else
      curl -fsSL https://ollama.com/install.sh | sh   # also sets up CUDA support when an NVIDIA driver is present
    fi
  fi
  ok "$(ollama --version 2>&1 | tail -1)"

  up() { curl -fsS --max-time 2 http://127.0.0.1:11434/api/version >/dev/null 2>&1; }
  if ! up; then
    warn "Starting the Ollama server"
    if [ "$OS" = "Darwin" ] && have brew; then brew services start ollama >/dev/null 2>&1 || true; fi
    up || { nohup ollama serve >/tmp/ollama-serve.log 2>&1 & }
    for _ in $(seq 1 40); do up && break; sleep 1; done
  fi
  up || { echo "Ollama did not start. Run: ollama serve" >&2; exit 1; }
  ok "Ollama server is running"

  say "Pulling model $MODEL (first time only; 3B is about 2 GB, 7B about 4.7 GB)"
  ollama pull "$MODEL"
  if ! ollama show "$MODEL" 2>&1 | grep -qi tools; then
    warn "$MODEL does not support tool calling; using $FALLBACK instead"
    MODEL="$FALLBACK"; ollama pull "$MODEL"
  fi
  ok "$MODEL is installed and supports tool calling"
fi

# ---------------------------------------------------------------- 4. project dependencies + env
say "Installing project dependencies (root, server, client) and creating server/.env"
npm run setup

if [ "$SKIP_MODEL" = 0 ]; then
  if grep -q '^LLM_MODEL=' server/.env; then
    sed -i.bak "s|^LLM_MODEL=.*|LLM_MODEL=$MODEL|" server/.env && rm -f server/.env.bak
  else
    printf '\nLLM_MODEL=%s\n' "$MODEL" >> server/.env
  fi
  ok "server/.env uses LLM_MODEL=$MODEL"
  say "Warming the model (loads it into memory so the first answer is fast)"
  npm run warmup:llm || warn "Warm-up failed (the app still works; AI features start once Ollama is ready)"
  PS="$(ollama ps 2>&1 || true)"
  if echo "$PS" | grep -q GPU; then ok "The model is running on the GPU"; elif echo "$PS" | grep -q CPU; then ok "The model is running on the CPU"; fi
fi

echo
printf '\033[32mSetup complete.\033[0m\n'
echo "  App:   http://localhost:5173   (demo login: demo@auditpilot.dev / demo1234)"
echo "  Check: npm run check:llm   |   Tests: npm test"
[ "$NO_RUN" = 1 ] && { echo "  Start later with: npm run dev"; exit 0; }
say "Starting AuditPilot (Ctrl+C to stop)"
exec npm run dev
