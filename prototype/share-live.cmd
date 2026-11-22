@echo off
setlocal
cd /d "%~dp0"

where bun >nul 2>nul
if errorlevel 1 (
  echo Bun was not found on PATH.
  echo Install Bun from https://bun.sh and try again.
  pause
  exit /b 1
)

netstat -ano | findstr /R /C:":8787 " | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo Port 8787 is already in use. Close the existing server window first.
  pause
  exit /b 1
)

echo ============================================================
echo WARNING: LIVE LAN SHARING
echo This exposes the local proxy to your local network.
echo Anyone who can reach port 8787 can send questions and spend
echo the API quota configured in .env. There is no login or quota.
echo Use a disposable or low-limit key, and close the server after.
echo Do NOT expose this port to the public internet.
echo ============================================================
echo.
set /p CONFIRM=Type YES to continue:
if /I not "%CONFIRM%"=="YES" (
  echo Cancelled.
  pause
  exit /b 1
)

set HOST=0.0.0.0
set MOCK_LLM=

echo Starting the live server for your local network...
start "Perspective Protocol Share (Live)" cmd /k "bun server.js"
"%SystemRoot%\System32\ping.exe" -n 3 127.0.0.1 >nul
start "" "http://127.0.0.1:8787"

echo.
echo The server window prints the LAN URL(s), for example:
echo   http://192.168.1.10:8787
echo Use that URL from another computer on the same Wi-Fi / LAN.
echo If Windows Firewall asks, allow Private networks.
pause
