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

set HOST=0.0.0.0
set MOCK_LLM=1

echo Starting the mock demo for your local network...
echo Mock mode: no model API is called and no API credits are used.
echo.
start "Perspective Protocol Share (Mock)" cmd /k "bun server.js"
"%SystemRoot%\System32\ping.exe" -n 3 127.0.0.1 >nul
start "" "http://127.0.0.1:8787"

echo.
echo The server window prints the LAN URL(s), for example:
echo   http://192.168.1.10:8787
echo Use that URL from another computer on the same Wi-Fi / LAN.
echo If Windows Firewall asks, allow Private networks.
pause
