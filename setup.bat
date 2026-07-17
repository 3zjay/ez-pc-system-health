@echo off
setlocal EnableDelayedExpansion
title EZ PC System Health - Windows Setup

echo.
echo  ============================================================
echo    EZ PC System Health - Windows Setup
echo  ============================================================
echo.

:: ----------------------------------------------------------------
:: STEP 1 - Check for winget (Windows Package Manager)
:: ----------------------------------------------------------------
where winget >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Windows Package Manager (winget) not found.
    echo      Please install it from the Microsoft Store:
    echo      https://aka.ms/getwinget
    echo.
    pause
    exit /b 1
)
echo  [OK] Windows Package Manager detected.

:: ----------------------------------------------------------------
:: STEP 2 - Check for Node.js (v18+)
:: ----------------------------------------------------------------
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [..] Node.js not found. Installing via winget...
    winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo  [!] winget install failed. Please install Node.js manually:
        echo      https://nodejs.org/en/download
        pause
        exit /b 1
    )
    echo  [OK] Node.js installed successfully.
    echo  [!] Please CLOSE this window and re-run setup.bat
    echo      so that Node.js is recognized by your terminal.
    pause
    exit /b 0
) else (
    for /f "tokens=1" %%v in ('node -v 2^>nul') do set NODE_VER=%%v
    echo  [OK] Node.js found: !NODE_VER!
    :: Check major version is >= 18
    for /f "tokens=2 delims=v." %%m in ("!NODE_VER!") do set MAJOR=%%m
    if !MAJOR! lss 18 (
        echo.
        echo  [!] Node.js !NODE_VER! is too old. Version 18 or higher required.
        echo      Upgrading via winget...
        winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        echo  [!] Please CLOSE this window and re-run setup.bat after upgrade.
        pause
        exit /b 0
    )
)

:: ----------------------------------------------------------------
:: STEP 3 - Check for Git
:: ----------------------------------------------------------------
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [..] Git not found. Installing via winget...
    winget install --id Git.Git --silent --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo  [!] winget install failed. Please install Git manually:
        echo      https://git-scm.com/download/win
        pause
        exit /b 1
    )
    echo  [OK] Git installed. Please CLOSE and re-run setup.bat.
    pause
    exit /b 0
) else (
    for /f "tokens=3" %%v in ('git --version') do set GIT_VER=%%v
    echo  [OK] Git found: !GIT_VER!
)

:: ----------------------------------------------------------------
:: STEP 4 - Install npm dependencies
:: ----------------------------------------------------------------
echo.
echo  [..] Installing project dependencies (npm install)...
call npm install
if %errorlevel% neq 0 (
    echo  [!] npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
)
echo  [OK] Dependencies installed.

:: ----------------------------------------------------------------
:: STEP 5 - Optional: OpenHardwareMonitor reminder for temp sensors
:: ----------------------------------------------------------------
echo.
echo  ============================================================
echo   OPTIONAL: For CPU/GPU Temperature Sensors
echo  ============================================================
echo   If you want temperature readings, download and run:
echo   OpenHardwareMonitor: https://openhardwaremonitor.org/
echo   Keep it running alongside EZ PC System Health.
echo  ============================================================
echo.

:: ----------------------------------------------------------------
:: STEP 6 - Launch the app
:: ----------------------------------------------------------------
echo  [..] Starting EZ PC System Health...
echo       Dashboard will open at: http://localhost:4000
echo.
echo  Press Ctrl+C to stop the server.
echo.
call npm start
pause
