@echo off
title Stop Dr. Pandey Clinic
setlocal enabledelayedexpansion

cd /d "%~dp0.."

powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -File "%~dp0stop-clinic.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [Stop script stopped with exit code %ERRORLEVEL%]
    pause
)

