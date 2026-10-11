@echo off
setlocal
title EGIC Platform - POWERED BY DELMON ^& DEV SMART X
cd /d "%~dp0"
set "PAGE=%~1"
if "%PAGE%"=="" set "PAGE=console"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\EGIC-Launcher.ps1" -Page %PAGE%
if errorlevel 1 pause
