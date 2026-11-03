@echo off
title Dr. Pandey Clinic - Setup and Installation
setlocal enabledelayedexpansion

cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -File "%~dp0launcher\install.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [Installation encountered an issue. Exit code: %ERRORLEVEL%]
    pause
)

