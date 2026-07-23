@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo ======================================================
echo  daily-workbench Windows build
echo ======================================================

where node >nul 2>nul
if errorlevel 1 goto :nonode
echo [OK] Node.js found
goto :rustcheck
:nonode
echo [ERROR] Node.js not found. Install LTS from https://nodejs.org
pause
exit /b 1

:rustcheck
where cargo >nul 2>nul
if errorlevel 1 goto :installrust
echo [OK] Rust found
goto :checkmsvc
:installrust
echo [INFO] Rust not found, installing via rustup (needs internet, a few hundred MB)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri https://win.rustup.rs/x86_64 -OutFile \"$env:TEMP\rustup-init.exe\""
if not exist "%TEMP%\rustup-init.exe" goto :rustfail
echo [INFO] Installing Rust (you will see download/install progress)...
"%TEMP%\rustup-init.exe" -y
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
where cargo >nul 2>nul
if errorlevel 1 goto :rustfail
goto :checkmsvc
:rustfail
echo [ERROR] Rust install failed. Visit https://rustup.rs and install manually, then re-run.
pause
exit /b 1

:checkmsvc
where link >nul 2>nul
if errorlevel 1 goto :msvcwarn
goto :deps
:msvcwarn
echo [WARN] MSVC linker (link.exe) not found. cargo tauri build needs Visual Studio Build Tools.
echo   Install: https://visualstudio.microsoft.com/zh-hans/visual-cpp-build-tools/
echo   Check "Desktop development with C++" (MSVC + Windows 10/11 SDK).
echo   If already installed, run this script from "Developer Command Prompt" or "x64 Native Tools Command Prompt".
pause
goto :deps

:deps
if not exist node_modules goto :installdeps
echo [1/3] deps exist, skip install
goto :frontend
:installdeps
echo [1/3] installing frontend deps (may take 1-2 min)...
call npm install
if errorlevel 1 goto :deperr
goto :frontend
:deperr
echo [ERROR] npm install failed. Check network or Node version.
pause
exit /b 1

:frontend
echo [2/3] building frontend (vite build)...
call npm run build:web
if errorlevel 1 goto :builderr
goto :tauri
:builderr
echo [ERROR] frontend build failed.
pause
exit /b 1

:tauri
echo [3/3] cargo tauri build (first time pulls and compiles Rust deps, may take 10+ min)...
call npm run build
if errorlevel 1 goto :taurierr
goto :done
:taurierr
echo [ERROR] build failed. Common causes: missing MSVC linker / WebView2 / network. See hints above.
pause
exit /b 1

:done
echo ======================================================
echo  BUILD OK. Installer / exe at:
echo  src-tauri\target\release\bundle\
echo ======================================================
pause
