# ==============================================================================
# Dr. Pandey's Healthcare (DPHC) - Desktop Shortcut Generator
# ==============================================================================
# Creates polished Windows Desktop shortcuts with the official clinic logo icon.

$ErrorActionPreference = "Continue"

$projectDir = (Resolve-Path "$PSScriptRoot\..").Path
$iconPath = Join-Path $projectDir "assets\logo.ico"
$startBat = Join-Path $projectDir "START-CLINIC.bat"
$stopBat = Join-Path $projectDir "STOP-CLINIC.bat"

# Verify required files exist
if (-not (Test-Path $iconPath)) {
    Write-Host "[!] Generating clinic logo icon first..." -ForegroundColor Yellow
    & "$PSScriptRoot\generate-icon.ps1"
}

if (-not (Test-Path $iconPath)) {
    Write-Host "[ERROR] Could not find or generate icon at $iconPath" -ForegroundColor Red
    exit 1
}

# Determine all valid desktop locations (supports standard user desktop and OneDrive desktop)
$desktops = [System.Collections.Generic.List[string]]::new()

$specialDesktop = [Environment]::GetFolderPath('Desktop')
if ($specialDesktop -and (Test-Path $specialDesktop)) {
    $desktops.Add($specialDesktop)
}

$userDesktop = Join-Path $env:USERPROFILE "Desktop"
if ((Test-Path $userDesktop) -and (-not $desktops.Contains($userDesktop))) {
    $desktops.Add($userDesktop)
}

if ($env:OneDrive) {
    $oneDriveDesktop = Join-Path $env:OneDrive "Desktop"
    if ((Test-Path $oneDriveDesktop) -and (-not $desktops.Contains($oneDriveDesktop))) {
        $desktops.Add($oneDriveDesktop)
    }
}

$wshShell = New-Object -ComObject WScript.Shell

foreach ($desktopPath in $desktops) {
    try {
        # 1. Main Launcher Shortcut: "Dr. Pandey Clinic.lnk"
        $shortcutPath = Join-Path $desktopPath "Dr. Pandey Clinic.lnk"
        $shortcut = $wshShell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $startBat
        $shortcut.WorkingDirectory = $projectDir
        $shortcut.IconLocation = "$iconPath,0"
        $shortcut.Description = "Launch Dr. Pandey's Healthcare & Research Centre Clinic & WhatsApp AI"
        $shortcut.WindowStyle = 1 # Normal Window
        $shortcut.Save()
        Write-Host "  [OK] Created shortcut: $shortcutPath" -ForegroundColor Green

        # 2. Stop Shortcut: "Stop Dr. Pandey Clinic.lnk"
        $stopShortcutPath = Join-Path $desktopPath "Stop Dr. Pandey Clinic.lnk"
        $stopShortcut = $wshShell.CreateShortcut($stopShortcutPath)
        $stopShortcut.TargetPath = $stopBat
        $stopShortcut.WorkingDirectory = $projectDir
        $stopShortcut.IconLocation = "$iconPath,0"
        $stopShortcut.Description = "Safely stop Dr. Pandey Clinic Server and Tunnel"
        $stopShortcut.WindowStyle = 1
        $stopShortcut.Save()
        Write-Host "  [OK] Created stop shortcut: $stopShortcutPath" -ForegroundColor Green
    } catch {
        Write-Host "  [!] Error creating shortcut in $desktopPath`: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Desktop shortcuts created successfully!" -ForegroundColor Green

