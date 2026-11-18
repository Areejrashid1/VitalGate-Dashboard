@echo off
rem Double-click to start VitalGate in LIVE mode (Docker Desktop must be running)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0vitalgate.ps1" start -Mode live
pause
