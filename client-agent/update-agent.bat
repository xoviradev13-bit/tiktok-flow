@echo off
chcp 65001 >nul
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo [*] Dang mo hop thoai Quan tri vien (UAC)...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

set "PF=%ProgramFiles%\TikTokFlow\ClientAgent"

echo [*] Dung process agent cu tren cong 39741...
schtasks /end /tn "TikTokFlow_Agent_Daemon" >nul 2>nul
powershell -NoProfile -Command "$ports = @(39741); foreach ($p in $ports) { $procs = (Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue).OwningProcess; foreach ($procId in $procs) { if ($procId -gt 0) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } } }; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*agent.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>nul

echo [*] Cap nhat agent.js moi nhat sang "%PF%"...
copy /y "%~dp0agent.js" "%PF%\agent.js" >nul
copy /y "%~dp0run-agent.bat" "%PF%\run-agent.bat" >nul
copy /y "%~dp0run-agent-silent.vbs" "%PF%\run-agent-silent.vbs" >nul
if errorlevel 1 (
  echo [LOI] Khong the copy vao %PF%. Vui long kiem tra quyen Administrator.
  pause
  exit /b 1
)

echo [*] Khoi dong lai Client Agent Daemon...
schtasks /run /tn "TikTokFlow_Agent_Daemon" >nul 2>nul

echo.
echo ========================================================
echo   [THANH CONG] DA CAP NHAT VA KHOI DONG LAI CLIENT AGENT!
echo ========================================================
timeout /t 3 >nul
