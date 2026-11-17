@echo off
rem Double-click to stop the VitalGate console and pipeline
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0vitalgate.ps1" stop
pause
