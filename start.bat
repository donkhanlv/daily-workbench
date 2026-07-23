@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto :nonode
if not exist node_modules goto :inst
goto :run
:nonode
echo [ERROR] Node.js not found. Install LTS from https://nodejs.org
pause
exit /b 1
:inst
echo [1/2] installing frontend deps...
call npm install
if errorlevel 1 goto :deperr
goto :run
:deperr
echo [ERROR] npm install failed.
pause
exit /b 1
:run
echo [2/2] starting browser preview (no Rust needed)...
start "daily-workbench" cmd /c "npm run dev:web"
timeout /t 4 >nul
start "" http://localhost:1420
echo Opened http://localhost:1420 — if not auto-opened, visit it manually.
echo Close the server window or press Ctrl+C there to stop.
pause
