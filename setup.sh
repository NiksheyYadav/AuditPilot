#!/usr/bin/env bash
# AuditPilot one-command setup for macOS and Linux. Usage: ./setup.sh [--no-run] [--dry-run] [--model qwen2.5:7b]
exec bash "$(dirname "$0")/scripts/setup.sh" "$@"
