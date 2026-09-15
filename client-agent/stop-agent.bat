@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "NSSM=%~dp0bin\nssm.exe"
if exist "%ProgramFiles%\TikTokFlow\ClientAgent\bin\nssm.exe" (
  set "NSSM=%ProgramFiles%\TikTokFlow\ClientAgent\bin\nssm.exe"
)

echo [*] Stop TikTokFlowAgent Service (neu co)...
"%NSSM%" stop TikTokFlowAgent >nul 2>nul

echo [*] Kill process agent.js...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*agent.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>nul

echo [OK] Agent da dung.
pause
