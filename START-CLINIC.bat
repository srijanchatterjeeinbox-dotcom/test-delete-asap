@echo off
title Dr. Pandey Clinic
setlocal enabledelayedexpansion

cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -File "%~dp0launcher\start-clinic.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [Launcher stopped with exit code %ERRORLEVEL%]
    pause
)

