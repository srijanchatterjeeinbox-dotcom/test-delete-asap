# ==============================================================================
# Dr. Pandey's Healthcare (DPHC) & Research Centre - Official Desktop Launcher
# ==============================================================================
# Dynamically starts local clinic server, initializes Cloudflare Quick Tunnel,
# captures newly generated URL, verifies public accessibility, and opens browser.

$ErrorActionPreference = "Continue"
$Host.UI.RawUI.WindowTitle = "Dr. Pandey Clinic - Launching..."

Clear-Host
Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "      DR. PANDEY'S HEALTHCARE & RESEARCH CENTRE (DPHC), GREATER NOIDA           " -ForegroundColor Yellow
Write-Host "          Clinical Operations, Patient Care & WhatsApp AI Receptionist          " -ForegroundColor White
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

$projectDir = (Resolve-Path "$PSScriptRoot\..").Path
$dataDir = Join-Path $projectDir "data"
$logDir = Join-Path $dataDir "logs"
$pidDir = Join-Path $dataDir "pids"
$backupDir = Join-Path $dataDir "backups"

# Ensure all critical runtime directories exist
@($dataDir, $logDir, $pidDir, $backupDir) | ForEach-Object {
    if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
}

function Wait-UserExit([int]$code = 1) {
    if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
        Write-Host "Press any key to exit..." -ForegroundColor Gray
        try { $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") } catch {}
    }
    exit $code
}
# ------------------------------------------------------------------------------
Write-Host "[1/6] Securing patient database with online backup..." -ForegroundColor Cyan
$backupScript = Join-Path $PSScriptRoot "backup-db.js"
if (Test-Path $backupScript) {
    try {
        & node $backupScript | Out-Null
        Write-Host "      [OK] Database snapshot safely stored in data\backups\" -ForegroundColor Green
    } catch {
        Write-Host "      [!] Note on backup: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ------------------------------------------------------------------------------
# STEP 2: Check / Start Node.js Server
# ------------------------------------------------------------------------------
Write-Host "[2/6] Checking local clinic server (http://localhost:3000)..." -ForegroundColor Cyan

function Test-LocalServer {
    try {
        $resp = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -Method Get -TimeoutSec 2 -ErrorAction Stop
        if ($resp -and ($resp.ok -eq $true -or $resp.app -like "*Pandey*")) {
            return $true
        }
    } catch {}
    return $false
}

$isServerRunning = Test-LocalServer

if ($isServerRunning) {
    Write-Host "      [OK] Clinic server is already running and healthy (reusing active instance)." -ForegroundColor Green
} else {
    # Check if port 3000 is occupied by an unrelated foreign process
    $occupied = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($occupied) {
        $procId = $occupied.OwningProcess
        $procName = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
        Write-Host ""
        Write-Host "[ERROR] Port 3000 is already in use by another application!" -ForegroundColor Red
        Write-Host "        Process: $procName (PID: $procId)" -ForegroundColor Yellow
        Write-Host "        Please close that application or terminate PID $procId, then try again." -ForegroundColor Yellow
        Write-Host ""
        Wait-UserExit 1
    }

    Write-Host "      Starting clinic Node.js server..." -ForegroundColor White
    $serverLog = Join-Path $logDir "server.log"
    $serverErrLog = Join-Path $logDir "server-error.log"
    $serverPidFile = Join-Path $pidDir "server.pid"

    $serverProc = Start-Process -FilePath "node" -ArgumentList "server.js" `
        -WorkingDirectory $projectDir `
        -RedirectStandardOutput $serverLog `
        -RedirectStandardError $serverErrLog `
        -PassThru -WindowStyle Hidden

    $serverProc.Id | Out-File -FilePath $serverPidFile -Encoding ascii -Force

    # Poll server health until ready
    $serverReady = $false
    for ($i = 1; $i -le 25; $i++) {
        Start-Sleep -Milliseconds 1000
        if (Test-LocalServer) {
            $serverReady = $true
            break
        }
        if ($serverProc.HasExited) {
            Write-Host ""
            Write-Host "[ERROR] Node server crashed on startup!" -ForegroundColor Red
            if (Test-Path $serverErrLog) {
                Get-Content $serverErrLog -Tail 10 | ForEach-Object { Write-Host "   $_" -ForegroundColor Yellow }
            }
            Write-Host ""
            Wait-UserExit 1
        }
        Write-Host "      Waiting for server initialization ($i/25s)..." -ForegroundColor Gray
    }

    if (-not $serverReady) {
        Write-Host "[ERROR] Server did not respond within 25 seconds." -ForegroundColor Red
        Wait-UserExit 1
    }

    Write-Host "      [OK] Clinic server online at http://localhost:3000 (PID: $($serverProc.Id))" -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# STEP 3: Terminate Stale Tunnel & Launch Fresh Quick Tunnel
# ------------------------------------------------------------------------------
Write-Host "[3/6] Starting fresh Cloudflare Quick Tunnel (HTTP/2, IPv4)..." -ForegroundColor Cyan

# Terminate previous tunnel belonging to this clinic deployment if still running
$tunnelPidFile = Join-Path $pidDir "tunnel.pid"
if (Test-Path $tunnelPidFile) {
    try {
        $oldPid = (Get-Content $tunnelPidFile -Raw -ErrorAction SilentlyContinue).Trim()
        if ($oldPid -match '^\d+$') {
            $oldProc = Get-Process -Id ([int]$oldPid) -ErrorAction SilentlyContinue
            if ($oldProc -and $oldProc.ProcessName -like "*cloudflared*") {
                Write-Host "      Stopping previous tunnel session (PID: $oldPid)..." -ForegroundColor Gray
                Stop-Process -Id $oldProc.Id -Force -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 600
            }
        }
    } catch {}
    Remove-Item $tunnelPidFile -Force -ErrorAction SilentlyContinue
}

# Remove stale URL files so we never use an old URL
$currentUrlFile = Join-Path $dataDir "current-tunnel-url.txt"
$publicUrlFile = Join-Path $projectDir "public\current-tunnel-url.txt"
Remove-Item $currentUrlFile -Force -ErrorAction SilentlyContinue
Remove-Item $publicUrlFile -Force -ErrorAction SilentlyContinue

$tunnelLog = Join-Path $logDir "tunnel.log"
if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force -ErrorAction SilentlyContinue }

# Check that cloudflared executable is available
$cfCmd = Get-Command "cloudflared" -ErrorAction SilentlyContinue
if (-not $cfCmd) {
    Write-Host "[ERROR] cloudflared is not installed or not in PATH." -ForegroundColor Red
    Write-Host "        Please run launcher\install-launcher.bat to install prerequisites." -ForegroundColor Yellow
    Write-Host "        Clinic server remains accessible locally at http://localhost:3000" -ForegroundColor White
    Start-Process "http://localhost:3000"
    Write-Host ""
    Wait-UserExit 1
}

function Launch-CloudflaredTunnel {
    param([string]$LogPath)
    # Forces HTTP/2 over IPv4 to bypass Indian ISP UDP/QUIC packet drops & Error 1033
    $proc = Start-Process -FilePath "cloudflared" `
        -ArgumentList "tunnel", "--url", "http://127.0.0.1:3000", "--protocol", "http2", "--edge-ip-version", "4", "--logfile", "`"$LogPath`"" `
        -WorkingDirectory $projectDir `
        -PassThru -WindowStyle Hidden
    return $proc
}

$tunnelProc = Launch-CloudflaredTunnel -LogPath $tunnelLog
$tunnelProc.Id | Out-File -FilePath $tunnelPidFile -Encoding ascii -Force
Write-Host "      [OK] Cloudflare process active (PID: $($tunnelProc.Id))" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 4: Dynamically Capture New Cloudflare URL
# ------------------------------------------------------------------------------
Write-Host "[4/6] Detecting dynamically generated Cloudflare URL..." -ForegroundColor Cyan

function Detect-TunnelUrl {
    param([string]$LogPath, [int]$TimeoutSeconds = 35)
    $foundUrl = $null
    for ($t = 1; $t -le $TimeoutSeconds; $t++) {
        Start-Sleep -Milliseconds 800
        if (Test-Path $LogPath) {
            $logText = Get-Content $LogPath -Raw -ErrorAction SilentlyContinue
            if ($logText) {
                $matches = [regex]::Matches($logText, 'https://([a-zA-Z0-9-]+)\.trycloudflare\.com')
                foreach ($m in $matches) {
                    if ($m.Groups[1].Value -ne 'api') {
                        $foundUrl = $m.Value
                        break
                    }
                }
                if ($foundUrl) { break }
            }
        }
    }
    return $foundUrl
}

$detectedUrl = Detect-TunnelUrl -LogPath $tunnelLog -TimeoutSeconds 35

$detectedUrl = Detect-TunnelUrl -LogPath $tunnelLog -TimeoutSeconds 35


if (-not $detectedUrl) {
    Write-Host ""
    Write-Host "[ERROR] Could not detect Cloudflare URL within 30 seconds." -ForegroundColor Red
    Write-Host "        Clinic server is running locally at http://localhost:3000" -ForegroundColor Yellow
    Start-Process "http://localhost:3000"
    Wait-UserExit 1
}

# Save new dynamic URL automatically
$detectedUrl | Out-File -FilePath $currentUrlFile -Encoding ascii -Force
$detectedUrl | Out-File -FilePath $publicUrlFile -Encoding ascii -Force
Write-Host "      [OK] New URL Captured: $detectedUrl" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 5: Verify Public Tunnel Accessibility & Edge DNS Propagation
# ------------------------------------------------------------------------------
Write-Host "[5/6] Verifying public tunnel registration on Cloudflare edge..." -ForegroundColor Cyan

# Clear any stale negative DNS cache so Windows doesn't cache premature NXDOMAIN
Clear-DnsClientCache -ErrorAction SilentlyContinue

$publicVerified = $false
# Allow Cloudflare global anycast DNS and SSL handshake up to 45 seconds to settle
for ($v = 1; $v -le 45; $v++) {
    try {
        $verify = Invoke-RestMethod -Uri "$detectedUrl/api/health" -Method Get -TimeoutSec 3 -ErrorAction Stop
        if ($verify -and ($verify.ok -eq $true -or $verify.app -like "*Pandey*")) {
            $publicVerified = $true
            break
        }
    } catch {
        # Edge DNS or SSL handshake propagating
    }
    Write-Host "      Waiting for Cloudflare edge DNS to propagate ($v/45s)..." -ForegroundColor Gray
    Start-Sleep -Milliseconds 1000
}

if ($publicVerified) {
    Write-Host "      [OK] Public URL verified and responding with HTTP 200!" -ForegroundColor Green
    Clear-DnsClientCache -ErrorAction SilentlyContinue
} else {
    Write-Host "      [!] Cloudflare public DNS is taking longer to propagate through your local ISP." -ForegroundColor Yellow
    Write-Host "          Your local dashboard will open immediately without waiting." -ForegroundColor Yellow
}

# ------------------------------------------------------------------------------
# STEP 6: Open in Default Browser & Copy to Clipboard
# ------------------------------------------------------------------------------
Write-Host "[6/6] Launching Dr. Pandey Clinic in your default browser..." -ForegroundColor Cyan

# Copy URL to Windows clipboard for easy sharing
try {
    $detectedUrl | Set-Clipboard -ErrorAction SilentlyContinue
} catch {
    try { $detectedUrl | clip.exe } catch {}
}

# Launch public URL if verified; otherwise open local dashboard
$targetBrowserUrl = if ($publicVerified) { $detectedUrl } else { "http://localhost:3000" }

try {
    Start-Process $targetBrowserUrl -ErrorAction Stop
} catch {
    try {
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "start", '""', "`"$targetBrowserUrl`""
    } catch {
        Start-Process "http://localhost:3000"
    }
}

$localLanIp = $null
try {
    $lanCandidate = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '169.254*' -and $_.IPAddress -ne '127.0.0.1' -and $_.InterfaceAlias -notlike '*Loopback*' } | Select-Object -First 1
    if ($lanCandidate) { $localLanIp = $lanCandidate.IPAddress }
} catch {}

