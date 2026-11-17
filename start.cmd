@echo off
rem Double-click to start the VitalGate console (replay mode). For live mode run:  start.cmd live
set MODE=%1
if "%MODE%"=="" set MODE=replay
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0vitalgate.ps1" start -Mode %MODE%
pause
