@echo off
rem AuditPilot one-command setup for Windows. Usage: setup.bat [-NoRun] [-DryRun] [-Model qwen2.5:7b]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1" %*