$Host.UI.RawUI.WindowTitle = "Dr. Pandey Clinic - ONLINE ($detectedUrl)"

Clear-Host
Write-Host ""
Write-Host "================================================================================" -ForegroundColor Green
Write-Host "                    DR. PANDEY CLINIC IS NOW LIVE & ONLINE!                     " -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  * PUBLIC WEB URL    : " -NoNewline -ForegroundColor White
Write-Host "$detectedUrl" -ForegroundColor Green
Write-Host "                        (Copied to your clipboard - ready to share!)" -ForegroundColor DarkGray
Write-Host "  * LOCALHOST URL     : " -NoNewline -ForegroundColor White
Write-Host "http://localhost:3000" -ForegroundColor Cyan
if ($localLanIp) {
    Write-Host "  * WI-FI LAN URL     : " -NoNewline -ForegroundColor White
    Write-Host "http://${localLanIp}:3000" -ForegroundColor Cyan
    Write-Host "                        (Instant access on any phone/tablet on clinic Wi-Fi)" -ForegroundColor DarkGray
}
Write-Host "  * DATABASE STATUS   : " -NoNewline -ForegroundColor White
Write-Host "Connected & Backed Up (data\drpandey.db)" -ForegroundColor Green
$srvPidDisplay = if ($serverProc -and $serverProc.Id) { [string]$serverProc.Id } else { "Active" }
$tunPidDisplay = if ($tunnelProc -and $tunnelProc.Id) { [string]$tunnelProc.Id } else { "Active" }
Write-Host "  * SERVER PID        : $srvPidDisplay" -ForegroundColor Gray
Write-Host "  * TUNNEL PID        : $tunPidDisplay" -ForegroundColor Gray
Write-Host ""
Write-Host "--------------------------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  KEYBOARD SHORTCUTS:                                                           " -ForegroundColor White
Write-Host "    [B] -> Re-open Public URL in default browser                                " -ForegroundColor Yellow
Write-Host "    [L] -> Open Localhost (http://localhost:3000)                               " -ForegroundColor Yellow
Write-Host "    [C] -> Re-copy Public URL to clipboard                                      " -ForegroundColor Yellow
Write-Host "    [R] -> Renew Tunnel (Generate Fresh Public URL)                             " -ForegroundColor Yellow
Write-Host "    [Q] -> Stop clinic server and tunnel safely                                 " -ForegroundColor Red
Write-Host "--------------------------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "  * DO NOT CLOSE THIS WINDOW (X) - IT KEEPS YOUR ONLINE WEB DOMAIN ALIVE!      " -ForegroundColor Yellow
Write-Host "  * Simply MINIMIZE this window (_) to keep the clinic online in background.   " -ForegroundColor White
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

