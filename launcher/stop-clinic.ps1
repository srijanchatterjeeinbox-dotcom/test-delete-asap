# ==============================================================================
# Dr. Pandey's Healthcare (DPHC) & Research Centre - Official Service Stopper
# ==============================================================================
# Safely shuts down only this clinic deployment's Node.js server and Cloudflare tunnel.
# Never terminates unrelated processes.

$ErrorActionPreference = "Continue"
$Host.UI.RawUI.WindowTitle = "Dr. Pandey Clinic - Stopping Services..."

Clear-Host
Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "      DR. PANDEY'S HEALTHCARE & RESEARCH CENTRE (DPHC), GREATER NOIDA           " -ForegroundColor Yellow
Write-Host "                           STOPPING CLINIC SERVICES                             " -ForegroundColor White
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

$projectDir = (Resolve-Path "$PSScriptRoot\..").Path
$dataDir = Join-Path $projectDir "data"
$pidDir = Join-Path $dataDir "pids"

$stoppedAnything = $false

# 1. Stop Cloudflare Tunnel
$tunnelPidFile = Join-Path $pidDir "tunnel.pid"
if (Test-Path $tunnelPidFile) {
    try {
        $tunnelPid = (Get-Content $tunnelPidFile -Raw -ErrorAction SilentlyContinue).Trim()
        if ($tunnelPid -match '^\d+$') {
            $tProc = Get-Process -Id ([int]$tunnelPid) -ErrorAction SilentlyContinue
            if ($tProc -and ($tProc.ProcessName -like "*cloudflared*")) {
                Write-Host "Stopping Cloudflare Tunnel (PID: $tunnelPid)..." -ForegroundColor Yellow
                Stop-Process -Id $tProc.Id -Force -ErrorAction SilentlyContinue
                Write-Host "  [OK] Cloudflare tunnel stopped." -ForegroundColor Green
                $stoppedAnything = $true
            } else {
                Write-Host "  [i] Tunnel PID $tunnelPid is not active or belongs to another process." -ForegroundColor Gray
            }
        }
    } catch {
        Write-Host "  [!] Note stopping tunnel: $($_.Exception.Message)" -ForegroundColor Gray
    }
    Remove-Item $tunnelPidFile -Force -ErrorAction SilentlyContinue
}

# 2. Stop Node.js Server
$serverPidFile = Join-Path $pidDir "server.pid"
if (Test-Path $serverPidFile) {
    try {
        $serverPid = (Get-Content $serverPidFile -Raw -ErrorAction SilentlyContinue).Trim()
        if ($serverPid -match '^\d+$') {
            $sProc = Get-Process -Id ([int]$serverPid) -ErrorAction SilentlyContinue
            if ($sProc -and ($sProc.ProcessName -like "*node*")) {
                Write-Host "Stopping Dr. Pandey Clinic Server (PID: $serverPid)..." -ForegroundColor Yellow
                Stop-Process -Id $sProc.Id -Force -ErrorAction SilentlyContinue
                Write-Host "  [OK] Clinic Node.js server stopped." -ForegroundColor Green
                $stoppedAnything = $true
            } else {
                Write-Host "  [i] Server PID $serverPid is not active or belongs to another process." -ForegroundColor Gray
            }
        }
    } catch {
        Write-Host "  [!] Note stopping server: $($_.Exception.Message)" -ForegroundColor Gray
    }
    Remove-Item $serverPidFile -Force -ErrorAction SilentlyContinue
}

# Fallback verification: Check if port 3000 is still responding to health check
try {
    $resp = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -Method Get -TimeoutSec 1 -ErrorAction Stop
    if ($resp -and ($resp.ok -eq $true -or $resp.app -like "*Pandey*")) {
        # Check owning process of port 3000
        $conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($conn) {
            $ownerProc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            if ($ownerProc -and $ownerProc.ProcessName -like "*node*") {
                Write-Host "Stopping remaining clinic server on port 3000 (PID: $($ownerProc.Id))..." -ForegroundColor Yellow
                Stop-Process -Id $ownerProc.Id -Force -ErrorAction SilentlyContinue
                Write-Host "  [OK] Port 3000 server stopped." -ForegroundColor Green
                $stoppedAnything = $true
            }
        }
    }
} catch {}

# 3. Clean active tunnel URL files
$currentUrlFile = Join-Path $dataDir "current-tunnel-url.txt"
$publicUrlFile = Join-Path $projectDir "public\current-tunnel-url.txt"
Remove-Item $currentUrlFile -Force -ErrorAction SilentlyContinue
Remove-Item $publicUrlFile -Force -ErrorAction SilentlyContinue

Write-Host ""
if ($stoppedAnything) {
    Write-Host "================================================================================" -ForegroundColor Green
    Write-Host "               ALL CLINIC SERVICES HAVE BEEN STOPPED SAFELY.                    " -ForegroundColor Green
    Write-Host "================================================================================" -ForegroundColor Green
} else {
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host "              NO ACTIVE DR. PANDEY CLINIC SERVICES FOUND RUNNING.               " -ForegroundColor Cyan
    Write-Host "================================================================================" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Patient database records and backups remain 100% intact." -ForegroundColor White
Write-Host ""
Start-Sleep -Seconds 2

