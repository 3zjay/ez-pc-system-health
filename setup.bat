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
:: Helper: refresh PATH so freshly installed tools are visible
:: ----------------------------------------------------------------
:: After winget installs a package, the current cmd session PATH is stale.
:: We reload PATH from the registry before calling node/npm.
call :REFRESH_PATH

:: ----------------------------------------------------------------
:: STEP 2 - Check for Node.js (v18+)
:: ----------------------------------------------------------------
where node >nul 2>&1
if %errorlevel% neq 0 (
    :: Also check the well-known install location directly
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE_EXE=C:\Program Files\nodejs\node.exe"
        set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
        goto :NODE_FOUND
    )
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
    call :REFRESH_PATH
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE_EXE=C:\Program Files\nodejs\node.exe"
        set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
        goto :NODE_FOUND
    )
    echo  [!] Node.js installed but not found at expected path.
    echo      Please CLOSE this window and re-run setup.bat
    echo      so that Node.js is recognized by your terminal.
    pause
    exit /b 0
) else (
    set "NODE_EXE=node"
    set "NPM_CMD=npm"
)

:NODE_FOUND
for /f "tokens=1" %%v in ('"!NODE_EXE!" -v 2^>nul') do set NODE_VER=%%v
echo  [OK] Node.js found: !NODE_VER!

:: Check major version >= 18
for /f "tokens=1 delims=v." %%m in ("!NODE_VER!") do set MAJOR=%%m
for /f "tokens=2 delims=v." %%m in ("!NODE_VER!") do set MAJOR=%%m
if !MAJOR! lss 18 (
    echo.
    echo  [!] Node.js !NODE_VER! is too old. Version 18 or higher required.
    echo      Upgrading via winget...
    winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    call :REFRESH_PATH
    set "NODE_EXE=C:\Program Files\nodejs\node.exe"
    set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
    echo  [OK] Node.js upgraded.
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
    call :REFRESH_PATH
    echo  [OK] Git installed.
) else (
    for /f "tokens=3" %%v in ('git --version') do set GIT_VER=%%v
    echo  [OK] Git found: !GIT_VER!
)

:: ----------------------------------------------------------------
:: STEP 3b - Check / Install HWiNFO64 (for Windows detailed sensors)
:: ----------------------------------------------------------------
if exist "C:\Program Files\HWiNFO64\HWiNFO64.exe" (
    echo  [OK] HWiNFO64 detected.
    goto :HWINFO_DONE
)

:: Registry check fallback
reg query "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall" /s /f "HWiNFO" >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK] HWiNFO64 detected via registry.
    goto :HWINFO_DONE
)

echo.
echo  [..] HWiNFO64 not found. Installing via winget for detailed hardware sensors...
winget install --id REALiX.HWiNFO --silent --accept-package-agreements --accept-source-agreements
if %errorlevel% neq 0 (
    echo  [!] HWiNFO64 installation failed. You can install it manually from: https://www.hwinfo.com/
) else (
    echo  [OK] HWiNFO64 installed successfully.
)

:HWINFO_DONE

:: ----------------------------------------------------------------
:: STEP 4 - Install npm dependencies
:: ----------------------------------------------------------------
echo.
echo  [..] Installing project dependencies (npm install)...
call "!NPM_CMD!" install
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
"!NODE_EXE!" server/index.js
pause
goto :EOF

:: ----------------------------------------------------------------
:: Subroutine: Refresh PATH from Machine + User registry values
:: ----------------------------------------------------------------
:REFRESH_PATH
    for /f "skip=2 tokens=2,*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "MACHINE_PATH=%%b"
    for /f "skip=2 tokens=2,*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "USER_PATH=%%b"
    set "PATH=!MACHINE_PATH!;!USER_PATH!"
goto :EOF
