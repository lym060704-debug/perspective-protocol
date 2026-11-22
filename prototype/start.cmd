@echo off
cd /d "%~dp0"
where bun >nul 2>nul
if errorlevel 1 (
  echo Bun was not found on PATH.
  echo Install Bun from https://bun.sh and try again.
  pause
  exit /b 1
)
start "Perspective Protocol Server" cmd /k "bun server.js"
"%SystemRoot%\System32\ping.exe" -n 3 127.0.0.1 >nul
start "" "http://127.0.0.1:8787"
