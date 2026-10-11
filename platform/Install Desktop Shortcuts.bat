@echo off
title EGIC - Install desktop shortcuts
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\Install-Desktop-Shortcuts.ps1"
echo.
pause
