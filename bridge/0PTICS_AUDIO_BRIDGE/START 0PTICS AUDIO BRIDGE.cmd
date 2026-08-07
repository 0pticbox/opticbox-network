@echo off
setlocal
cd /d "%~dp0"
title 0PTIC'S AUDIO BRIDGE
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp00ptics-audio-bridge.ps1"
endlocal