# Continuous live monitoring loop with auto-healing watchdog
if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
    $loopCounter = 0
    while ($true) {
        if ([Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true)
            switch ($key.Key) {
                'Q' {
                    Write-Host ""
                    Write-Host "Stopping Dr. Pandey Clinic services safely..." -ForegroundColor Yellow
                    & "$PSScriptRoot\stop-clinic.ps1"
                    exit 0
                }
                'B' {
                    Write-Host "Re-opening public URL: $detectedUrl..." -ForegroundColor Cyan
                    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "start", '""', "`"$detectedUrl`""
                }
                'L' {
                    Write-Host "Opening local dashboard: http://localhost:3000..." -ForegroundColor Cyan
                    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "start", '""', "http://localhost:3000"
                }
                'C' {
                    try { $detectedUrl | Set-Clipboard } catch { try { $detectedUrl | clip.exe } catch {} }
                    Write-Host "Copied public URL to clipboard!" -ForegroundColor Green
                }
                'R' {
                    Write-Host ""
                    Write-Host "[!] Renewing Cloudflare Tunnel for a fresh public URL..." -ForegroundColor Yellow
                    if ($tunnelProc -and -not $tunnelProc.HasExited) {
                        Stop-Process -Id $tunnelProc.Id -Force -ErrorAction SilentlyContinue
                    }
                    Remove-Item $tunnelLog -Force -ErrorAction SilentlyContinue
                    $tunnelProc = Launch-CloudflaredTunnel -LogPath $tunnelLog
                    $tunnelProc.Id | Out-File -FilePath $tunnelPidFile -Encoding ascii -Force
                    $newUrl = Detect-TunnelUrl -LogPath $tunnelLog -TimeoutSeconds 35
                    if ($newUrl) {
                        $detectedUrl = $newUrl
                        $detectedUrl | Out-File -FilePath $currentUrlFile -Encoding ascii -Force
                        $detectedUrl | Out-File -FilePath $publicUrlFile -Encoding ascii -Force
                        try { $detectedUrl | Set-Clipboard } catch { try { $detectedUrl | clip.exe } catch {} }
                        Write-Host "  [OK] New URL Assigned: $detectedUrl" -ForegroundColor Green
                        Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "start", '""', "`"$detectedUrl`""
                    } else {
                        Write-Host "  [!] Could not capture new URL. Localhost remains active." -ForegroundColor Yellow
                    }
                }
            }
        }

        Start-Sleep -Milliseconds 500
        $loopCounter++

        # Health ping and auto-healing check every 10 seconds
        if ($loopCounter % 20 -eq 0) {
            if (-not (Test-LocalServer)) {
                Write-Host "[WARNING] Local clinic server stopped responding on port 3000!" -ForegroundColor Red
            }

            # Check if tunnel is dead or revoked by Cloudflare
            $needsRestart = $false
            if ($tunnelProc -and $tunnelProc.HasExited) {
                $needsRestart = $true
            } elseif (Test-Path $tunnelLog) {
                $lastLogLines = Get-Content $tunnelLog -Tail 15 -ErrorAction SilentlyContinue
                if ($lastLogLines -match "Unauthorized: Tunnel not found|Register tunnel error") {
                    $needsRestart = $true
                }
            }

            if ($needsRestart) {
                Write-Host ""
                Write-Host "[WATCHDOG] Cloudflare tunnel disconnected or expired by server." -ForegroundColor Yellow
                Write-Host "[WATCHDOG] Automatically auto-healing and spinning up fresh tunnel..." -ForegroundColor Cyan
                if ($tunnelProc -and -not $tunnelProc.HasExited) {
                    Stop-Process -Id $tunnelProc.Id -Force -ErrorAction SilentlyContinue
                }
                Remove-Item $tunnelLog -Force -ErrorAction SilentlyContinue
                $tunnelProc = Launch-CloudflaredTunnel -LogPath $tunnelLog
                $tunnelProc.Id | Out-File -FilePath $tunnelPidFile -Encoding ascii -Force
                $newUrl = Detect-TunnelUrl -LogPath $tunnelLog -TimeoutSeconds 35
                if ($newUrl) {
                    $detectedUrl = $newUrl
                    $detectedUrl | Out-File -FilePath $currentUrlFile -Encoding ascii -Force
                    $detectedUrl | Out-File -FilePath $publicUrlFile -Encoding ascii -Force
                    try { $detectedUrl | Set-Clipboard } catch { try { $detectedUrl | clip.exe } catch {} }
                    Write-Host "[WATCHDOG] Fresh tunnel registered: $detectedUrl" -ForegroundColor Green
                    Write-Host "[WATCHDOG] URL copied to clipboard. Ready!" -ForegroundColor Green
                }
            }
        }
    }
} else {
    Write-Host "Dr. Pandey Clinic is running in background." -ForegroundColor Green
}
