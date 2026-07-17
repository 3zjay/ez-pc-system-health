# EZ PC System Health - Windows PowerShell Setup Script
# Run with: Right-click -> "Run with PowerShell"
# Or in PowerShell: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass; .\setup.ps1

$Host.UI.RawUI.WindowTitle = "EZ PC System Health - Setup"

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host "    EZ PC System Health - Windows Setup" -ForegroundColor Cyan
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host ""

# ----------------------------------------------------------------
# STEP 1 - Execution Policy
# ----------------------------------------------------------------
$policy = Get-ExecutionPolicy -Scope Process
if ($policy -eq "Restricted") {
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
}

# ----------------------------------------------------------------
# STEP 2 - Check winget
# ----------------------------------------------------------------
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "  [!] winget (Windows Package Manager) not found." -ForegroundColor Red
    Write-Host "      Install it from: https://aka.ms/getwinget" -ForegroundColor Yellow
    Write-Host "      (It's already included on Windows 11 and Windows 10 21H1+)" -ForegroundColor Gray
    Read-Host "  Press Enter to exit"
    exit 1
}
Write-Host "  [OK] Windows Package Manager (winget) found." -ForegroundColor Green

# ----------------------------------------------------------------
# Helper: Refresh PATH in the current session after winget installs
# ----------------------------------------------------------------
function Refresh-Path {
    $machinePath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    $userPath    = [System.Environment]::GetEnvironmentVariable("PATH", "User")
    $env:PATH    = "$machinePath;$userPath"
}

# ----------------------------------------------------------------
# STEP 3 - Check / Install Node.js
# ----------------------------------------------------------------
$nodeExe = "C:\Program Files\nodejs\node.exe"
$npmCmd  = "C:\Program Files\nodejs\npm.cmd"

# Try PATH first, then the well-known install location
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd -and (Test-Path $nodeExe)) { $nodeCmd = @{ Source = $nodeExe } }

if (-not $nodeCmd) {
    Write-Host ""
    Write-Host "  [..] Node.js not found. Installing LTS version via winget..." -ForegroundColor Yellow
    winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [!] winget install failed. Install Node.js manually: https://nodejs.org/en/download" -ForegroundColor Red
        Read-Host "  Press Enter to exit"
        exit 1
    }
    Write-Host "  [OK] Node.js installed." -ForegroundColor Green
    Refresh-Path
    # Verify it is now reachable
    if (-not (Test-Path $nodeExe)) {
        Write-Host "  [!] Node.js binary not found at expected path after install." -ForegroundColor Red
        Write-Host "      Please CLOSE this window and re-run setup.ps1." -ForegroundColor Yellow
        Read-Host "  Press Enter to exit"
        exit 0
    }
} else {
    $nodeVersion = (& $nodeExe -v 2>$null)
    if (-not $nodeVersion) { $nodeVersion = (node -v 2>$null) }
    $nodeMajor   = [int]($nodeVersion -replace 'v(\d+)\..*','$1')
    Write-Host "  [OK] Node.js found: $nodeVersion" -ForegroundColor Green

    if ($nodeMajor -lt 18) {
        Write-Host ""
        Write-Host "  [!] Node.js $nodeVersion is outdated (need v18+). Upgrading..." -ForegroundColor Yellow
        winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        Refresh-Path
        Write-Host "  [OK] Node.js upgraded." -ForegroundColor Green
    }
}

# Ensure we always use the full path if the session PATH is stale
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Refresh-Path
}
$resolvedNode = if (Get-Command node -ErrorAction SilentlyContinue) { "node" } else { $nodeExe }
$resolvedNpm  = if (Get-Command npm  -ErrorAction SilentlyContinue) { "npm"  } else { $npmCmd  }

# ----------------------------------------------------------------
# STEP 4 - Check / Install Git
# ----------------------------------------------------------------
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "  [..] Git not found. Installing..." -ForegroundColor Yellow
    winget install --id Git.Git --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
    Write-Host "  [OK] Git installed." -ForegroundColor Green
} else {
    $gitVersion = (git --version)
    Write-Host "  [OK] Git found: $gitVersion" -ForegroundColor Green
}

# ----------------------------------------------------------------
# STEP 5 - npm install
# ----------------------------------------------------------------
Write-Host ""
Write-Host "  [..] Installing project dependencies..." -ForegroundColor Yellow
& $resolvedNpm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [!] npm install failed. Check your internet connection." -ForegroundColor Red
    Read-Host "  Press Enter to exit"
    exit 1
}
Write-Host "  [OK] All dependencies installed." -ForegroundColor Green

# ----------------------------------------------------------------
# STEP 6 - Sensor tip
# ----------------------------------------------------------------
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor DarkGray
Write-Host "   OPTIONAL: CPU/GPU Temperature Sensors" -ForegroundColor DarkGray
Write-Host "  ============================================================" -ForegroundColor DarkGray
Write-Host "   For temperature readings, download and run:" -ForegroundColor Gray
Write-Host "   OpenHardwareMonitor -> https://openhardwaremonitor.org/" -ForegroundColor Gray
Write-Host "   Keep it running alongside EZ PC System Health." -ForegroundColor Gray
Write-Host "  ============================================================" -ForegroundColor DarkGray
Write-Host ""

# ----------------------------------------------------------------
# STEP 7 - Launch
# ----------------------------------------------------------------
Write-Host "  [..] Launching EZ PC System Health..." -ForegroundColor Cyan
Write-Host "       Dashboard: http://localhost:4000" -ForegroundColor White
Write-Host "       Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""
& $resolvedNode server/index.js
