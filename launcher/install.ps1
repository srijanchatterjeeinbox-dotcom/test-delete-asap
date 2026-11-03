# ==============================================================================
# Dr. Pandey's Healthcare (DPHC) & Research Centre - Launcher Installer
# ==============================================================================
# Verifies system environment, checks dependencies, generates clinic icon,
# secures database backup, and creates desktop shortcuts.

$ErrorActionPreference = "Continue"
$Host.UI.RawUI.WindowTitle = "Dr. Pandey Clinic - System Setup & Installation"

Clear-Host
Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "      DR. PANDEY'S HEALTHCARE & RESEARCH CENTRE (DPHC), GREATER NOIDA           " -ForegroundColor Yellow
Write-Host "                Desktop Launcher Installation & Verification                    " -ForegroundColor White
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

$projectDir = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $projectDir

# ------------------------------------------------------------------------------
# 1. Environment & Prerequisites Check
# ------------------------------------------------------------------------------
Write-Host "[1/7] Checking runtime prerequisites..." -ForegroundColor Cyan

# Node.js
$nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "  [FAIL] Node.js is not installed or not in PATH!" -ForegroundColor Red
    Write-Host "         Please install Node.js (v18+) from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}
$nodeVer = (& node -v).Trim()
Write-Host "  [OK] Node.js: $nodeVer" -ForegroundColor Green

# npm
$npmCmd = Get-Command "npm" -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    Write-Host "  [FAIL] npm is not installed or not in PATH!" -ForegroundColor Red
    exit 1
}
$npmVer = (& npm -v).Trim()
Write-Host "  [OK] npm: v$npmVer" -ForegroundColor Green

# cloudflared
$cfCmd = Get-Command "cloudflared" -ErrorAction SilentlyContinue
if (-not $cfCmd) {
    Write-Host "  [!] cloudflared was not found in PATH." -ForegroundColor Yellow
    Write-Host "      Attempting to locate or provide setup instructions..." -ForegroundColor Yellow
    Write-Host "      You can download it from: https://github.com/cloudflare/cloudflared/releases" -ForegroundColor Gray
} else {
    $cfVer = (& cloudflared --version).Trim()
    Write-Host "  [OK] $cfVer" -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# 2. Workspace Directories
# ------------------------------------------------------------------------------
Write-Host "[2/7] Initializing system directories..." -ForegroundColor Cyan
$requiredDirs = @(
    (Join-Path $projectDir "data"),
    (Join-Path $projectDir "data\logs"),
    (Join-Path $projectDir "data\pids"),
    (Join-Path $projectDir "data\backups"),
    (Join-Path $projectDir "assets"),
    (Join-Path $projectDir "public")
)
foreach ($dir in $requiredDirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}
Write-Host "  [OK] Data, logs, pids, and backups directories verified." -ForegroundColor Green

# ------------------------------------------------------------------------------
# 3. Dependencies & better-sqlite3 Verification
# ------------------------------------------------------------------------------
Write-Host "[3/7] Verifying Node packages and SQLite native addon..." -ForegroundColor Cyan
if (-not (Test-Path "$projectDir\node_modules")) {
    Write-Host "  Installing project dependencies (this may take a minute)..." -ForegroundColor Yellow
    & npm install --no-audit --no-fund
}

$sqliteTestScript = "try { const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.prepare('SELECT 1').get(); console.log('OK'); } catch(e) { console.error(e.message); process.exit(1); }"
$sqliteStatus = & node -e $sqliteTestScript 2>&1
if ($LASTEXITCODE -eq 0 -and $sqliteStatus -like "*OK*") {
    Write-Host "  [OK] better-sqlite3 native engine is functioning normally." -ForegroundColor Green
} else {
    Write-Host "  [!] Warning on better-sqlite3: $sqliteStatus" -ForegroundColor Yellow
    Write-Host "      Running npm rebuild better-sqlite3..." -ForegroundColor Gray
    & npm rebuild better-sqlite3
}

# ------------------------------------------------------------------------------
# 4. Environment (.env) Configuration Check
# ------------------------------------------------------------------------------
Write-Host "[4/7] Verifying environment configuration..." -ForegroundColor Cyan
$envPath = Join-Path $projectDir ".env"
$envExamplePath = Join-Path $projectDir ".env.example"

if (Test-Path $envPath) {
    Write-Host "  [OK] Existing .env file found (preserved untouched)." -ForegroundColor Green
    $envContent = Get-Content $envPath -Raw
    $hasGemini = $envContent -match "GEMINI_API_KEY=\s*([^\s\r\n]+)"
    if ($hasGemini -and $matches[1] -ne "your_gemini_api_key_here") {
        Write-Host "  [OK] AI Receptionist API Key is configured." -ForegroundColor Green
    } else {
        Write-Host "  [!] GEMINI_API_KEY is not configured in .env. AI receptionist will run in offline knowledge mode." -ForegroundColor Yellow
    }
} else {
    if (Test-Path $envExamplePath) {
        Copy-Item -Path $envExamplePath -Destination $envPath
        Write-Host "  [OK] Created default .env from template (no existing data overwritten)." -ForegroundColor Green
    } else {
        "PORT=3000`nNODE_ENV=production`n" | Out-File -FilePath $envPath -Encoding utf8
        Write-Host "  [OK] Created minimal .env configuration." -ForegroundColor Green
    }
}

# ------------------------------------------------------------------------------
# 5. Icon Generation
# ------------------------------------------------------------------------------
Write-Host "[5/7] Verifying clinic logo icon..." -ForegroundColor Cyan
$iconPath = Join-Path $projectDir "assets\logo.ico"
if (-not (Test-Path $iconPath)) {
    Write-Host "  Generating multi-resolution Windows .ico from clinic logo..." -ForegroundColor Yellow
    & "$PSScriptRoot\generate-icon.ps1"
}
if (Test-Path $iconPath) {
    $icoSize = (Get-Item $iconPath).Length
    Write-Host "  [OK] Official icon ready at assets\logo.ico ($([math]::Round($icoSize/1KB, 1)) KB)" -ForegroundColor Green
} else {
    Write-Host "  [!] Warning: Icon could not be generated. Shortcuts will use default Windows icon." -ForegroundColor Yellow
}

# ------------------------------------------------------------------------------
# 6. Database Safety & Backup Check
# ------------------------------------------------------------------------------
Write-Host "[6/7] Running initial database backup..." -ForegroundColor Cyan
$backupScript = Join-Path $PSScriptRoot "backup-db.js"
if (Test-Path $backupScript) {
    & node $backupScript
}

# ------------------------------------------------------------------------------
# 7. Desktop Shortcut Creation
# ------------------------------------------------------------------------------
Write-Host "[7/7] Creating Windows desktop shortcuts..." -ForegroundColor Cyan
$shortcutScript = Join-Path $PSScriptRoot "create-shortcuts.ps1"
& powershell -NoProfile -ExecutionPolicy Bypass -File $shortcutScript

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Green
Write-Host "                      INSTALLATION COMPLETED SUCCESSFULLY!                      " -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  You can now start Dr. Pandey Clinic at any time by double-clicking:" -ForegroundColor White
Write-Host "  -> 'Dr. Pandey Clinic' on your Desktop" -ForegroundColor Green
Write-Host ""
Write-Host "  To stop the clinic anytime, double-click:" -ForegroundColor White
Write-Host "  -> 'Stop Dr. Pandey Clinic' on your Desktop" -ForegroundColor Cyan
Write-Host ""
if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
    Write-Host "Press any key to exit installer..." -ForegroundColor Gray
    try { $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") } catch {}
}
